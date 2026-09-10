from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import PedidoStatusNome
from app.schemas import (
    RelatorioCardapioItem,
    RelatorioCardapioResponse,
    RelatorioOperacionalResponse,
    RelatorioResumoResponse,
    RelatorioVendasResponse,
    TopProdutoResponse,
    VendaHistoricoItem,
    VendasPorDiaItem,
    VendasTimelineItem,
)


STATUS_RECEBIDO_ID = 1
STATUS_EM_PREPARO_ID = 2
STATUS_PRONTO_ID = 3
STATUS_ENTREGUE_ID = 4
STATUS_CANCELADO_ID = 5

router = APIRouter(prefix="/api/relatorios", tags=["relatorios"])


@router.get("/resumo", response_model=RelatorioResumoResponse)
def resumo(inicio: date | None = None, fim: date | None = None, db: Session = Depends(get_db)) -> RelatorioResumoResponse:
    data_inicio, data_fim, inicio_dia, fim_dia = _periodo(inicio, fim, default_30_dias=False)
    status_counts = _counts_by_status(db, inicio_dia, fim_dia)
    faturamento = _faturamento(db, inicio_dia, fim_dia)
    pedidos_pagos = _count_total(db, inicio_dia, fim_dia) - status_counts.get(STATUS_CANCELADO_ID, 0)
    return RelatorioResumoResponse(
        inicio=data_inicio,
        fim=data_fim,
        pedidosRecebidos=status_counts.get(STATUS_RECEBIDO_ID, 0),
        pedidosEmPreparo=status_counts.get(STATUS_EM_PREPARO_ID, 0),
        pedidosProntos=status_counts.get(STATUS_PRONTO_ID, 0),
        pedidosEntregues=status_counts.get(STATUS_ENTREGUE_ID, 0),
        pedidosCancelados=status_counts.get(STATUS_CANCELADO_ID, 0),
        faturamento=_float(faturamento),
        ticketMedio=_float(_ticket_medio(faturamento, pedidos_pagos)),
        topProdutos=_top_produtos(db, inicio_dia, fim_dia, limit=5),
    )


@router.get("/vendas", response_model=RelatorioVendasResponse)
def vendas(inicio: date | None = None, fim: date | None = None, db: Session = Depends(get_db)) -> RelatorioVendasResponse:
    data_inicio, data_fim, inicio_dia, fim_dia = _periodo(inicio, fim, default_30_dias=False)
    status_counts = _counts_by_status(db, inicio_dia, fim_dia)
    total_pedidos = _count_total(db, inicio_dia, fim_dia)
    cancelados = status_counts.get(STATUS_CANCELADO_ID, 0)
    faturamento = _faturamento(db, inicio_dia, fim_dia)
    custo_total = _custo_total(db, inicio_dia, fim_dia)
    pagos = total_pedidos - cancelados
    return RelatorioVendasResponse(
        inicio=data_inicio,
        fim=data_fim,
        faturamento=_float(faturamento),
        ticketMedio=_float(_ticket_medio(faturamento, pagos)),
        custoTotal=_float(custo_total),
        totalPedidos=total_pedidos,
        pedidosEntregues=status_counts.get(STATUS_ENTREGUE_ID, 0),
        pedidosCancelados=cancelados,
        timeline=_timeline(db, data_inicio, data_fim, inicio_dia, fim_dia),
        porDia=_por_dia(db, inicio_dia, fim_dia),
        topProdutos=_top_produtos(db, inicio_dia, fim_dia, limit=10),
        historico=_historico(db, inicio_dia, fim_dia),
    )


@router.get("/cardapio", response_model=RelatorioCardapioResponse)
def cardapio(inicio: date | None = None, fim: date | None = None, db: Session = Depends(get_db)) -> RelatorioCardapioResponse:
    data_inicio, data_fim, inicio_dia, fim_dia = _periodo(inicio, fim, default_30_dias=True)
    del data_inicio, data_fim
    custos = {
        int(row.produto_id): _decimal(row.custo_total)
        for row in db.execute(
            text(
                """
                SELECT i.id_produto AS produto_id,
                       COALESCE(SUM(pi2.quantidade * ins.custo_unitario * i.quantidade), 0) AS custo_total
                FROM item_pedido i
                JOIN pedido p ON p.id_pedido = i.id_pedido
                JOIN produto_insumos pi2 ON pi2.produto_id = i.id_produto
                JOIN insumos ins ON ins.id = pi2.insumo_id
                WHERE p.id_status <> :cancelado
                  AND p.data_hora BETWEEN :inicio AND :fim
                GROUP BY i.id_produto
                """
            ),
            {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio_dia, "fim": fim_dia},
        )
    }
    rows = db.execute(
        text(
            """
            SELECT pr.id_produto AS produto_id,
                   pr.nome,
                   pr.id_categoria,
                   pr.preco AS preco_venda,
                   COALESCE(SUM(i.quantidade), 0) AS quantidade,
                   COALESCE(SUM(i.subtotal), 0) AS faturamento
            FROM item_pedido i
            JOIN pedido p ON p.id_pedido = i.id_pedido
            JOIN produto pr ON pr.id_produto = i.id_produto
            WHERE p.id_status <> :cancelado
              AND p.data_hora BETWEEN :inicio AND :fim
            GROUP BY pr.id_produto, pr.nome, pr.id_categoria, pr.preco
            ORDER BY COALESCE(SUM(i.quantidade), 0) DESC
            """
        ),
        {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio_dia, "fim": fim_dia},
    ).all()

    itens: list[RelatorioCardapioItem] = []
    total_itens = 0
    faturamento_total = Decimal("0")
    for row in rows:
        custo = custos.get(int(row.produto_id), Decimal("0"))
        faturamento = _decimal(row.faturamento)
        quantidade = _decimal(row.quantidade)
        itens.append(
            RelatorioCardapioItem(
                produtoId=int(row.produto_id),
                nome=row.nome,
                idCategoria=int(row.id_categoria),
                precoVenda=_float(row.preco_venda),
                quantidadeVendida=_float(quantidade),
                faturamento=_float(faturamento),
                custoTotal=_float(custo),
                lucro=_float(faturamento - custo),
            )
        )
        total_itens += int(quantidade)
        faturamento_total += faturamento

    return RelatorioCardapioResponse(topProdutos=itens, totalItensVendidos=total_itens, faturamentoTotal=_float(faturamento_total))


@router.get("/operacional", response_model=RelatorioOperacionalResponse)
def operacional(
    inicio: date | None = Query(default=None),
    fim: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> RelatorioOperacionalResponse:
    data_inicio, data_fim, inicio_dia, fim_dia = _periodo(inicio, fim, default_30_dias=False)
    status_counts = _counts_by_status(db, inicio_dia, fim_dia)
    total = _count_total(db, inicio_dia, fim_dia)
    entregues = status_counts.get(STATUS_ENTREGUE_ID, 0)
    cancelados = status_counts.get(STATUS_CANCELADO_ID, 0)
    faturamento = _faturamento(db, inicio_dia, fim_dia)
    pagos = total - cancelados
    taxa_cancelamento = Decimal("0") if total == 0 else Decimal(cancelados * 100 / total).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    taxa_entrega = Decimal("0") if total == 0 else Decimal(entregues * 100 / total).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    tempo_medio = db.scalar(
        text(
            """
            SELECT COALESCE(AVG(diff_min), 0)
            FROM (
                SELECT h_inicio.id_pedido,
                       EXTRACT(EPOCH FROM (h_fim.registrado_em - h_inicio.registrado_em)) / 60.0 AS diff_min
                FROM pedido_status_historico h_inicio
                JOIN pedido_status_historico h_fim
                  ON h_fim.id_pedido = h_inicio.id_pedido
                 AND h_fim.status = 'ENTREGUE'
                WHERE h_inicio.status = 'RECEBIDO'
                  AND h_inicio.registrado_em BETWEEN :inicio AND :fim
            ) AS tempos
            """
        ),
        {"inicio": inicio_dia, "fim": fim_dia},
    )
    return RelatorioOperacionalResponse(
        inicio=data_inicio,
        fim=data_fim,
        totalPedidos=total,
        pedidosEntregues=entregues,
        pedidosCancelados=cancelados,
        pedidosRecebidos=status_counts.get(STATUS_RECEBIDO_ID, 0),
        pedidosEmPreparo=status_counts.get(STATUS_EM_PREPARO_ID, 0),
        pedidosProntos=status_counts.get(STATUS_PRONTO_ID, 0),
        taxaCancelamento=_float(taxa_cancelamento),
        taxaEntrega=_float(taxa_entrega),
        ticketMedio=_float(_ticket_medio(faturamento, pagos)),
        faturamento=_float(faturamento),
        tempoMedioPreparoMin=round(float(tempo_medio or 0), 1),
    )


def _periodo(inicio: date | None, fim: date | None, default_30_dias: bool) -> tuple[date, date, datetime, datetime]:
    hoje = date.today()
    data_inicio = inicio or (hoje - timedelta(days=30) if default_30_dias else hoje)
    data_fim = fim or hoje if default_30_dias else fim or data_inicio
    return data_inicio, data_fim, datetime.combine(data_inicio, time.min), datetime.combine(data_fim, time.max)


def _counts_by_status(db: Session, inicio: datetime, fim: datetime) -> dict[int, int]:
    return {
        int(row.id_status): int(row.quantidade)
        for row in db.execute(
            text(
                """
                SELECT id_status, COUNT(*) AS quantidade
                FROM pedido
                WHERE data_hora BETWEEN :inicio AND :fim
                GROUP BY id_status
                """
            ),
            {"inicio": inicio, "fim": fim},
        )
    }


def _count_total(db: Session, inicio: datetime, fim: datetime) -> int:
    return int(db.scalar(text("SELECT COUNT(*) FROM pedido WHERE data_hora BETWEEN :inicio AND :fim"), {"inicio": inicio, "fim": fim}) or 0)


def _faturamento(db: Session, inicio: datetime, fim: datetime) -> Decimal:
    return _decimal(
        db.scalar(
            text("SELECT COALESCE(SUM(valor_total), 0) FROM pedido WHERE id_status <> :cancelado AND data_hora BETWEEN :inicio AND :fim"),
            {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim},
        )
    )


def _custo_total(db: Session, inicio: datetime, fim: datetime) -> Decimal:
    return _decimal(
        db.scalar(
            text(
                """
                SELECT COALESCE(SUM(pi2.quantidade * ins.custo_unitario * i.quantidade), 0)
                FROM item_pedido i
                JOIN pedido p ON p.id_pedido = i.id_pedido
                JOIN produto_insumos pi2 ON pi2.produto_id = i.id_produto
                JOIN insumos ins ON ins.id = pi2.insumo_id
                WHERE p.id_status <> :cancelado
                  AND p.data_hora BETWEEN :inicio AND :fim
                """
            ),
            {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim},
        )
    )


def _top_produtos(db: Session, inicio: datetime, fim: datetime, limit: int) -> list[TopProdutoResponse]:
    rows = db.execute(
        text(
            """
            SELECT pr.id_produto AS produto_id,
                   pr.nome,
                   COALESCE(SUM(i.quantidade), 0) AS quantidade,
                   COALESCE(SUM(i.subtotal), 0) AS faturamento
            FROM item_pedido i
            JOIN pedido p ON p.id_pedido = i.id_pedido
            JOIN produto pr ON pr.id_produto = i.id_produto
            WHERE p.id_status <> :cancelado
              AND p.data_hora BETWEEN :inicio AND :fim
            GROUP BY pr.id_produto, pr.nome
            ORDER BY COALESCE(SUM(i.quantidade), 0) DESC
            LIMIT :limit
            """
        ),
        {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim, "limit": limit},
    )
    return [
        TopProdutoResponse(
            produtoId=int(row.produto_id),
            nome=row.nome,
            quantidadeVendida=_float(row.quantidade),
            faturamento=_float(row.faturamento),
        )
        for row in rows
    ]


def _timeline(db: Session, data_inicio: date, data_fim: date, inicio: datetime, fim: datetime) -> list[VendasTimelineItem]:
    if data_inicio == data_fim:
        rows = {
            int(row.hora): row
            for row in db.execute(
                text(
                    """
                    SELECT EXTRACT(HOUR FROM data_hora)::int AS hora,
                           COUNT(*) AS quantidade,
                           COALESCE(SUM(valor_total), 0) AS total
                    FROM pedido
                    WHERE data_hora BETWEEN :inicio AND :fim
                      AND id_status <> :cancelado
                    GROUP BY hora
                    ORDER BY hora
                    """
                ),
                {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim},
            )
        }
        return [
            VendasTimelineItem(
                label=f"{hora:02d}:00",
                valor=_float(rows[hora].total) if hora in rows else 0,
                quantidade=int(rows[hora].quantidade) if hora in rows else 0,
            )
            for hora in range(24)
        ]

    by_day = {
        row.dia: row
        for row in db.execute(
            text(
                """
                SELECT DATE(data_hora) AS dia,
                       COUNT(*) AS quantidade,
                       COALESCE(SUM(valor_total), 0) AS total
                FROM pedido
                WHERE data_hora BETWEEN :inicio AND :fim
                  AND id_status <> :cancelado
                GROUP BY dia
                ORDER BY dia
                """
            ),
            {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim},
        )
    }
    dias = (data_fim - data_inicio).days
    return [
        VendasTimelineItem(
            label=(data_inicio + timedelta(days=idx)).strftime("%d/%m"),
            valor=_float(by_day[data_inicio + timedelta(days=idx)].total) if data_inicio + timedelta(days=idx) in by_day else 0,
            quantidade=int(by_day[data_inicio + timedelta(days=idx)].quantidade) if data_inicio + timedelta(days=idx) in by_day else 0,
        )
        for idx in range(dias + 1)
    ]


def _por_dia(db: Session, inicio: datetime, fim: datetime) -> list[VendasPorDiaItem]:
    rows = db.execute(
        text(
            """
            SELECT DATE(data_hora) AS dia,
                   COUNT(*) AS total_pedidos,
                   COALESCE(SUM(CASE WHEN id_status <> :cancelado THEN valor_total ELSE 0 END), 0) AS faturamento,
                   COUNT(CASE WHEN id_status <> :cancelado THEN 1 END) AS pagos
            FROM pedido
            WHERE data_hora BETWEEN :inicio AND :fim
            GROUP BY dia
            HAVING COUNT(*) > 0
            ORDER BY dia
            """
        ),
        {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim},
    )
    itens = []
    for row in rows:
        faturamento = _decimal(row.faturamento)
        pagos = int(row.pagos)
        itens.append(
            VendasPorDiaItem(
                data=row.dia.strftime("%d/%m/%Y"),
                pedidos=int(row.total_pedidos),
                faturamento=_float(faturamento),
                ticketMedio=_float(_ticket_medio(faturamento, pagos)),
            )
        )
    return itens


def _historico(db: Session, inicio: datetime, fim: datetime) -> list[VendaHistoricoItem]:
    mesas = dict(db.execute(text("SELECT id_mesa, numero FROM mesa")).all())
    rows = db.execute(
        text(
            """
            SELECT p.id_pedido AS id,
                   p.data_hora,
                   p.id_mesa,
                   p.id_status,
                   p.valor_total,
                   COALESCE(SUM(i.quantidade), 0) AS total_itens
            FROM pedido p
            LEFT JOIN item_pedido i ON i.id_pedido = p.id_pedido
            WHERE p.data_hora BETWEEN :inicio AND :fim
            GROUP BY p.id_pedido, p.data_hora, p.id_mesa, p.id_status, p.valor_total
            ORDER BY p.data_hora DESC
            LIMIT 200
            """
        ),
        {"inicio": inicio, "fim": fim},
    )
    return [
        VendaHistoricoItem(
            id=int(row.id),
            dataHora=row.data_hora,
            origem="CAIXA" if row.id_mesa is None else "MESA",
            numeroMesa=None if row.id_mesa is None else int(mesas.get(row.id_mesa, row.id_mesa)),
            status=_status_label(int(row.id_status)),
            itens=int(row.total_itens),
            valorTotal=_float(row.valor_total),
        )
        for row in rows
    ]


def _status_label(status_id: int) -> str:
    return {
        STATUS_RECEBIDO_ID: PedidoStatusNome.RECEBIDO.value,
        STATUS_EM_PREPARO_ID: PedidoStatusNome.EM_PREPARO.value,
        STATUS_PRONTO_ID: PedidoStatusNome.PRONTO.value,
        STATUS_ENTREGUE_ID: PedidoStatusNome.ENTREGUE.value,
        STATUS_CANCELADO_ID: PedidoStatusNome.CANCELADO.value,
    }.get(status_id, PedidoStatusNome.RECEBIDO.value)


def _ticket_medio(faturamento: Decimal, pagos: int) -> Decimal:
    if pagos == 0:
        return Decimal("0")
    return (faturamento / Decimal(pagos)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _decimal(value: object) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _float(value: object) -> float:
    return float(_decimal(value))
