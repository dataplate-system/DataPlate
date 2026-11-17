import unittest
from datetime import datetime, timedelta

from apoio import TesteComBanco

from app.models import Role
from app.routers.clientes import router


class ResumoClienteTest(TesteComBanco):
    routers = (router,)

    def setUp(self):
        super().setUp()
        self.cliente = self.criar_cliente()
        self.prato = self.criar_produto()
        self.bebida = self.criar_produto()
        self.hoje = datetime.now()

    def resumo(self, cliente=None):
        resposta = self.client.get(f"/api/clientes/{(cliente or self.cliente).id}/resumo")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        return resposta.json()

    def test_calcula_totais_sem_os_pedidos_cancelados(self):
        antigo = self.criar_pedido([(self.prato, 2, 30), (self.bebida, 1, 10)], status=4,
                                   data_hora=self.hoje - timedelta(days=40), cliente=self.cliente)
        aberto = self.criar_pedido([(self.prato, 1, 30)], status=1, data_hora=self.hoje, cliente=self.cliente)
        self.criar_pedido([(self.bebida, 9, 10)], status=5, data_hora=self.hoje, cliente=self.cliente)
        # Pedido de outro cliente nao entra.
        self.criar_pedido([(self.bebida, 5, 10)], status=4, data_hora=self.hoje, cliente=self.criar_cliente())

        corpo = self.resumo()
        self.assertEqual(corpo["clienteId"], self.cliente.id)
        self.assertEqual(corpo["totalPedidos"], 2)
        self.assertEqual(corpo["totalGasto"], 100)
        self.assertEqual(corpo["ticketMedio"], 50)
        self.assertEqual(corpo["pratoMaisPedido"]["produtoId"], self.prato.id)
        self.assertEqual(corpo["pratoMaisPedido"]["quantidade"], 3)
        self.assertEqual(corpo["primeiraCompra"][:10], antigo.data_hora.date().isoformat())
        self.assertEqual(corpo["ultimaCompra"][:10], aberto.data_hora.date().isoformat())
        self.assertEqual(len(corpo["gastoPorMes"]), 6)
        self.assertEqual(sum(mes["valor"] for mes in corpo["gastoPorMes"]), 100)
        self.assertEqual(sum(mes["pedidos"] for mes in corpo["gastoPorMes"]), 2)
        self.assertEqual(corpo["gastoPorMes"][-1]["mes"], self.hoje.strftime("%Y-%m"))
        self.assertEqual([pedido["id"] for pedido in corpo["ultimosPedidos"]], [aberto.id, antigo.id])
        self.assertEqual(corpo["ultimosPedidos"][0]["status"], "RECEBIDO")
        self.assertEqual(corpo["ultimosPedidos"][1]["itens"][0]["quantidade"], 2)
        self.assertFalse(corpo["clienteFrequente"])

    def test_pedido_cancelado_nao_altera_total_gasto_nem_ticket_medio(self):
        self.criar_pedido([(self.prato, 1, 50)], status=4, data_hora=self.hoje, cliente=self.cliente)
        antes = self.resumo()
        self.criar_pedido([(self.prato, 1, 999)], status=5, data_hora=self.hoje, cliente=self.cliente)
        depois = self.resumo()
        for campo in ("totalGasto", "ticketMedio", "totalPedidos", "gastoPorMes", "ultimosPedidos"):
            self.assertEqual(antes[campo], depois[campo], campo)
        self.assertEqual(depois["totalGasto"], 50)
        self.assertEqual(depois["ticketMedio"], 50)

    def test_cliente_sem_pedidos(self):
        corpo = self.resumo()
        self.assertEqual(corpo["totalPedidos"], 0)
        self.assertEqual(corpo["totalGasto"], 0)
        self.assertEqual(corpo["ticketMedio"], 0)
        self.assertIsNone(corpo["pratoMaisPedido"])
        self.assertIsNone(corpo["primeiraCompra"])
        self.assertIsNone(corpo["ultimaCompra"])
        self.assertEqual(corpo["ultimosPedidos"], [])
        self.assertEqual([mes["valor"] for mes in corpo["gastoPorMes"]], [0] * 6)
        self.assertFalse(corpo["clienteFrequente"])

    def test_cliente_frequente_tem_cinco_pedidos_nos_ultimos_30_dias(self):
        for dias in range(4):
            self.criar_pedido([(self.prato, 1, 10)], status=4, data_hora=self.hoje - timedelta(days=dias), cliente=self.cliente)
        self.criar_pedido([(self.prato, 1, 10)], status=4, data_hora=self.hoje - timedelta(days=45), cliente=self.cliente)
        # Cancelado nao conta para o selo.
        self.criar_pedido([(self.prato, 1, 10)], status=5, data_hora=self.hoje, cliente=self.cliente)
        corpo = self.resumo()
        self.assertEqual(corpo["pedidosUltimos30Dias"], 4)
        self.assertFalse(corpo["clienteFrequente"])

        self.criar_pedido([(self.prato, 1, 10)], status=4, data_hora=self.hoje - timedelta(days=10), cliente=self.cliente)
        corpo = self.resumo()
        self.assertEqual(corpo["pedidosUltimos30Dias"], 5)
        self.assertTrue(corpo["clienteFrequente"])

    def test_lista_somente_os_dez_pedidos_mais_recentes(self):
        ids = [
            self.criar_pedido([(self.prato, 1, 10)], status=4, data_hora=self.hoje - timedelta(hours=horas), cliente=self.cliente).id
            for horas in range(12)
        ]
        corpo = self.resumo()
        self.assertEqual(corpo["totalPedidos"], 12)
        self.assertEqual([pedido["id"] for pedido in corpo["ultimosPedidos"]], ids[:10])

    def test_resumo_so_para_o_gerente(self):
        for perfil in (Role.CAIXA, Role.FUNCIONARIO, Role.COZINHA, Role.ADMIN):
            self.usuario.role = perfil
            resposta = self.client.get(f"/api/clientes/{self.cliente.id}/resumo")
            self.assertEqual(resposta.status_code, 403, perfil)

    def test_cliente_inexistente(self):
        self.assertEqual(self.client.get("/api/clientes/999999999/resumo").status_code, 404)


if __name__ == "__main__":
    unittest.main()
