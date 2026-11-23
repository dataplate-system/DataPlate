from apoio import TesteComBanco
from app.models import Role
from app.routers.pedidos import router


class ObservacoesPainelTest(TesteComBanco):
    routers = (router,)

    def setUp(self):
        super().setUp()
        self.produto = self.criar_produto()
        self.linha = {"produtoId": self.produto.id, "quantidade": 1}

    def test_criacao_e_edicao_do_mesmo_produto_com_observacoes_distintas(self):
        mesa = self.criar_mesa("ocupada")
        self.anonimo = True
        resposta = self.client.post("/api/pedidos", json={
            "mesaToken": str(mesa.qr_code_token),
            "observacoes": "Trazer juntos",
            "itens": [self.linha, {**self.linha, "observacao": " Sem cebola "}],
        })
        self.assertEqual(resposta.status_code, 201, resposta.text)
        pedido = resposta.json()
        self.assertEqual(pedido["observacoes"], "Trazer juntos")
        self.assertCountEqual([item["observacao"] for item in pedido["itens"]], [None, "Sem cebola"])

        self.anonimo = False
        self.usuario = self.criar_usuario(Role.COZINHA)
        rota = f"/api/pedidos/{pedido['id']}/itens"
        corpo = {
            "atualizadoEm": pedido["atualizadoEm"],
            "motivo": "Ajuste solicitado",
            "observacoes": pedido["observacoes"],
            "itens": [self.linha, {**self.linha, "observacao": "Bem passado"}],
        }
        resposta = self.client.put(rota, json=corpo)
        self.assertEqual(resposta.status_code, 200, resposta.text)
        editado = resposta.json()
        self.assertEqual(editado["observacoes"], "Trazer juntos")
        self.assertEqual(editado["valorTotal"], pedido["valorTotal"])
        self.assertCountEqual([item["observacao"] for item in editado["itens"]], [None, "Bem passado"])
        evento = self.publicar_evento.call_args.args[1].model_dump()
        self.assertCountEqual([item["observacao"] for item in evento["itens"]], [None, "Bem passado"])

        corpo.update(atualizadoEm=editado["atualizadoEm"], itens=[{**self.linha, "observacao": "x" * 141}])
        self.assertEqual(self.client.put(rota, json=corpo).status_code, 422)
        self.assertEqual(self.client.post("/api/pedidos", json={
            "numeroMesa": mesa.numero,
            "itens": corpo["itens"],
        }).status_code, 422)

    def test_item_esgotado_considera_a_soma_de_todas_as_linhas(self):
        pedido = self.criar_pedido([(self.produto, 1, "10.00"), (self.produto, 1, "10.00")])
        self.produto.esgotado = True
        self.db.flush()
        rota = f"/api/pedidos/{pedido.id}/itens"
        corpo = {
            "atualizadoEm": pedido.atualizado_em.isoformat(),
            "motivo": "Ajuste solicitado",
            "itens": [self.linha, {**self.linha, "observacao": "Sem gelo"}, {**self.linha, "observacao": "Sem cebola"}],
        }
        self.assertEqual(self.client.put(rota, json=corpo).status_code, 409)
        corpo["itens"].pop()
        resposta = self.client.put(rota, json=corpo)
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(resposta.json()["valorTotal"], 20)

    def test_painel_publico_mostra_apenas_numero_e_status_durante_a_retirada(self):
        self.usuario = self.criar_usuario(Role.CAIXA)
        cliente = self.criar_cliente()
        resposta = self.client.post("/api/pedidos", json={
            "vendaCaixa": True, "formaPagamento": "PIX", "clienteId": cliente.id,
            "itens": [self.linha],
        })
        self.assertEqual(resposta.status_code, 201, resposta.text)
        numero = resposta.json()["id"]
        itens = [(self.produto, 1, "10.00")]
        mesa = self.criar_pedido(itens, mesa=self.criar_mesa("ocupada"))
        cancelado = self.criar_pedido(itens, status=5)

        def painel():
            self.usuario = None
            self.anonimo = True
            resposta = self.client.get("/api/pedidos/painel")
            self.assertEqual(resposta.status_code, 200, resposta.text)
            for linha in resposta.json():
                self.assertEqual(set(linha), {"numeroPedido", "status"})
            return {p["numeroPedido"]: p["status"] for p in resposta.json()}

        recebidos = painel()
        self.assertEqual(recebidos[numero], "RECEBIDO")
        self.assertNotIn(mesa.id, recebidos)
        self.assertNotIn(cancelado.id, recebidos)
        cozinha = self.criar_usuario(Role.COZINHA)
        for situacao in ("EM_PREPARO", "PRONTO"):
            self.usuario = cozinha
            resposta = self.client.put(f"/api/pedidos/{numero}/status", json={"status": situacao})
            self.assertEqual(resposta.status_code, 200, resposta.text)
            self.assertEqual(painel()[numero], situacao)
        self.usuario = self.criar_usuario(Role.FUNCIONARIO)
        resposta = self.client.put(f"/api/pedidos/{numero}/despacho")
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertNotIn(numero, painel())
