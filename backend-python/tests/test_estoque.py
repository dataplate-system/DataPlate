import unittest
from decimal import Decimal

from apoio import TesteComBanco
from sqlalchemy import select

from app.estoque import TIPO_AJUSTE_MANUAL, TIPO_AJUSTE_PEDIDO, TIPO_BAIXA_PEDIDO
from app.models import EstoqueMovimento, Pedido
from app.routers.insumos import router as insumos_router
from app.routers.pedidos import router as pedidos_router


class EstoqueTest(TesteComBanco):
    routers = (pedidos_router, insumos_router)

    def setUp(self):
        super().setUp()
        self.produto = self.criar_produto()
        self.insumo = self.criar_insumo(atual="10.000", minima="1.000")
        self.criar_ficha(self.produto, self.insumo, "0.200")

    def saldo(self):
        self.db.expire_all()
        return self.db.get(type(self.insumo), self.insumo.id).quantidade_atual

    def movimentos(self):
        return self.db.scalars(select(EstoqueMovimento).where(EstoqueMovimento.insumo_id == self.insumo.id).order_by(EstoqueMovimento.id)).all()

    def alterar_status(self, pedido, status, **campos):
        resposta = self.client.put(f"/api/pedidos/{pedido.id}/status", json={"status": status, **campos})
        self.assertEqual(resposta.status_code, 200, resposta.text)
        return resposta

    def test_baixa_ao_entrar_em_preparo_e_nao_repete(self):
        pedido = self.criar_pedido([(self.produto, 2, 10)])
        self.assertEqual(self.saldo(), Decimal("10.000"))
        self.alterar_status(pedido, "EM_PREPARO")
        self.assertEqual(self.saldo(), Decimal("9.600"))
        self.alterar_status(pedido, "PRONTO")
        self.assertEqual(self.saldo(), Decimal("9.600"))
        movimentos = self.movimentos()
        self.assertEqual(len(movimentos), 1)
        self.assertEqual(movimentos[0].tipo, TIPO_BAIXA_PEDIDO)
        self.assertEqual(movimentos[0].quantidade, Decimal("-0.400"))
        self.assertEqual(movimentos[0].saldo_apos, Decimal("9.600"))
        self.assertEqual(movimentos[0].id_pedido, pedido.id)

    def test_pedido_que_vai_direto_para_pronto_tambem_baixa(self):
        pedido = self.criar_pedido([(self.produto, 1, 10)])
        self.alterar_status(pedido, "PRONTO")
        self.assertEqual(self.saldo(), Decimal("9.800"))

    def test_cancelar_antes_do_preparo_nao_movimenta(self):
        pedido = self.criar_pedido([(self.produto, 2, 10)])
        self.alterar_status(pedido, "CANCELADO", motivo="Cliente desistiu")
        self.assertEqual(self.saldo(), Decimal("10.000"))
        self.assertEqual(self.movimentos(), [])

    def test_cancelar_depois_do_preparo_mantem_a_baixa(self):
        pedido = self.criar_pedido([(self.produto, 2, 10)])
        self.alterar_status(pedido, "EM_PREPARO")
        self.alterar_status(pedido, "CANCELADO", motivo="Cliente desistiu")
        self.assertEqual(self.saldo(), Decimal("9.600"))

    def editar(self, pedido, quantidade):
        self.db.expire_all()
        atual = self.db.get(Pedido, pedido.id)
        return self.client.put(f"/api/pedidos/{pedido.id}/itens", json={
            "atualizadoEm": atual.atualizado_em.isoformat(),
            "itens": [{"produtoId": self.produto.id, "quantidade": quantidade}],
            "motivo": "Cliente mudou o pedido",
        })

    def test_edicao_em_preparo_ajusta_somente_a_diferenca(self):
        pedido = self.criar_pedido([(self.produto, 2, 10)])
        self.alterar_status(pedido, "EM_PREPARO")
        self.assertEqual(self.editar(pedido, 3).status_code, 200)
        self.assertEqual(self.saldo(), Decimal("9.400"))
        self.assertEqual(self.editar(pedido, 1).status_code, 200)
        self.assertEqual(self.saldo(), Decimal("9.800"))
        self.assertEqual([m.tipo for m in self.movimentos()], [TIPO_BAIXA_PEDIDO, TIPO_AJUSTE_PEDIDO, TIPO_AJUSTE_PEDIDO])

    def test_edicao_antes_do_preparo_nao_movimenta(self):
        pedido = self.criar_pedido([(self.produto, 2, 10)])
        self.assertEqual(self.editar(pedido, 5).status_code, 200)
        self.assertEqual(self.movimentos(), [])
        self.alterar_status(pedido, "EM_PREPARO")
        self.assertEqual(self.saldo(), Decimal("9.000"))

    def test_venda_de_caixa_entregue_na_hora_baixa_e_registra_pagamento(self):
        self.produto.tempo_preparo = 0
        self.db.flush()
        resposta = self.client.post("/api/pedidos", json={
            "vendaCaixa": True, "formaPagamento": "pix", "itens": [{"produtoId": self.produto.id, "quantidade": 1}],
        })
        self.assertEqual(resposta.status_code, 201, resposta.text)
        self.assertEqual(resposta.json()["status"], "ENTREGUE")
        self.assertEqual(self.saldo(), Decimal("9.800"))
        pedido = self.db.get(Pedido, resposta.json()["id"])
        self.assertIsNotNone(pedido.pago_em)
        self.assertEqual(pedido.forma_pagamento, "PIX")

    def test_fechar_pedido_registra_pagamento(self):
        pedido = self.criar_pedido([(self.produto, 1, 10)], status=6)
        self.usuario.role = "CAIXA"
        self.alterar_status(pedido, "ENTREGUE", formaPagamento="debito")
        self.db.expire_all()
        fechado = self.db.get(Pedido, pedido.id)
        self.assertIsNotNone(fechado.pago_em)
        self.assertEqual(fechado.forma_pagamento, "DEBITO")

    def test_avisa_somente_quando_atinge_o_minimo(self):
        self.insumo.quantidade_atual = Decimal("1.300")
        self.db.flush()
        self.alterar_status(self.criar_pedido([(self.produto, 1, 10)]), "EM_PREPARO")
        self.publicar_estoque_baixo.assert_called_with([])
        self.alterar_status(self.criar_pedido([(self.produto, 1, 10)]), "EM_PREPARO")
        criticos = self.publicar_estoque_baixo.call_args.args[0]
        self.assertEqual([item["id"] for item in criticos], [self.insumo.id])
        # Ja estava abaixo do minimo: nao avisa de novo.
        self.alterar_status(self.criar_pedido([(self.produto, 1, 10)]), "EM_PREPARO")
        self.publicar_estoque_baixo.assert_called_with([])

    def test_estoque_insuficiente_nao_bloqueia_a_cozinha(self):
        self.insumo.quantidade_atual = Decimal("0.100")
        self.db.flush()
        self.alterar_status(self.criar_pedido([(self.produto, 1, 10)]), "EM_PREPARO")
        self.assertEqual(self.saldo(), Decimal("-0.100"))

    def test_ajuste_no_cadastro_registra_movimento_e_lista(self):
        self.usuario.id = self.criar_usuario().id
        resposta = self.client.put(f"/api/insumos/{self.insumo.id}", json={
            "nome": self.insumo.nome, "unidade": "kg", "quantidadeAtual": 12.5, "quantidadeMinima": 1, "custoUnitario": 2,
        })
        self.assertEqual(resposta.status_code, 200, resposta.text)
        movimento = self.movimentos()[-1]
        self.assertEqual(movimento.tipo, TIPO_AJUSTE_MANUAL)
        self.assertEqual(movimento.quantidade, Decimal("2.500"))
        lista = self.client.get("/api/insumos/movimentos?limite=1").json()
        self.assertEqual(lista[0]["id"], movimento.id)
        self.assertEqual(lista[0]["insumoNome"], self.insumo.nome)
        self.assertEqual(lista[0]["usuarioNome"], "Usuario de teste")

    def test_ajuste_sem_mudanca_de_quantidade_nao_registra(self):
        resposta = self.client.put(f"/api/insumos/{self.insumo.id}", json={
            "nome": self.insumo.nome, "unidade": "kg", "quantidadeAtual": 10, "quantidadeMinima": 2, "custoUnitario": 2,
        })
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(self.movimentos(), [])


if __name__ == "__main__":
    unittest.main()
