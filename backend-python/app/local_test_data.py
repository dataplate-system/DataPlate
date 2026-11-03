"""Carga explicita para o Docker LOCAL. Nunca executada na inicializacao da API.

python -m app.local_test_data
Reconfigura somente os cinco acessos padrao e acrescenta cenarios identificados.
"""
from datetime import datetime, timedelta
from decimal import Decimal
import json

from sqlalchemy import create_engine, select, func, text
from sqlalchemy.orm import Session

from app.models import (User, Role, Restaurante, Categoria, Produto, Insumo,
                        Fornecedor, Cliente, Mesa, Pedido, PedidoStatusHistorico, ProdutoInsumo)
from app.seed import DEFAULT_ADMIN_CPF, DEFAULT_ADMIN_PASSWORD, DEFAULT_TEST_USERS, DEFAULT_TEST_PASSWORDS
from app.security import hash_password
from app.routers.pedidos import _criar_item


def cpf_teste(base):
    digits = [int(d) for d in f'{base:09d}']
    for size in (9, 10):
        digit = sum(digits[i] * (size + 1 - i) for i in range(size)) * 10 % 11
        digits.append(0 if digit == 10 else digit)
    return ''.join(map(str, digits))


def cnpj_teste(base):
    digits = [int(d) for d in f'{base:012d}']
    for weights in ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]):
        remainder = sum(d * w for d, w in zip(digits, weights)) % 11
        digits.append(0 if remainder < 2 else 11 - remainder)
    return ''.join(map(str, digits))


def populate():
    # Endereco fixo do servico Docker, sem ler conexoes externas do .env.
    engine = create_engine('postgresql+psycopg://postgres:dataplate_local@db:5432/dataplate')
    with Session(engine) as db, db.begin():
        db.execute(text('SELECT pg_advisory_xact_lock(20261103)'))
        now = db.scalar(select(func.timezone('America/Sao_Paulo', func.now()))).replace(tzinfo=None)
        for order in db.scalars(select(Pedido).where(Pedido.numero_pedido.like('T26-%'), Pedido.observacoes.is_not(None))):
            order.observacoes = ' | '.join(part.strip() for part in order.observacoes.split('|')
                if part.strip() and part.strip() != 'Massa de teste 2026') or None
        accounts = [('Administrador', DEFAULT_ADMIN_CPF, Role.ADMIN, DEFAULT_ADMIN_PASSWORD)]
        accounts += [(nome, cpf, role, DEFAULT_TEST_PASSWORDS[role]) for nome, cpf, role in DEFAULT_TEST_USERS]
        for nome, cpf, role, password in accounts:
            user = db.scalar(select(User).where(User.cpf == cpf))
            if user is None:
                user = User(cpf=cpf, nome=nome)
                db.add(user)
            user.role, user.ativo, user.senha_hash = role.value, True, hash_password(password)

        restaurant = db.scalar(select(Restaurante).where(Restaurante.ativo.is_(True)).order_by(Restaurante.id))
        if restaurant is None:
            restaurant = Restaurante(nome='Restaurante DataPlate Teste', cnpj='00000000000191', email='teste@dataplate.local', ativo=True)
            db.add(restaurant)
            db.flush()

        clients = []
        for i in range(10):
            cpf = cpf_teste(920100000 + i)
            client = db.scalar(select(Cliente).where(Cliente.cpf == cpf))
            if client is None:
                client = Cliente(codigo=f'T26-CLI-{i+1:02}', nome=f'Cliente Teste {i+1:02}', cpf=cpf,
                                 email=f'cliente.teste{i+1}@example.com', telefone=f'1198000{i+1:04}',
                                 endereco='Rua de Testes, 100 - Sao Paulo/SP', ativo=True, criado_em=now)
                db.add(client)
            clients.append(client)
        suppliers = []
        for i, specialty in enumerate(['Hortifruti', 'Carnes e aves', 'Bebidas']):
            code = f'T26-FOR-{i+1}'
            supplier = db.scalar(select(Fornecedor).where(Fornecedor.codigo == code))
            if supplier is None:
                supplier = Fornecedor(codigo=code, razao_social=f'Fornecedor Teste {specialty}',
                                      cnpj=cnpj_teste(930000000001 + i), especialidade=specialty,
                                      telefone='1130001234', email=f'fornecedor.teste{i+1}@example.com', ativo=True, criado_em=now)
                db.add(supplier)
            elif supplier.cnpj.strip() == f'9300000{i:05}01':
                supplier.cnpj = cnpj_teste(930000000001 + i)
            suppliers.append(supplier)
        ingredients = []
        for i, (name, stock, minimum, cost) in enumerate([
            ('Carne bovina', 15, 3, 39.9), ('Alface', .3, 1, 6),
            ('Massa seca', 0, 2, 8), ('Laranja', 12, 3, 5), ('Chocolate', 4, 1, 28),
        ]):
            full_name = f'Teste 2026 - {name}'
            ingredient = db.scalar(select(Insumo).where(Insumo.nome == full_name))
            if ingredient is None:
                ingredient = Insumo(nome=full_name, unidade='kg', quantidade_atual=Decimal(str(stock)),
                                    quantidade_minima=Decimal(str(minimum)), custo_unitario=Decimal(str(cost)), ativo=True)
                ingredient.fornecedores = [suppliers[0 if i == 1 else 1 if i == 0 else 2]]
                db.add(ingredient)
            ingredients.append(ingredient)
        db.flush()
        products = db.scalars(select(Produto).where(Produto.ativo.is_(True)).order_by(Produto.id)).all()
        if len(products) < 4:
            category = db.scalar(select(Categoria).where(Categoria.id_restaurante == restaurant.id, Categoria.ativo.is_(True)))
            if category is None:
                category = Categoria(id_restaurante=restaurant.id, nome='Cardapio teste', ordem=1, ativo=True)
                db.add(category)
                db.flush()
            for i, (name, photo, price, time) in enumerate([
                ('Burger Teste', 'hamburguer.jpg', '29.90', 15),
                ('Salada Teste', 'salada-horta.jpg', '19.90', 8),
                ('Pudim Teste', 'pudim.jpg', '12.90', 0),
                ('Suco Teste', 'suco-laranja.jpg', '9.90', 0),
            ]):
                p = db.scalar(select(Produto).where(Produto.codigo == f'T26-P-{i+1}'))
                if p is None:
                    p = Produto(codigo=f'T26-P-{i+1}', nome=name, id_categoria=category.id,
                                preco=Decimal(price), tempo_preparo=time, ativo=True, imagem=f'../images/menu/{photo}', criado_em=now)
                    db.add(p)
                    products.append(p)
            db.flush()
        # Fichas tecnicas de teste apenas para produtos sem receita existente.
        for i, product in enumerate(products[:6]):
            if db.scalar(select(ProdutoInsumo.id).where(ProdutoInsumo.produto_id == product.id)) is None:
                name = product.nome.lower()
                index = 3 if 'suco' in name else 4 if ('chocolate' in name or 'pudim' in name) else 2 if ('massa' in name or 'spaghetti' in name) else 1 if 'salada' in name else 0
                db.add(ProdutoInsumo(produto_id=product.id, insumo_id=ingredients[index].id, quantidade=Decimal('.150')))

        tables = []
        for i in range(12):
            marker = f'TESTE-2026-MESA-{i+1:02}'
            table = db.scalar(select(Mesa).where(Mesa.observacoes == marker))
            if table is None:
                number = max(100, db.scalar(select(func.max(Mesa.numero)).where(Mesa.id_restaurante == restaurant.id)) or 0) + 1
                state = 'ocupada' if i < 6 else 'aguardando_pagamento' if i < 8 else 'reservada' if i < 10 else 'livre'
                table = Mesa(id_restaurante=restaurant.id, numero=number, capacidade=2 if i % 2 else 4,
                             status=state, localizacao='Area de testes 2026', observacoes=marker, ativo=True)
                if state == 'reservada':
                    table.reserva_nome, table.reserva_telefone = f'Reserva Teste {i-7}', '11980001234'
                    table.reserva_data_hora = now + timedelta(days=1)
                db.add(table)
                db.flush()
            tables.append(table)
        statuses = {'RECEBIDO': 1, 'EM_PREPARO': 2, 'PRONTO': 3, 'ENTREGUE': 4, 'CANCELADO': 5, 'SERVIDO': 6}
        added = 0

        def add_order(code, state, when, table, index, paid=False):
            nonlocal added
            if db.scalar(select(Pedido.id).where(Pedido.numero_pedido == code)) is not None:
                return
            payment = ['PIX', 'DEBITO', 'CREDITO', 'DINHEIRO'][index % 4]
            notes = ''
            if index % 3 == 0:
                notes = 'Sem cebola'
            if state == 'CANCELADO':
                notes += ' | Cliente desistiu do pedido'
            if state == 'ENTREGUE' or paid:
                notes += f' | Pagamento: {payment}'
            notes = notes.strip(' |') or None
            order = Pedido(id_mesa=table.id if table else None, id_cliente=clients[index % 10].id,
                           id_status=statuses[state], numero_pedido=code, data_hora=when,
                           atualizado_em=when, observacoes=notes, valor_total=Decimal('0'))
            db.add(order)
            db.flush()
            order.itens = [_criar_item(order, products[index % len(products)], 1 + index % 2),
                           _criar_item(order, products[(index + 3) % len(products)], 1)]
            order.valor_total = sum((line.quantidade * line.preco_unitario for line in order.itens), Decimal('0'))
            stages = [('RECEBIDO', 0)]
            if state == 'CANCELADO':
                stages.append(('CANCELADO', 3))
            elif state != 'RECEBIDO':
                for next_state, minute in [('EM_PREPARO', 2), ('PRONTO', 8), ('SERVIDO', 10), ('ENTREGUE', 12)]:
                    stages.append((next_state, minute))
                    if next_state == state:
                        break
            for stage, minute in stages:
                order.atualizado_em = min(now, when + timedelta(minutes=minute))
                db.add(PedidoStatusHistorico(id_pedido=order.id, status=stage, registrado_em=order.atualizado_em,
                                            motivo='Cenario de teste local'))
            added += 1

        for day in range(30):
            for i in range(4):
                when = (now - timedelta(days=day + 1)).replace(hour=11 + i * 2, minute=15, second=0, microsecond=0)
                add_order(f'T26-H-{when:%Y%m%d}-{i}', 'CANCELADO' if (day * 4 + i) % 13 == 0 else 'ENTREGUE', when, None, day * 4 + i)
        active_states = ['RECEBIDO', 'RECEBIDO', 'EM_PREPARO', 'EM_PREPARO', 'PRONTO', 'PRONTO', 'SERVIDO', 'SERVIDO']
        for i, state in enumerate(active_states):
            add_order(f'T26-A-{i+1:02}', state, now - timedelta(minutes=5 + i * 2), tables[i], i)
        add_order('T26-BALCAO-PAGO', 'PRONTO', now - timedelta(minutes=9), None, 4, paid=True)
        add_order('T26-CANCELADO-HOJE', 'CANCELADO', now - timedelta(minutes=8), None, 5)
        add_order('T26-VENDA-HOJE', 'ENTREGUE', now - timedelta(minutes=20), None, 6, paid=True)
        db.flush()
        print(json.dumps({'pedidos_adicionados': added, 'mesas_de_teste': [t.numero for t in tables],
                          'clientes_de_teste': len(clients), 'fornecedores_de_teste': len(suppliers),
                          'insumos_de_teste': len(ingredients), 'acessos_configurados': len(accounts),
                          'dados_existentes_preservados': True}))


if __name__ == '__main__':
    populate()
