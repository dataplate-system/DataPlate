import unittest
from unittest.mock import patch

from apoio import TesteComBanco
from sqlalchemy import func, select

from app.limiter import pedidos_qr_por_mesa
from app.models import Pedido
from app.routers.mesas import router as mesas_router
from app.routers.pedidos import router as pedidos_router


class MesaQrTest(TesteComBanco):
    routers = (pedidos_router, mesas_router)

    def setUp(self):
        super().setUp()
        self.produto = self.criar_produto()
        self.anonimo = True

    def pedir(self, mesa):
        return self.client.post("/api/pedidos", json={
            "mesaToken": str(mesa.qr_code_token), "itens": [{"produtoId": self.produto.id, "quantidade": 1}],
        })

    def pedidos_da_mesa(self, mesa):
        return self.db.scalar(select(func.count(Pedido.id)).where(Pedido.id_mesa == mesa.id))

    def test_qr_de_mesa_fechada_nao_gera_pedido(self):
        for status in ("livre", "reservada", "manutencao", "aguardando_pagamento"):
            mesa = self.criar_mesa(status)
            resposta = self.pedir(mesa)
            self.assertEqual(resposta.status_code, 409, status)
            self.assertIn("não está aberta", resposta.json()["detail"])
            self.assertEqual(self.pedidos_da_mesa(mesa), 0)
            self.db.refresh(mesa)
            self.assertEqual(mesa.status, status)

    def test_qr_de_mesa_aberta_gera_pedido(self):
        mesa = self.criar_mesa("ocupada")
        resposta = self.pedir(mesa)
        self.assertEqual(resposta.status_code, 201, resposta.text)
        self.assertEqual(self.pedidos_da_mesa(mesa), 1)

    def test_mesa_fechada_volta_a_bloquear_depois_de_liberada(self):
        mesa = self.criar_mesa("ocupada")
        self.assertEqual(self.pedir(mesa).status_code, 201)
        mesa.status = "livre"
        self.db.flush()
        self.assertEqual(self.pedir(mesa).status_code, 409)

    def test_equipe_lanca_pedido_em_mesa_livre_e_abre_a_mesa(self):
        self.anonimo = False
        mesa = self.criar_mesa("livre")
        resposta = self.client.post("/api/pedidos", json={
            "mesaId": mesa.id, "itens": [{"produtoId": self.produto.id, "quantidade": 1}],
        })
        self.assertEqual(resposta.status_code, 201, resposta.text)
        self.db.refresh(mesa)
        self.assertEqual(mesa.status, "ocupada")

    def test_consulta_do_qr_informa_se_a_mesa_esta_aberta(self):
        for status, aberta in (("livre", False), ("ocupada", True)):
            mesa = self.criar_mesa(status)
            corpo = self.client.get(f"/api/mesas/por-token/{mesa.qr_code_token}").json()
            self.assertEqual(corpo["aberta"], aberta)
            self.assertEqual(corpo["numero"], mesa.numero)

    def test_limita_pedidos_repetidos_da_mesma_mesa(self):
        mesa = self.criar_mesa("ocupada")
        with patch.object(pedidos_qr_por_mesa, "maximo", 2):
            self.assertEqual(self.pedir(mesa).status_code, 201)
            self.assertEqual(self.pedir(mesa).status_code, 201)
            resposta = self.pedir(mesa)
        self.assertEqual(resposta.status_code, 429)
        self.assertIn("Retry-After", resposta.headers)
        self.assertEqual(self.pedidos_da_mesa(mesa), 2)


if __name__ == "__main__":
    unittest.main()
