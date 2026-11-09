from apoio import TesteComBanco
from datetime import datetime, timedelta
from uuid import uuid4
from app.models import Cliente, PedidoStatusHistorico, Role
from app.local_demo_cancellations import atualizar_cancelamentos
from app.routers.pedidos import router


class OperacaoPedidosTest(TesteComBanco):
    routers = (router,)

    def setUp(self):
        super().setUp()
        self.produto = self.criar_produto()

    def pedido(self, status):
        return self.criar_pedido([(self.produto, "1", "10")], status=status)

    def test_cancelamento_nos_tres_estagios_registra_motivo_e_origem(self):
        for role, origem in ((Role.FUNCIONARIO, "Atendente"), (Role.COZINHA, "Cozinha")):
            self.usuario = self.criar_usuario(role)
            for status in (1, 2, 3):
                with self.subTest(role=role, status=status):
                    pedido = self.pedido(status)
                    resposta = self.client.put(f"/api/pedidos/{pedido.id}/status", json={
                        "status": "CANCELADO", "motivo": "Cliente desistiu", "origemCancelamento": origem,
                    })
                    self.assertEqual(resposta.status_code, 200, resposta.text)
                    self.assertEqual(resposta.json()["motivoCancelamento"], "Cliente desistiu")
                    self.assertIsNotNone(resposta.json()["canceladoEm"])
                    self.assertNotEqual(resposta.json()["canceladoEm"], resposta.json()["dataHora"])
                    consulta = self.client.get(f"/api/pedidos/{pedido.id}")
                    self.assertEqual(consulta.json()["origemCancelamento"], origem)

    def test_edicao_nos_tres_estagios_recalcula_total_e_reabre_pronto(self):
        for role in (Role.FUNCIONARIO, Role.COZINHA):
            self.usuario = self.criar_usuario(role)
            for status in (1, 2, 3):
                with self.subTest(role=role, status=status):
                    pedido = self.pedido(status)
                    resposta = self.client.put(f"/api/pedidos/{pedido.id}/itens", json={
                        "atualizadoEm": pedido.atualizado_em.isoformat(), "motivo": "Cliente pediu mais",
                        "observacoes": "Sem cebola", "itens": [{"produtoId": self.produto.id, "quantidade": 2}],
                    })
                    self.assertEqual(resposta.status_code, 200, resposta.text)
                    self.assertEqual(resposta.json()["valorTotal"], 20)
                    self.assertEqual(resposta.json()["status"], {1: "RECEBIDO", 2: "EM_PREPARO", 3: "EM_PREPARO"}[status])

    def test_motivo_obrigatorio_e_origem_nao_pode_ser_falsificada(self):
        self.usuario = self.criar_usuario(Role.FUNCIONARIO)
        pedido = self.pedido(2)
        for payload, esperado in (({"motivo": " "}, 422),
                                  ({"motivo": "Cliente desistiu", "origemCancelamento": "Cozinha"}, 403)):
            resposta = self.client.put(f"/api/pedidos/{pedido.id}/status", json={"status": "CANCELADO", **payload})
            self.assertEqual(resposta.status_code, esperado)

    def test_pedidos_encerrados_e_perfil_caixa_continuam_protegidos(self):
        self.usuario = self.criar_usuario(Role.COZINHA)
        for status in (4, 5, 6):
            pedido = self.pedido(status)
            resposta = self.client.put(f"/api/pedidos/{pedido.id}/status", json={"status": "CANCELADO", "motivo": "Engano"})
            self.assertIn(resposta.status_code, (403, 409))
        self.usuario = self.criar_usuario(Role.CAIXA)
        pedido = self.pedido(2)
        resposta = self.client.put(f"/api/pedidos/{pedido.id}/status", json={"status": "CANCELADO", "motivo": "Engano"})
        self.assertEqual(resposta.status_code, 403)

    def test_gerente_registra_a_tela_de_origem(self):
        pedido = self.pedido(1)
        resposta = self.client.put(f"/api/pedidos/{pedido.id}/status", json={
            "status": "CANCELADO", "motivo": "Solicitado pelo cliente", "origemCancelamento": "Cozinha",
        })
        self.assertEqual(resposta.status_code, 200, resposta.text)
        self.assertEqual(resposta.json()["origemCancelamento"], "Cozinha")


class FiltrosPedidosTest(TesteComBanco):
    routers = (router,)

    def setUp(self):
        super().setUp()
        self.produto = self.criar_produto()
        self.mesa = self.criar_mesa()
        self.cliente = Cliente(nome=f"Mariana {uuid4().hex[:8]}", cpf=f"{uuid4().int % 10**11:011d}", ativo=True,
                               criado_em=datetime.now())
        self.db.add(self.cliente)
        self.db.flush()
        self.pedidos = []
        for index, status in enumerate((5, 4, 5, 4)):
            pedido = self.criar_pedido([(self.produto, "1", "10")], status=status, mesa=self.mesa,
                                       data_hora=datetime(2026, 1, 10, 12) + timedelta(hours=index))
            pedido.id_cliente = self.cliente.id
            self.pedidos.append(pedido)
        self.db.commit()

    def buscar(self, **params):
        resposta = self.client.get("/api/pedidos", params={"cliente": self.cliente.nome, **params})
        self.assertEqual(resposta.status_code, 200, resposta.text)
        return resposta.json()

    def test_status_filtra_antes_de_contar_e_paginar(self):
        for status in ("CANCELADO", "ENTREGUE"):
            primeira = self.buscar(status=status, size=1)
            segunda = self.buscar(status=status, size=1, page=1)
            self.assertEqual(primeira["totalElements"], 2)
            self.assertEqual(primeira["totalPages"], 2)
            self.assertEqual(primeira["content"][0]["status"], status)
            self.assertNotEqual(primeira["content"][0]["id"], segunda["content"][0]["id"])

    def test_ordem_antigos_e_recentes_sobre_todos_os_resultados(self):
        for status, indices in (("CANCELADO", (0, 2)), ("ENTREGUE", (1, 3))):
            antigos = self.buscar(status=status, ordem="antigos", size=1)
            recentes = self.buscar(status=status, ordem="recentes", size=1)
            self.assertEqual(antigos["content"][0]["id"], self.pedidos[indices[0]].id)
            self.assertEqual(recentes["content"][0]["id"], self.pedidos[indices[1]].id)

    def test_mesa_cliente_numero_e_data_combinados(self):
        pedido = self.pedidos[0]
        for numero in (f"#{pedido.id}", pedido.numero_pedido):
            dados = self.buscar(status="CANCELADO", mesa=self.mesa.numero, numero=numero,
                                data="2026-01-10", cliente=self.cliente.nome.upper())
            self.assertEqual(dados["totalElements"], 1)
            self.assertEqual(dados["content"][0]["id"], pedido.id)
        self.assertEqual(self.buscar(mesa=self.mesa.numero + 100000)["totalElements"], 0)

    def test_sem_resultados_nao_cria_paginas_e_pagina_invalida_e_ajustada(self):
        vazio = self.buscar(numero="NAO-EXISTE", page=10)
        self.assertEqual(vazio["content"], [])
        self.assertEqual(vazio["totalPages"], 0)
        self.assertEqual(vazio["page"], 0)
        ultima = self.buscar(status="CANCELADO", page=100, size=1)
        self.assertEqual(ultima["page"], 1)
        self.assertEqual(len(ultima["content"]), 1)

    def test_caracteres_de_busca_nao_viram_curingas(self):
        self.assertEqual(self.buscar(cliente="%_")["totalElements"], 0)

    def test_recencia_usa_encerramento_mesmo_com_criacao_antiga(self):
        for status, indices in (("CANCELADO", (0, 2)), ("ENTREGUE", (1, 3))):
            antigo, novo = (self.pedidos[i] for i in indices)
            # O pedido mais antigo foi encerrado depois do pedido criado mais recentemente.
            for pedido, horario in ((antigo, datetime(2026, 1, 12, 18)), (novo, datetime(2026, 1, 11, 18))):
                self.db.add(PedidoStatusHistorico(id_pedido=pedido.id, status=status, registrado_em=horario))
            self.db.commit()
            recentes = self.buscar(status=status, ordem="recentes", size=1)
            antigos = self.buscar(status=status, ordem="antigos", size=1)
            self.assertEqual(recentes["content"][0]["id"], antigo.id)
            self.assertEqual(antigos["content"][0]["id"], novo.id)
            self.assertEqual(recentes["totalElements"], 2)
            if status == "CANCELADO":
                self.assertEqual(recentes["content"][0]["canceladoEm"], "2026-01-12T18:00:00")

    def test_cenarios_locais_preservam_motivos_manuais_e_sao_idempotentes(self):
        registros = []
        for index, motivo in enumerate(("Cenario de teste local", None, "Cliente precisou sair para uma consulta.")):
            pedido = self.pedidos[index]
            pedido.numero_pedido = f"T26-QA-{uuid4().hex[:10]}"
            usuario = self.criar_usuario(Role.FUNCIONARIO) if index == 2 else None
            historico = PedidoStatusHistorico(id_pedido=pedido.id, status="CANCELADO", motivo=motivo,
                                              registrado_em=datetime(2026, 1, 12), id_usuario=usuario.id if usuario else None)
            self.db.add(historico)
            registros.append(historico)
        self.db.commit()
        atualizar_cancelamentos(self.db)
        self.db.flush()
        valores = [h.motivo for h in registros]
        for historico in registros:
            self.assertTrue(historico.motivo.startswith(("[Atendente] ", "[Cozinha] ")))
            self.assertNotIn("teste", historico.motivo.lower())
            self.assertEqual(historico.registrado_em, datetime(2026, 1, 12))
        self.assertEqual(registros[2].motivo, "[Atendente] Cliente precisou sair para uma consulta.")
        atualizar_cancelamentos(self.db)
        self.assertEqual([h.motivo for h in registros], valores)
