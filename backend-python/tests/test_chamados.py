import unittest
from unittest.mock import patch

from apoio import TesteComBanco
from app.limiter import chamados_qr_por_mesa_tipo
from app.models import ChamadoMesa, Role
from app.routers.chamados import router as chamados_router
from app.routers.mesas import router as mesas_router
from sqlalchemy import select


class ChamadosMesaTest(TesteComBanco):
    routers = (chamados_router, mesas_router)

    def setUp(self):
        super().setUp()
        self.anonimo = True
        chamados_qr_por_mesa_tipo.limpar()
        self.addCleanup(chamados_qr_por_mesa_tipo.limpar)
        evento = patch("app.routers.chamados._publicar_evento")
        evento.start()
        self.addCleanup(evento.stop)
        evento_mesa = patch("app.routers.mesas._publicar_evento")
        evento_mesa.start()
        self.addCleanup(evento_mesa.stop)

    def criar_chamado(self, mesa, tipo="ATENDENTE"):
        return self.client.post(
            f"/api/chamados/mesa?token={mesa.qr_code_token}",
            json={"tipo": tipo},
        )

    def test_recusa_chamado_quando_mesa_nao_esta_aberta(self):
        mesa = self.criar_mesa("livre")
        resposta = self.criar_chamado(mesa)

        self.assertEqual(resposta.status_code, 409)
        self.assertEqual(self.db.scalar(select(ChamadoMesa.id)), None)

    def test_cliente_abre_chamado_e_atendente_remove_da_fila(self):
        mesa = self.criar_mesa("ocupada")
        usuario = self.criar_usuario(Role.FUNCIONARIO)
        self.usuario = usuario

        criado = self.criar_chamado(mesa, "AGUA")
        self.assertEqual(criado.status_code, 201, criado.text)
        self.assertEqual(criado.json()["numeroMesa"], mesa.numero)
        self.assertEqual(len(self.client.get("/api/chamados").json()), 1)

        atendido = self.client.patch(f"/api/chamados/{criado.json()['id']}/atender")
        self.assertEqual(atendido.status_code, 200, atendido.text)
        self.assertEqual(self.client.get("/api/chamados").json(), [])
        self.assertEqual(
            self.client.get(f"/api/chamados/mesa?token={mesa.qr_code_token}").json(),
            [],
        )

    def test_impede_chamado_aberto_duplicado_e_repeticao_antes_de_dois_minutos(self):
        mesa = self.criar_mesa("ocupada")
        criado = self.criar_chamado(mesa, "CONTA")
        self.assertEqual(criado.status_code, 201, criado.text)

        duplicado = self.criar_chamado(mesa, "CONTA")
        self.assertEqual(duplicado.status_code, 409)

        usuario = self.criar_usuario(Role.GERENTE)
        self.usuario = usuario
        self.assertEqual(self.client.patch(f"/api/chamados/{criado.json()['id']}/atender").status_code, 200)

        repetido = self.criar_chamado(mesa, "CONTA")
        self.assertEqual(repetido.status_code, 429)
        self.assertGreater(int(repetido.headers["Retry-After"]), 0)

    def test_limite_e_por_tipo_de_chamado(self):
        mesa = self.criar_mesa("ocupada")
        self.assertEqual(self.criar_chamado(mesa, "ATENDENTE").status_code, 201)
        resposta = self.criar_chamado(mesa, "AGUA")
        self.assertEqual(resposta.status_code, 201, resposta.text)

    def test_fechamento_da_mesa_limpa_chamados_abertos(self):
        mesa = self.criar_mesa("ocupada")
        self.assertEqual(self.criar_chamado(mesa).status_code, 201)
        self.anonimo = False

        resposta = self.client.patch(
            f"/api/mesas/{mesa.id}/status",
            json={"status": "livre"},
        )

        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(self.client.get("/api/chamados").json(), [])
        self.assertEqual(
            self.client.get(f"/api/chamados/mesa?token={mesa.qr_code_token}").json(),
            [],
        )


if __name__ == "__main__":
    unittest.main()
