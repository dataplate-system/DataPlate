"""Integracao com Postgres local; todas as alteracoes sao revertidas por teste.

Executar no container com PYTHONPATH=/app e unittest.
"""
import unittest
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import engine, get_db
from app.models import Pedido, PedidoStatusHistorico, Produto, Role, User
from app.routers.pedidos import router, _criar_item
from app.security import get_usuario_atual


class EdicaoPedidoTest(unittest.TestCase):
    def setUp(self):
        self.connection = engine.connect()
        self.transaction = self.connection.begin()
        self.db = Session(bind=self.connection, join_transaction_mode="create_savepoint")
        user = self.db.scalar(select(User).where(User.role == Role.COZINHA))
        self.user = SimpleNamespace(id=user.id, role=Role.COZINHA)
        self.products = self.db.scalars(select(Produto).where(Produto.ativo.is_(True)).limit(2)).all()
        now = datetime.now()
        self.order = Pedido(id_status=3, numero_pedido=f"QA-{now.timestamp()}", data_hora=now,
                            atualizado_em=now, valor_total=Decimal('20'), observacoes='Sem cebola')
        self.db.add(self.order)
        self.db.flush()
        line = _criar_item(self.order, self.products[0], 1)
        line.preco_unitario = Decimal('20')
        self.order.itens = [line]
        self.db.commit()
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_usuario_atual] = lambda: self.user
        self.client = TestClient(app)
        self.publish = patch('app.routers.pedidos._publicar_evento')
        self.event = self.publish.start()

    def tearDown(self):
        self.publish.stop()
        self.client.close()
        self.db.close()
        self.transaction.rollback()
        self.connection.close()

    def payload(self):
        return dict(atualizadoEm=self.order.atualizado_em.isoformat(),
                    itens=[dict(produtoId=self.products[0].id, quantidade=2)],
                    motivo='Cliente pediu mais uma unidade', observacoes='Sem sal')

    def save(self, payload=None):
        return self.client.put(f'/api/pedidos/{self.order.id}/itens', json=payload or self.payload())

    def test_recalcula_preserva_preco_e_retorna_pronto_ao_preparo(self):
        response = self.save()
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body['valorTotal'], 40)
        self.assertEqual(body['status'], 'EM_PREPARO')
        self.assertEqual(body['observacoes'], 'Sem sal')
        self.assertEqual(body['itens'][0]['precoUnitario'], 20)
        self.event.assert_called_once()
        history = self.db.scalar(select(PedidoStatusHistorico).where(PedidoStatusHistorico.id_pedido == self.order.id))
        self.assertEqual(history.id_usuario, self.user.id)
        self.assertIn('Cliente pediu', history.motivo)

    def test_substitui_produto_e_preserva_desconto_e_pagamento(self):
        self.order.valor_total = Decimal('18')
        self.order.observacoes = 'Pagamento: PIX | Desconto: 2.00'
        self.db.commit()
        payload = self.payload()
        payload['itens'] = [dict(produtoId=self.products[1].id, quantidade=1)]
        response = self.save(payload)
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertAlmostEqual(body['valorTotal'], max(0, float(self.products[1].preco) - 2))
        self.assertIn('Pagamento: PIX', body['observacoes'])
        self.assertEqual(body['itens'][0]['produtoId'], self.products[1].id)

    def test_rejeita_edicao_concorrente(self):
        payload = self.payload()
        self.assertEqual(self.save(payload).status_code, 200)
        self.assertEqual(self.save(payload).status_code, 409)

    def test_rejeita_pedido_ja_servido(self):
        self.order.id_status = 6
        self.db.commit()
        self.assertEqual(self.save().status_code, 409)

    def test_caixa_nao_edita_pedido_da_cozinha(self):
        self.user.role = Role.CAIXA
        self.assertEqual(self.save().status_code, 403)

    def test_itens_vazios_quantidade_invalida_duplicados(self):
        for itens in [[], [dict(produtoId=self.products[0].id, quantidade=0)],
                      [dict(produtoId=self.products[0].id, quantidade=1)] * 2]:
            payload = self.payload()
            payload['itens'] = itens
            self.assertEqual(self.save(payload).status_code, 422)

    def test_atendente_despacha_balcao_ja_pago_sem_nova_cobranca(self):
        self.user.role = Role.FUNCIONARIO
        self.order.observacoes = 'Sem cebola | Pagamento: PIX'
        self.db.commit()
        response = self.client.put(f'/api/pedidos/{self.order.id}/despacho')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['status'], 'ENTREGUE')
        self.assertEqual(response.json()['valorTotal'], 20)
        self.assertEqual(response.json()['observacoes'], 'Sem cebola | Pagamento: PIX')
        self.assertEqual(self.client.put(f'/api/pedidos/{self.order.id}/despacho').status_code, 409)

    def test_nao_despacha_balcao_sem_pagamento_ou_sem_preparo(self):
        self.user.role = Role.FUNCIONARIO
        self.assertEqual(self.client.put(f'/api/pedidos/{self.order.id}/despacho').status_code, 409)
        self.order.observacoes = 'Venda no caixa - pagamento: PIX'
        self.order.id_status = 2
        self.db.commit()
        self.assertEqual(self.client.put(f'/api/pedidos/{self.order.id}/despacho').status_code, 409)

    def test_cozinha_nao_despacha_balcao(self):
        self.order.observacoes = 'Pagamento: PIX'
        self.db.commit()
        self.assertEqual(self.client.put(f'/api/pedidos/{self.order.id}/despacho').status_code, 403)


if __name__ == '__main__':
    unittest.main()
