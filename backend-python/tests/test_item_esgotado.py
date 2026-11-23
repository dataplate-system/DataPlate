"""Item esgotado no cardapio (#74): o atendente pausa o item e a API recusa novos pedidos dele."""
import unittest
from unittest.mock import patch

from sqlalchemy import func, select

from apoio import TesteComBanco
from app.models import Pedido, Role
from app.routers.pedidos import router as pedidos_router
from app.routers.produtos import router as produtos_router


class ItemEsgotadoTest(TesteComBanco):
    routers = (produtos_router, pedidos_router)

    def setUp(self):
        super().setUp()
        evento = patch("app.routers.produtos._publicar_disponibilidade")
        self.publicar_disponibilidade = evento.start()
        self.addCleanup(evento.stop)
        self.atendente = self.criar_usuario(Role.FUNCIONARIO)
        self.usuario = self.atendente
        self.produto = self.criar_produto(preco="32.00")

    def marcar(self, produto, esgotado=True, motivo=None):
        corpo = {"esgotado": esgotado}
        if motivo is not None:
            corpo["motivo"] = motivo
        return self.client.put(f"/api/produtos/{produto.id}/disponibilidade", json=corpo)

    def produto_na_lista(self, produto):
        resposta = self.client.get("/api/produtos")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        return next(item for item in resposta.json() if item["id"] == produto.id)

    def total_pedidos(self):
        return self.db.scalar(select(func.count(Pedido.id)))

    def test_atendente_marca_indisponivel_com_motivo(self):
        resposta = self.marcar(self.produto, motivo="  Acabou o salmão  ")

        self.assertEqual(resposta.status_code, 200, resposta.text)
        corpo = resposta.json()
        self.assertTrue(corpo["esgotado"])
        self.assertEqual(corpo["motivoEsgotado"], "Acabou o salmão")
        self.assertIsNotNone(corpo["esgotadoEm"])
        self.assertEqual(corpo["esgotadoPorNome"], self.atendente.nome)
        self.publicar_disponibilidade.assert_called_once()

        # A equipe ve quem marcou; o cliente ve o selo e o motivo, mas nao o nome do funcionario.
        self.assertEqual(self.produto_na_lista(self.produto)["esgotadoPorNome"], self.atendente.nome)
        self.anonimo = True
        publico = self.produto_na_lista(self.produto)
        self.assertTrue(publico["esgotado"])
        self.assertEqual(publico["motivoEsgotado"], "Acabou o salmão")
        self.assertIsNone(publico["esgotadoPorNome"])

    def test_motivo_e_opcional(self):
        resposta = self.marcar(self.produto)

        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertTrue(resposta.json()["esgotado"])
        self.assertIsNone(resposta.json()["motivoEsgotado"])

    def test_remarcar_troca_o_motivo_e_mantem_o_horario(self):
        primeiro = self.marcar(self.produto, motivo="Acabou").json()
        segundo = self.marcar(self.produto, motivo="Volta amanhã").json()

        self.assertEqual(segundo["motivoEsgotado"], "Volta amanhã")
        self.assertEqual(segundo["esgotadoEm"], primeiro["esgotadoEm"])

    def test_atendente_libera_o_item_de_novo(self):
        self.marcar(self.produto, motivo="Acabou")
        resposta = self.marcar(self.produto, esgotado=False)

        self.assertEqual(resposta.status_code, 200, resposta.text)
        corpo = resposta.json()
        self.assertFalse(corpo["esgotado"])
        self.assertIsNone(corpo["motivoEsgotado"])
        self.assertIsNone(corpo["esgotadoEm"])
        self.assertIsNone(corpo["esgotadoPorNome"])
        self.db.refresh(self.produto)
        self.assertIsNone(self.produto.esgotado_por)

    def test_gerente_tambem_pode_marcar(self):
        self.usuario = self.criar_usuario(Role.GERENTE)
        self.assertEqual(self.marcar(self.produto).status_code, 200)

    def test_cozinha_caixa_e_admin_nao_podem_marcar(self):
        for perfil in (Role.COZINHA, Role.CAIXA, Role.ADMIN):
            with self.subTest(perfil=perfil):
                self.usuario = self.criar_usuario(perfil)
                self.assertEqual(self.marcar(self.produto).status_code, 403)
        self.db.refresh(self.produto)
        self.assertFalse(self.produto.esgotado)

    def test_motivo_longo_e_recusado(self):
        self.assertEqual(self.marcar(self.produto, motivo="x" * 121).status_code, 422)

    def test_produto_inativo_nao_e_encontrado(self):
        self.produto.ativo = False
        self.db.flush()
        self.assertEqual(self.marcar(self.produto).status_code, 404)

    def test_cliente_nao_consegue_pedir_item_esgotado_pelo_qr_code(self):
        mesa = self.criar_mesa("ocupada")
        disponivel = self.criar_produto()
        self.marcar(self.produto, motivo="Acabou")
        antes = self.total_pedidos()
        self.anonimo = True

        resposta = self.client.post("/api/pedidos", json={
            "mesaToken": str(mesa.qr_code_token),
            "itens": [{"produtoId": disponivel.id, "quantidade": 1}, {"produtoId": self.produto.id, "quantidade": 1}],
        })

        self.assertEqual(resposta.status_code, 409, resposta.text)
        self.assertIn(self.produto.nome, resposta.json()["detail"])
        self.assertNotIn(disponivel.nome, resposta.json()["detail"])
        self.assertEqual(self.total_pedidos(), antes)

    def test_pedido_volta_a_ser_aceito_depois_de_liberar(self):
        mesa = self.criar_mesa("ocupada")
        self.marcar(self.produto)
        self.marcar(self.produto, esgotado=False)
        self.anonimo = True

        resposta = self.client.post("/api/pedidos", json={
            "mesaToken": str(mesa.qr_code_token),
            "itens": [{"produtoId": self.produto.id, "quantidade": 2}],
        })

        self.assertEqual(resposta.status_code, 201, resposta.text)

    def test_pdv_e_atendente_tambem_sao_recusados(self):
        self.marcar(self.produto)
        mesa = self.criar_mesa("ocupada")

        self.usuario = self.criar_usuario(Role.CAIXA)
        venda = self.client.post("/api/pedidos", json={
            "vendaCaixa": True,
            "formaPagamento": "PIX",
            "itens": [{"produtoId": self.produto.id, "quantidade": 1}],
        })
        self.assertEqual(venda.status_code, 409, venda.text)

        self.usuario = self.atendente
        salao = self.client.post("/api/pedidos", json={
            "numeroMesa": mesa.numero,
            "itens": [{"produtoId": self.produto.id, "quantidade": 1}],
        })
        self.assertEqual(salao.status_code, 409, salao.text)

    def test_varios_itens_esgotados_aparecem_na_mensagem(self):
        outro = self.criar_produto()
        self.marcar(self.produto)
        self.marcar(outro)
        self.anonimo = True

        resposta = self.client.post("/api/pedidos", json={
            "mesaToken": str(self.criar_mesa("ocupada").qr_code_token),
            "itens": [{"produtoId": self.produto.id, "quantidade": 1}, {"produtoId": outro.id, "quantidade": 1}],
        })

        self.assertEqual(resposta.status_code, 409)
        self.assertIn("Itens esgotados", resposta.json()["detail"])
        self.assertIn(self.produto.nome, resposta.json()["detail"])
        self.assertIn(outro.nome, resposta.json()["detail"])

    def test_edicao_mantem_item_ja_pedido_mas_nao_aumenta(self):
        pedido = self.criar_pedido([(self.produto, 1, "32.00")])
        self.marcar(self.produto)

        def editar(quantidade, motivo):
            return self.client.put(f"/api/pedidos/{pedido.id}/itens", json={
                "atualizadoEm": pedido.atualizado_em.isoformat(),
                "itens": [{"produtoId": self.produto.id, "quantidade": quantidade}],
                "observacoes": "Sem cebola",
                "motivo": motivo,
            })

        aumentar = editar(2, "Cliente pediu mais um")
        self.assertEqual(aumentar.status_code, 409, aumentar.text)

        manter = editar(1, "Cliente trocou a observacao")
        self.assertEqual(manter.status_code, 200, manter.text)
        self.assertEqual(manter.json()["itens"][0]["quantidade"], 1)

    def test_edicao_nao_acrescenta_item_esgotado(self):
        disponivel = self.criar_produto()
        pedido = self.criar_pedido([(disponivel, 1, "10.00")])
        self.marcar(self.produto)

        resposta = self.client.put(f"/api/pedidos/{pedido.id}/itens", json={
            "atualizadoEm": pedido.atualizado_em.isoformat(),
            "itens": [
                {"produtoId": disponivel.id, "quantidade": 1},
                {"produtoId": self.produto.id, "quantidade": 1},
            ],
            "motivo": "Cliente quer acrescentar",
        })

        self.assertEqual(resposta.status_code, 409, resposta.text)


if __name__ == "__main__":
    unittest.main()
