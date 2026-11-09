"""Vendas de demonstracao que deixam a Matriz BCG coerente. Somente no Docker LOCAL.

    docker exec backend-python-api-1 python -m app.demo_bcg             # grava
    docker exec backend-python-api-1 python -m app.demo_bcg --simular   # so mostra o plano

A tela compara os ultimos 30 dias com os 30 anteriores, contados a partir de hoje. A cada
dia, vendas antigas passam de um periodo para o outro; a carga continua coerente por
DIAS_VALIDOS dias e, depois disso, deve ser gravada de novo. Cada execucao apaga as vendas
que ela mesma criou (prefixo BCG-) e calcula as novas a partir das vendas que ja existem,
sem alterar nenhum outro pedido.
"""
import math
import random
import sys
import unicodedata
from collections import Counter
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import create_engine, delete, func, select, text
from sqlalchemy.orm import Session

from app import bcg
from app.models import Pedido, PedidoItem, PedidoStatusHistorico, Produto


PREFIXO = "BCG-"
STATUS_ENTREGUE_ID = 4
# Faturamento minimo do periodo atual; sobe sozinho se as vendas existentes exigirem.
FATURAMENTO_MINIMO = Decimal("15000")
# Dias dos numeros publicados no comparativo antes/depois (docs/apresentacao/melhorias):
# nao recebem vendas, para os valores de novembro continuarem iguais.
DIAS_PRESERVADOS = (date(2026, 11, 1), date(2026, 11, 4))
FORMAS_PAGAMENTO = ("PIX", "DEBITO", "CREDITO", "DINHEIRO")
# Dias seguidos, a partir de hoje, em que a matriz mantem a classificacao planejada.
DIAS_VALIDOS = 14

# Produto -> (classificacao, participacao % no periodo atual, crescimento % sobre o anterior).
PLANO = {
    # Pratos fortes em alta.
    "Burger da Casa": (bcg.ESTRELA, 9.6, 28),
    "Prato Executivo de Frango Grelhado": (bcg.ESTRELA, 6.5, 22),
    "Limonada Suíça": (bcg.ESTRELA, 5.8, 25),
    "X-Salada Clássico": (bcg.ESTRELA, 5.0, 18),
    "Sanduíche de Costela Desfiada": (bcg.ESTRELA, 4.8, 15),
    "Espaguete à Bolonhesa": (bcg.ESTRELA, 4.5, 15),
    # Classicos que vendem muito, mas pararam de crescer.
    "Refrigerante Lata 350 ml": (bcg.VACA_LEITEIRA, 7.0, -4),
    "Cerveja Long Neck 355 ml": (bcg.VACA_LEITEIRA, 6.0, -6),
    "Suco Natural": (bcg.VACA_LEITEIRA, 5.5, -3),
    "Batata Frita com Cheddar e Bacon": (bcg.VACA_LEITEIRA, 5.5, -8),
    "Picanha na Chapa (2 pessoas)": (bcg.VACA_LEITEIRA, 5.8, -8),
    "Strogonoff de Carne": (bcg.VACA_LEITEIRA, 4.2, -5),
    # Vendem pouco, mas estao subindo.
    "Wrap de Frango": (bcg.INTERROGACAO, 2.4, 45),
    "Lasanha à Bolonhesa": (bcg.INTERROGACAO, 2.0, 40),
    "Bolinho de Bacalhau (6 un.)": (bcg.INTERROGACAO, 1.8, 30),
    "Salada Caesar": (bcg.INTERROGACAO, 2.4, 15),
    "Água Mineral 500 ml": (bcg.INTERROGACAO, 2.0, 8),
    "Pão de Alho (porção)": (bcg.INTERROGACAO, 1.8, 12),
    "Café Expresso": (bcg.INTERROGACAO, 2.4, 8),
    # Vendem pouco e estao caindo.
    "Nhoque ao Sugo": (bcg.ABACAXI, 0.6, -45),
    "Salada Tropical": (bcg.ABACAXI, 1.0, -28),
    "Mousse de Maracujá": (bcg.ABACAXI, 1.0, -35),
    "Filé de Tilápia com Legumes": (bcg.ABACAXI, 2.0, -22),
    "Fettuccine ao Molho Branco": (bcg.ABACAXI, 1.6, -30),
    "Isca de Frango Empanada": (bcg.ABACAXI, 1.3, -25),
    "Brownie com Calda Quente": (bcg.ABACAXI, 2.3, -18),
    "Pudim de Leite": (bcg.ABACAXI, 2.0, -15),
    "Petit Gâteau com Sorvete": (bcg.ABACAXI, 2.4, -30),
    "Caldinho de Feijão": (bcg.ABACAXI, 0.8, -16),
}
ORDEM = (bcg.ESTRELA, bcg.VACA_LEITEIRA, bcg.INTERROGACAO, bcg.ABACAXI)


def _nome(valor: str) -> str:
    return unicodedata.normalize("NFC", valor).strip().casefold()


def _vendas(db: Session, inicio: date, fim: date) -> dict[int, Decimal]:
    # Mesma regra do relatorio: pedidos nao cancelados e itens nao cancelados.
    linhas = db.execute(
        text(
            """
            SELECT i.id_produto, COALESCE(SUM(i.subtotal), 0)
            FROM item_pedido i
            JOIN pedido p ON p.id_pedido = i.id_pedido
            WHERE p.id_status <> 5 AND NOT i.cancelado AND p.data_hora BETWEEN :inicio AND :fim
            GROUP BY i.id_produto
            """
        ),
        {"inicio": datetime.combine(inicio, time.min), "fim": datetime.combine(fim, time.max)},
    )
    return {int(produto_id): Decimal(total) for produto_id, total in linhas}


def _planejar(produtos: list[Produto], atuais: list[dict[int, Decimal]], anteriores: list[dict[int, Decimal]]) -> list[dict]:
    """atuais[k] e anteriores[k]: vendas existentes com a tela aberta k dias depois de hoje."""
    plano_por_nome = {_nome(nome): valores for nome, valores in PLANO.items()}
    faltando = [p.nome for p in produtos if _nome(p.nome) not in plano_por_nome]
    if faltando:
        sys.exit(f"Produtos ativos sem plano em app/demo_bcg.py: {', '.join(faltando)}")
    if round(sum(valores[1] for valores in PLANO.values()), 6) != 100:
        sys.exit("As participacoes do PLANO precisam somar 100.")

    itens = []
    zero = Decimal("0")
    for produto in produtos:
        classificacao, participacao, crescimento = plano_por_nome[_nome(produto.nome)]
        itens.append({
            "produto": produto,
            "classificacao": classificacao,
            "fracao": Decimal(str(participacao)) / 100,
            "fator": 1 + Decimal(str(crescimento)) / 100,
            "atual": [vendas.get(produto.id, zero) for vendas in atuais],
            "anterior": [vendas.get(produto.id, zero) for vendas in anteriores],
        })

    # So da para acrescentar vendas: o total cresce ate caber o que ja foi vendido,
    # considerando o pior dia da validade.
    total = FATURAMENTO_MINIMO
    for item in itens:
        piso = max(item["atual"])
        if item["fator"] > 1:
            piso = max(piso, max(item["anterior"]) * item["fator"] + item["atual"][0] - min(item["atual"]))
        total = max(total, piso / item["fracao"])

    for item in itens:
        preco = item["produto"].preco
        falta_atual = item["fracao"] * total - item["atual"][0]
        item["unidades_atual"] = math.ceil(falta_atual / preco) if falta_atual > 0 else 0
        acrescimo = item["unidades_atual"] * preco
        # Crescer: compara o menor periodo atual com o maior anterior. Cair: o contrario.
        # Arredondar para o lado que nunca troca a classificacao planejada.
        if item["fator"] > 1:
            falta_anterior = (min(item["atual"]) + acrescimo) / item["fator"] - max(item["anterior"])
            arredondar = math.floor
        else:
            falta_anterior = (max(item["atual"]) + acrescimo) / item["fator"] - min(item["anterior"])
            arredondar = math.ceil
        item["unidades_anterior"] = arredondar(falta_anterior / preco) if falta_anterior > 0 else 0
    return itens


def _conferir(itens: list[dict], hoje: date) -> None:
    """Classifica como a tela faria em cada dia da validade; qualquer diferenca cancela tudo."""
    limite = bcg.limite_participacao(len(itens))
    erros = []
    for k in range(DIAS_VALIDOS + 1):
        finais = {}
        for item in itens:
            preco = item["produto"].preco
            finais[item["produto"].id] = (item["atual"][k] + item["unidades_atual"] * preco,
                                          item["anterior"][k] + item["unidades_anterior"] * preco)
        total = sum(atual for atual, _ in finais.values())
        for item in itens:
            atual, anterior = finais[item["produto"].id]
            participacao = float(atual * 100 / total)
            crescimento = bcg.crescimento_percentual(atual, anterior)
            obtida = bcg.classificar(participacao, crescimento, limite, atual > 0)
            if k == 0:
                item.update(participacao=participacao, crescimento=crescimento, final_atual=atual, final_anterior=anterior)
            if obtida != item["classificacao"]:
                erros.append(f"{hoje + timedelta(days=k):%d/%m} {item['produto'].nome}: "
                             f"planejado {item['classificacao']}, obtido {obtida}")
    if erros:
        sys.exit("Plano inconsistente, nada foi gravado:\n" + "\n".join(erros))


def _dias(inicio: date, fim: date) -> list[date]:
    dias = []
    dia = inicio
    while dia <= fim:
        if not DIAS_PRESERVADOS[0] <= dia <= DIAS_PRESERVADOS[1]:
            dias.append(dia)
        dia += timedelta(days=1)
    return dias


def _criar_pedidos(db: Session, unidades: list[Produto], dias: list[date], rng: random.Random, sequencia: list[int]) -> int:
    rng.shuffle(unidades)
    criados = 0
    while unidades:
        tamanho = rng.choice((1, 2, 2, 3, 3, 4))
        grupo, unidades = unidades[:tamanho], unidades[tamanho:]
        linhas = Counter(produto.id for produto in grupo)
        produtos = {produto.id: produto for produto in grupo}

        dia = rng.choice(dias)
        recebido = datetime.combine(dia, time(rng.randint(11, 21), rng.choice(range(0, 60, 5))))
        entregue = recebido + timedelta(minutes=rng.randint(30, 55))
        forma = FORMAS_PAGAMENTO[sequencia[0] % len(FORMAS_PAGAMENTO)]
        sequencia[0] += 1
        pedido = Pedido(
            id_mesa=None,
            id_status=STATUS_ENTREGUE_ID,
            numero_pedido=f"{PREFIXO}{dia:%Y%m%d}-{sequencia[0]:04d}",
            data_hora=recebido,
            atualizado_em=entregue,
            pago_em=entregue,
            forma_pagamento=forma,
            observacoes=f"Pagamento: {forma}",
            valor_total=sum((produtos[pid].preco * quantidade for pid, quantidade in linhas.items()), Decimal("0")),
        )
        db.add(pedido)
        db.flush()
        db.add_all(
            PedidoItem(id_pedido=pedido.id, id_produto=pid, quantidade=Decimal(quantidade),
                       preco_unitario=produtos[pid].preco, cancelado=False)
            for pid, quantidade in linhas.items()
        )
        for status, momento in (("RECEBIDO", recebido), ("EM_PREPARO", recebido + timedelta(minutes=3)),
                                ("PRONTO", recebido + timedelta(minutes=18)), ("ENTREGUE", entregue)):
            db.add(PedidoStatusHistorico(id_pedido=pedido.id, status=status, registrado_em=momento,
                                         motivo="Carga de demonstracao (Matriz BCG)"))
        criados += 1
    return criados


def executar(simular: bool) -> None:
    # Endereco fixo do servico Docker, sem ler conexoes externas do .env.
    engine = create_engine("postgresql+psycopg://postgres:dataplate_local@db:5432/dataplate")
    with Session(engine) as db:
        db.execute(text("SELECT pg_advisory_xact_lock(20261109)"))
        removidos = db.execute(delete(Pedido).where(Pedido.numero_pedido.like(f"{PREFIXO}%"))).rowcount

        hoje = db.scalar(select(func.timezone("America/Sao_Paulo", func.now()))).date()
        inicio_atual, fim_atual = hoje - timedelta(days=30), hoje
        fim_anterior = inicio_atual - timedelta(days=1)
        inicio_anterior = fim_anterior - timedelta(days=30)

        produtos = db.scalars(select(Produto).where(Produto.ativo.is_(True)).order_by(Produto.nome)).all()
        deslocamentos = [timedelta(days=k) for k in range(DIAS_VALIDOS + 1)]
        itens = _planejar(
            produtos,
            [_vendas(db, inicio_atual + d, fim_atual + d) for d in deslocamentos],
            [_vendas(db, inicio_anterior + d, fim_anterior + d) for d in deslocamentos],
        )
        _conferir(itens, hoje)

        print(f"Periodo atual {inicio_atual:%d/%m} a {fim_atual:%d/%m}; anterior {inicio_anterior:%d/%m} a {fim_anterior:%d/%m}.")
        print(f"Vendas BCG removidas: {removidos} pedido(s).")
        for classificacao in ORDEM:
            grupo = sorted((i for i in itens if i["classificacao"] == classificacao), key=lambda i: -i["participacao"])
            print(f"\n{classificacao} ({len(grupo)})")
            for item in grupo:
                print(f"  {item['produto'].nome:<36} {item['participacao']:5.1f}%  {item['crescimento']:+6.1f}%"
                      f"  +{item['unidades_atual']} un. agora, +{item['unidades_anterior']} un. antes")

        total_atual = sum(item["final_atual"] for item in itens)
        total_anterior = sum(item["final_anterior"] for item in itens)
        print(f"\nFaturamento: R$ {total_atual:.2f} agora x R$ {total_anterior:.2f} antes.")
        print(f"Classificacao conferida de {hoje:%d/%m} a {hoje + timedelta(days=DIAS_VALIDOS):%d/%m}.")

        if simular:
            db.rollback()
            print("Simulacao: nada foi gravado.")
            return

        rng = random.Random(20261109)
        sequencia = [0]
        # Dias que ficam no mesmo periodo durante toda a validade, com folga nas bordas.
        folga = timedelta(days=DIAS_VALIDOS + 2)
        criados = _criar_pedidos(
            db, [item["produto"] for item in itens for _ in range(item["unidades_atual"])],
            _dias(inicio_atual + folga, fim_atual - timedelta(days=1)), rng, sequencia)
        criados += _criar_pedidos(
            db, [item["produto"] for item in itens for _ in range(item["unidades_anterior"])],
            _dias(inicio_anterior + folga, fim_anterior - timedelta(days=2)), rng, sequencia)
        db.commit()
        print(f"Gravados {criados} pedido(s) de demonstracao.")


if __name__ == "__main__":
    executar(simular="--simular" in sys.argv[1:])
