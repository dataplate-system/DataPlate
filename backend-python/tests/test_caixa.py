import unittest
from datetime import datetime, timedelta

from apoio import TesteComBanco

from app.models import Role
from app.routers.caixa import router


class TurnoCaixaTest(TesteComBanco):
    routers = (router,)

    def setUp(self):
        super().setUp()
        self.usuario.role = Role.CAIXA
        self.usuario.id = self.criar_usuario(role=Role.CAIXA).id
        self.produto = self.criar_produto()

    def atual(self):
        resposta = self.client.get("/api/caixa/turnos/atual")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        return resposta.json()

    def abrir(self, valor=100):
        return self.client.post("/api/caixa/turnos", json={"valorInicial": valor})

    def fechar(self, turno_id, contado, **extra):
        return self.client.put(f"/api/caixa/turnos/{turno_id}/fechar", json={"valorContado": contado, **extra})

    def pagar(self, valor, forma, quando, status=4):
        return self.criar_pedido([(self.produto, 1, valor)], status=status, data_hora=quando, pago_em=quando, forma_pagamento=forma)

    def test_abre_consulta_e_nao_permite_dois_turnos_abertos(self):
        self.assertIsNone(self.atual())
        resposta = self.abrir(100)
        self.assertEqual(resposta.status_code, 201, resposta.text)
        turno = resposta.json()
        self.assertTrue(turno["aberto"])
        self.assertEqual(turno["valorInicial"], 100)
        self.assertEqual(turno["abertoPor"], "Usuario de teste")
        self.assertEqual(turno["valorEsperadoDinheiro"], 100)
        self.assertEqual(turno["totais"]["totalVendas"], 0)
        self.assertIsNone(turno["diferenca"])
        self.assertEqual(self.atual()["id"], turno["id"])
        self.assertEqual(self.abrir(50).status_code, 409)

    def test_fechamento_soma_por_forma_de_pagamento_e_calcula_a_diferenca(self):
        turno = self.abrir(100).json()
        abertura = datetime.fromisoformat(turno["abertoEm"])
        # Pago antes da abertura: pertence ao turno anterior.
        self.pagar(40, "DINHEIRO", abertura - timedelta(minutes=5))
        self.pagar(30, "PIX", abertura)
        self.pagar(20, "DINHEIRO", abertura)
        self.pagar(25, "dinheiro", abertura)
        self.pagar(15, "DEBITO", abertura)
        self.pagar(10, "CREDITO", abertura)
        self.pagar(99, "PIX", abertura, status=5)  # cancelado fica fora
        self.criar_pedido([(self.produto, 1, 7)], status=1, data_hora=abertura)  # em aberto, sem pagamento

        atual = self.atual()
        self.assertEqual(atual["totais"], {"pix": 30, "debito": 15, "credito": 10, "dinheiro": 45, "outros": 0,
                                           "totalVendas": 100, "quantidadeVendas": 5})
        self.assertEqual(atual["valorEsperadoDinheiro"], 145)

        resposta = self.fechar(turno["id"], 140, observacao="Faltou troco")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        fechado = resposta.json()
        self.assertFalse(fechado["aberto"])
        self.assertEqual(fechado["valorContado"], 140)
        self.assertEqual(fechado["valorEsperadoDinheiro"], 145)
        self.assertEqual(fechado["diferenca"], -5)
        self.assertEqual(fechado["fechadoPor"], "Usuario de teste")
        self.assertEqual(fechado["observacao"], "Faltou troco")
        self.assertEqual(fechado["totais"]["totalVendas"], 100)
        self.assertIsNone(self.atual())
        self.assertEqual(self.fechar(turno["id"], 140).status_code, 409)

    def test_sobra_de_dinheiro_fica_positiva_e_sem_diferenca_fica_zero(self):
        turno = self.abrir(50).json()
        self.assertEqual(self.fechar(turno["id"], 60).json()["diferenca"], 10)
        turno = self.abrir(50).json()
        self.assertEqual(self.fechar(turno["id"], 50).json()["diferenca"], 0)

    def test_venda_depois_do_fechamento_nao_entra_no_turno_fechado(self):
        turno = self.abrir(0).json()
        fechado = self.fechar(turno["id"], 0).json()
        self.pagar(80, "DINHEIRO", datetime.fromisoformat(fechado["fechadoEm"]) + timedelta(minutes=1))
        self.usuario.role = Role.GERENTE
        historico = {t["id"]: t for t in self.client.get("/api/caixa/turnos").json()}
        self.assertEqual(historico[turno["id"]]["totais"]["dinheiro"], 0)

    def test_historico_so_para_o_gerente_e_sem_o_turno_aberto(self):
        turno = self.abrir(100).json()
        self.assertEqual(self.fechar(turno["id"], 100).status_code, 200)
        self.assertEqual(self.client.get("/api/caixa/turnos").status_code, 403)

        self.usuario.role = Role.GERENTE
        lista = self.client.get("/api/caixa/turnos").json()
        self.assertEqual(lista[0]["id"], turno["id"])
        self.assertEqual(lista[0]["diferenca"], 0)
        self.assertEqual(lista[0]["abertoPor"], "Usuario de teste")

        aberto = self.abrir(10).json()
        self.assertNotIn(aberto["id"], [item["id"] for item in self.client.get("/api/caixa/turnos").json()])

    def test_gerente_tambem_abre_e_fecha(self):
        self.usuario.role = Role.GERENTE
        turno = self.abrir(10).json()
        self.assertEqual(self.fechar(turno["id"], 10).status_code, 200)

    def test_outros_perfis_nao_mexem_no_caixa(self):
        for perfil in (Role.COZINHA, Role.FUNCIONARIO, Role.ADMIN):
            self.usuario.role = perfil
            self.assertEqual(self.abrir(10).status_code, 403, perfil)
            self.assertEqual(self.client.get("/api/caixa/turnos/atual").status_code, 403, perfil)

    def test_valores_negativos_sao_recusados(self):
        self.assertEqual(self.abrir(-1).status_code, 422)
        turno = self.abrir(10).json()
        self.assertEqual(self.fechar(turno["id"], -1).status_code, 422)
        self.assertEqual(self.fechar(999999999, 10).status_code, 404)


if __name__ == "__main__":
    unittest.main()
