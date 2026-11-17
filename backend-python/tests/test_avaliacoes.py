from datetime import datetime

from apoio import TesteComBanco

from app.routers.pedidos import router as pedidos_router
from app.routers.relatorios import router as relatorios_router


class AvaliacaoPedidoTest(TesteComBanco):
    routers = (pedidos_router, relatorios_router)

    def setUp(self):
        super().setUp()
        self.produto = self.criar_produto()

    def test_cliente_pode_avaliar_somente_apos_servido_e_so_uma_vez(self):
        pedido = self.criar_pedido([(self.produto, "1", "12.00")], status=1)

        resposta = self.client.post(
            f"/api/pedidos/{pedido.id}/avaliacao?token={pedido.token_acesso}",
            json={"nota": 5, "comentario": "Excelente"},
        )
        self.assertEqual(resposta.status_code, 409, resposta.text)

        pedido.id_status = 6
        self.db.commit()

        resposta = self.client.post(
            f"/api/pedidos/{pedido.id}/avaliacao?token={pedido.token_acesso}",
            json={"nota": 5, "comentario": "Excelente"},
        )
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(resposta.json()["nota"], 5)
        self.assertEqual(resposta.json()["comentario"], "Excelente")

        resposta = self.client.post(
            f"/api/pedidos/{pedido.id}/avaliacao?token={pedido.token_acesso}",
            json={"nota": 4, "comentario": "Segunda tentativa"},
        )
        self.assertEqual(resposta.status_code, 409, resposta.text)

    def test_relatorio_mostra_media_total_e_comentarios(self):
        mesa = self.criar_mesa()
        pedido1 = self.criar_pedido([(self.produto, "1", "12.00")], status=6, mesa=mesa)
        pedido2 = self.criar_pedido([(self.produto, "1", "12.00")], status=6, mesa=mesa)
        pedido1.id_mesa = mesa.id
        pedido2.id_mesa = mesa.id
        self.db.commit()

        for pedido, nota, comentario in (
            (pedido1, 5, "Muito bom!"),
            (pedido2, 1, "Pior experiência"),
        ):
            resposta = self.client.post(
                f"/api/pedidos/{pedido.id}/avaliacao?token={pedido.token_acesso}",
                json={"nota": nota, "comentario": comentario},
            )
            self.assertEqual(resposta.status_code, 200, resposta.text)

        resposta = self.client.get("/api/relatorios/avaliacoes")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        corpo = resposta.json()
        self.assertEqual(corpo["totalAvaliacoes"], 2)
        self.assertEqual(corpo["notaMedia"], 3.0)
        self.assertEqual(corpo["quantidadePorNota"][0]["quantidade"], 1)
        self.assertEqual(corpo["quantidadePorNota"][4]["quantidade"], 1)
        self.assertSetEqual({item["comentario"] for item in corpo["comentariosRecentes"]}, {"Muito bom!", "Pior experiência"})


if __name__ == "__main__":
    import unittest

    unittest.main()
