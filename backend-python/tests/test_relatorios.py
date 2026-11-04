import unittest
from datetime import datetime
from decimal import Decimal

from apoio import TesteComBanco

from app import bcg
from app.models import Role
from app.routers.relatorios import router


FEVEREIRO = datetime(2001, 2, 10, 12)
JANEIRO = datetime(2001, 1, 10, 12)
PERIODO = "inicio=2001-02-01&fim=2001-02-28"


class ClassificacaoBcgTest(unittest.TestCase):
    def test_quatro_quadrantes(self):
        self.assertEqual(bcg.classificar(10, 5, 3, True), bcg.ESTRELA)
        self.assertEqual(bcg.classificar(10, -5, 3, True), bcg.VACA_LEITEIRA)
        self.assertEqual(bcg.classificar(1, 5, 3, True), bcg.INTERROGACAO)
        self.assertEqual(bcg.classificar(1, -5, 3, True), bcg.ABACAXI)

    def test_crescimento_zero_nao_conta_como_crescimento(self):
        self.assertEqual(bcg.classificar(10, 0, 3, True), bcg.VACA_LEITEIRA)

    def test_produto_novo_com_vendas_conta_como_crescimento(self):
        self.assertEqual(bcg.classificar(10, None, 3, True), bcg.ESTRELA)
        self.assertEqual(bcg.classificar(1, None, 3, True), bcg.INTERROGACAO)

    def test_produto_sem_vendas_e_abacaxi(self):
        self.assertEqual(bcg.classificar(0, None, 0, False), bcg.ABACAXI)

    def test_crescimento_percentual(self):
        self.assertEqual(bcg.crescimento_percentual(Decimal("150"), Decimal("100")), 50)
        self.assertEqual(bcg.crescimento_percentual(Decimal("50"), Decimal("100")), -50)
        self.assertIsNone(bcg.crescimento_percentual(Decimal("50"), Decimal("0")))


class RelatoriosTest(TesteComBanco):
    routers = (router,)

    def setUp(self):
        super().setUp()
        self.produto = self.criar_produto()

    def test_matriz_bcg_classifica_e_compara_com_periodo_anterior(self):
        estrela, vaca, interrogacao, abacaxi, novo = (self.criar_produto() for _ in range(5))
        sem_vendas = self.criar_produto()
        for produto, atual, anterior in ((estrela, 5000, 1000), (vaca, 5000, 9000), (interrogacao, 10, 5), (abacaxi, 10, 20)):
            self.criar_pedido([(produto, 1, atual)], status=4, data_hora=FEVEREIRO)
            self.criar_pedido([(produto, 1, anterior)], status=4, data_hora=JANEIRO)
        self.criar_pedido([(novo, 1, 10)], status=4, data_hora=FEVEREIRO)
        # Cancelado nao entra na conta.
        self.criar_pedido([(abacaxi, 1, 99999)], status=5, data_hora=FEVEREIRO)

        resposta = self.client.get(f"/api/relatorios/bcg?{PERIODO}")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        corpo = resposta.json()
        self.assertEqual(corpo["inicioAnterior"], "2001-01-04")
        self.assertEqual(corpo["fimAnterior"], "2001-01-31")
        self.assertEqual(corpo["faturamentoTotal"], 10030)
        self.assertEqual(corpo["faturamentoAnterior"], 10025)
        itens = {item["produtoId"]: item for item in corpo["itens"]}
        self.assertEqual(itens[estrela.id]["classificacao"], bcg.ESTRELA)
        self.assertEqual(itens[estrela.id]["crescimento"], 400)
        self.assertEqual(itens[vaca.id]["classificacao"], bcg.VACA_LEITEIRA)
        self.assertEqual(itens[interrogacao.id]["classificacao"], bcg.INTERROGACAO)
        self.assertEqual(itens[abacaxi.id]["classificacao"], bcg.ABACAXI)
        self.assertEqual(itens[novo.id]["classificacao"], bcg.INTERROGACAO)
        self.assertIsNone(itens[novo.id]["crescimento"])
        self.assertEqual(itens[sem_vendas.id]["classificacao"], bcg.ABACAXI)
        self.assertEqual(itens[estrela.id]["acaoSugerida"], bcg.ACOES[bcg.ESTRELA])
        self.assertAlmostEqual(sum(item["participacao"] for item in corpo["itens"]), 100, delta=0.1)

    def test_lucro_da_bcg_so_existe_com_ficha_tecnica(self):
        com_ficha = self.criar_produto()
        self.criar_ficha(com_ficha, self.criar_insumo(custo="10.00"), "1.000")
        self.criar_pedido([(com_ficha, 2, 50), (self.produto, 1, 50)], status=4, data_hora=FEVEREIRO)
        itens = {item["produtoId"]: item for item in self.client.get(f"/api/relatorios/bcg?{PERIODO}").json()["itens"]}
        self.assertEqual(itens[com_ficha.id]["lucro"], 80)
        self.assertTrue(itens[com_ficha.id]["temFichaTecnica"])
        self.assertIsNone(itens[self.produto.id]["lucro"])
        self.assertFalse(itens[self.produto.id]["temFichaTecnica"])

    def test_bcg_rejeita_periodo_invertido(self):
        self.assertEqual(self.client.get("/api/relatorios/bcg?inicio=2001-03-01&fim=2001-02-01").status_code, 422)

    def test_bcg_exige_perfil_de_gestao(self):
        self.usuario.role = Role.COZINHA
        self.assertEqual(self.client.get("/api/relatorios/bcg").status_code, 403)

    def test_separa_lancado_recebido_em_aberto_e_cancelado(self):
        self.criar_pedido([(self.produto, 1, 100)], status=4, data_hora=FEVEREIRO)  # entregue antigo, sem pago_em
        self.criar_pedido([(self.produto, 1, 50)], status=1, data_hora=FEVEREIRO)  # em aberto
        self.criar_pedido([(self.produto, 1, 30)], status=3, data_hora=FEVEREIRO, pago_em=FEVEREIRO)  # balcao pago
        self.criar_pedido([(self.produto, 1, 20)], status=5, data_hora=FEVEREIRO)  # cancelado
        for rota in ("vendas", "resumo"):
            corpo = self.client.get(f"/api/relatorios/{rota}?{PERIODO}").json()
            self.assertEqual(corpo["faturamento"], 180, rota)
            self.assertEqual(corpo["faturamentoRecebido"], 130, rota)
            self.assertEqual(corpo["faturamentoEmAberto"], 50, rota)
            self.assertEqual(corpo["valorCancelado"], 20, rota)

    def test_cardapio_nao_inventa_lucro_sem_ficha(self):
        com_ficha = self.criar_produto()
        self.criar_ficha(com_ficha, self.criar_insumo(custo="10.00"), "1.000")
        self.criar_pedido([(com_ficha, 1, 50), (self.produto, 1, 50)], status=4, data_hora=FEVEREIRO)
        corpo = self.client.get(f"/api/relatorios/cardapio?{PERIODO}").json()
        itens = {item["produtoId"]: item for item in corpo["topProdutos"]}
        self.assertEqual(itens[com_ficha.id]["lucro"], 40)
        self.assertIsNone(itens[self.produto.id]["lucro"])
        self.assertEqual(corpo["produtosSemFicha"], 1)
        self.assertEqual(self.client.get(f"/api/relatorios/vendas?{PERIODO}").json()["produtosSemFicha"], 1)


if __name__ == "__main__":
    unittest.main()
