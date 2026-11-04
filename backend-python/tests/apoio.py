"""Base dos testes de integracao: cada teste roda em uma transacao desfeita ao final."""
import unittest
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import limiter
from app.db import engine, get_db
from app.models import Categoria, Insumo, Mesa, Pedido, PedidoItem, Produto, ProdutoInsumo, Restaurante, Role, User
from app.security import get_usuario_atual, get_usuario_opcional, hash_password


class TesteComBanco(unittest.TestCase):
    routers = ()

    def setUp(self):
        # addCleanup tambem roda se o setUp falhar: nenhuma conexao fica aberta.
        self.connection = engine.connect()
        self.addCleanup(self.connection.close)
        self.transaction = self.connection.begin()
        self.addCleanup(self.transaction.rollback)
        self.db = Session(bind=self.connection, join_transaction_mode="create_savepoint")
        self.addCleanup(self.db.close)
        self.usuario = SimpleNamespace(id=None, role=Role.GERENTE)
        self.anonimo = False

        app = FastAPI()
        for router in self.routers:
            app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_usuario_atual] = lambda: self.usuario
        app.dependency_overrides[get_usuario_opcional] = lambda: None if self.anonimo else self.usuario
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

        evento = patch("app.routers.pedidos._publicar_evento")
        self.publicar_evento = evento.start()
        self.addCleanup(evento.stop)
        estoque_baixo = patch("app.routers.pedidos._publicar_estoque_baixo")
        self.publicar_estoque_baixo = estoque_baixo.start()
        self.addCleanup(estoque_baixo.stop)
        for limitador in (limiter.login_por_cpf, limiter.login_por_origem, limiter.recuperacao_por_cpf,
                          limiter.recuperacao_por_origem, limiter.pedidos_qr_por_mesa):
            limitador.limpar()

    def criar_produto(self, preco="10.00", tempo_preparo=10):
        categoria_id = self.db.scalar(select(Categoria.id).limit(1))
        produto = Produto(id_categoria=categoria_id, nome=f"Produto {uuid4().hex[:8]}", preco=Decimal(preco),
                          ativo=True, destaque=False, tempo_preparo=tempo_preparo, criado_em=datetime.now())
        self.db.add(produto)
        self.db.flush()
        return produto

    def criar_insumo(self, atual="10.000", minima="1.000", custo="2.00"):
        insumo = Insumo(nome=f"Insumo {uuid4().hex[:8]}", unidade="kg", quantidade_atual=Decimal(atual),
                        quantidade_minima=Decimal(minima), custo_unitario=Decimal(custo), ativo=True)
        self.db.add(insumo)
        self.db.flush()
        return insumo

    def criar_ficha(self, produto, insumo, quantidade="0.200"):
        self.db.add(ProdutoInsumo(produto_id=produto.id, insumo_id=insumo.id, quantidade=Decimal(quantidade)))
        self.db.flush()

    def criar_mesa(self, status="livre"):
        restaurante_id = self.db.scalar(select(Restaurante.id).limit(1))
        mesa = Mesa(id_restaurante=restaurante_id, numero=20000 + uuid4().int % 10000, capacidade=4, status=status, ativo=True)
        self.db.add(mesa)
        self.db.flush()
        self.db.refresh(mesa)
        return mesa

    def criar_usuario(self, role=Role.GERENTE, senha="senha-do-teste-1", email=None):
        usuario = User(nome="Usuario de teste", cpf=f"{uuid4().int % 10**11:011d}", senha_hash=hash_password(senha),
                       role=role.value, ativo=True, email=email)
        self.db.add(usuario)
        self.db.flush()
        return usuario

    def criar_pedido(self, itens, status=1, data_hora=None, mesa=None, pago_em=None):
        """itens: lista de (produto, quantidade, preco)."""
        quando = data_hora or datetime.now()
        pedido = Pedido(id_mesa=mesa.id if mesa else None, id_status=status, numero_pedido=f"QA-{uuid4().hex[:12]}",
                        data_hora=quando, atualizado_em=quando, pago_em=pago_em,
                        valor_total=sum((Decimal(q) * Decimal(p) for _, q, p in itens), Decimal("0")))
        self.db.add(pedido)
        self.db.flush()
        pedido.itens = [PedidoItem(id_pedido=pedido.id, produto=produto, id_produto=produto.id, quantidade=Decimal(q),
                                   preco_unitario=Decimal(p), cancelado=False) for produto, q, p in itens]
        self.db.flush()
        return pedido
