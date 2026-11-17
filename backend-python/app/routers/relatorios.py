from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import bcg
from app.db import get_db
from app.models import PedidoStatusNome, Role
from app.schemas import (
    RelatorioBcgItem,
    RelatorioBcgResponse,
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
from app.security import exigir_perfis


STATUS_RECEBIDO_ID = 1
STATUS_EM_PREPARO_ID = 2
STATUS_PRONTO_ID = 3
STATUS_ENTREGUE_ID = 4
STATUS_CANCELADO_ID = 5

router = APIRouter(
    prefix="/api/relatorios",
    tags=["relatorios"],
    dependencies=[Depends(exigir_perfis(Role.ADMIN, Role.GERENTE))],
)


@router.get("/resumo", response_model=RelatorioResumoResponse)
def resumo(inicio: date | None = None, fim: date | None = None, db: Session = Depends(get_db)) -> RelatorioResumoResponse:
    data_inicio, data_fim, inicio_dia, fim_dia = _periodo(inicio, fim, default_30_dias=False)
    status_counts = _counts_by_status(db, inicio_dia, fim_dia)
    valores = _valores_financeiros(db, inicio_dia, fim_dia)
    pedidos_validos = _count_total(db, inicio_dia, fim_dia) - status_counts.get(STATUS_CANCELADO_ID, 0)
    return RelatorioResumoResponse(
        inicio=data_inicio,
        fim=data_fim,
        pedidosRecebidos=status_counts.get(STATUS_RECEBIDO_ID, 0),
        pedidosEmPreparo=status_counts.get(STATUS_EM_PREPARO_ID, 0),
        pedidosProntos=status_counts.get(STATUS_PRONTO_ID, 0),
        pedidosEntregues=status_counts.get(STATUS_ENTREGUE_ID, 0),
        pedidosCancelados=status_counts.get(STATUS_CANCELADO_ID, 0),
        faturamento=_float(valores["lancado"]),
        faturamentoRecebido=_float(valores["recebido"]),
        faturamentoEmAberto=_float(valores["em_aberto"]),
        valorCancelado=_float(valores["cancelado"]),
        ticketMedio=_float(_ticket_medio(valores["lancado"], pedidos_validos)),
        topProdutos=_top_produtos(db, inicio_dia, fim_dia, limit=5),
    )


@router.get("/vendas", response_model=RelatorioVendasResponse)
def vendas(inicio: date | None = None, fim: date | None = None, db: Session = Depends(get_db)) -> RelatorioVendasResponse:
    data_inicio, data_fim, inicio_dia, fim_dia = _periodo(inicio, fim, default_30_dias=False)
    status_counts = _counts_by_status(db, inicio_dia, fim_dia)
    total_pedidos = _count_total(db, inicio_dia, fim_dia)
    cancelados = status_counts.get(STATUS_CANCELADO_ID, 0)
    valores = _valores_financeiros(db, inicio_dia, fim_dia)
    custo_total = _custo_total(db, inicio_dia, fim_dia)
    pedidos_validos = total_pedidos - cancelados
    vendidos = _vendas_por_produto(db, inicio_dia, fim_dia)
    return RelatorioVendasResponse(
        inicio=data_inicio,
        fim=data_fim,
        faturamento=_float(valores["lancado"]),
        faturamentoRecebido=_float(valores["recebido"]),
        faturamentoEmAberto=_float(valores["em_aberto"]),
        valorCancelado=_float(valores["cancelado"]),
        ticketMedio=_float(_ticket_medio(valores["lancado"], pedidos_validos)),
        custoTotal=_float(custo_total),
        produtosSemFicha=len(set(vendidos) - _produtos_com_ficha(db)),
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
    custos = _custos_por_produto(db, inicio_dia, fim_dia)
    com_ficha = _produtos_com_ficha(db)
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
    sem_ficha = 0
    for row in rows:
        custo = custos.get(int(row.produto_id), Decimal("0"))
        tem_ficha = int(row.produto_id) in com_ficha
        sem_ficha += 0 if tem_ficha else 1
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
                lucro=_float(faturamento - custo) if tem_ficha else None,
                temFichaTecnica=tem_ficha,
            )
        )
        total_itens += int(quantidade)
        faturamento_total += faturamento

    return RelatorioCardapioResponse(
        topProdutos=itens,
        totalItensVendidos=total_itens,
        faturamentoTotal=_float(faturamento_total),
        produtosSemFicha=sem_ficha,
    )


@router.get("/bcg", response_model=RelatorioBcgResponse)
def matriz_bcg(inicio: date | None = None, fim: date | None = None, db: Session = Depends(get_db)) -> RelatorioBcgResponse:
    data_inicio, data_fim, inicio_dia, fim_dia = _periodo(inicio, fim, default_30_dias=True)
    dias = (data_fim - data_inicio).days + 1
    if dias <= 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A data inicial deve ser anterior à data final.")
    # Periodo anterior: mesma duracao, imediatamente antes do selecionado.
    fim_anterior = data_inicio - timedelta(days=1)
    inicio_anterior = fim_anterior - timedelta(days=dias - 1)

    produtos = db.execute(text("SELECT id_produto, nome, id_categoria FROM produto WHERE ativo ORDER BY nome")).all()
    atuais = _vendas_por_produto(db, inicio_dia, fim_dia)
    anteriores = _vendas_por_produto(db, datetime.combine(inicio_anterior, time.min), datetime.combine(fim_anterior, time.max))
    custos = _custos_por_produto(db, inicio_dia, fim_dia)
    com_ficha = _produtos_com_ficha(db)

    zero = (Decimal("0"), Decimal("0"))
    total_atual = sum((atuais.get(int(p.id_produto), zero)[1] for p in produtos), Decimal("0"))
    total_anterior = sum((anteriores.get(int(p.id_produto), zero)[1] for p in produtos), Decimal("0"))
    limite = bcg.limite_participacao(len(produtos))

    itens = []
    for produto in produtos:
        produto_id = int(produto.id_produto)
        quantidade, faturamento = atuais.get(produto_id, zero)
        faturamento_anterior = anteriores.get(produto_id, zero)[1]
        participacao = float(faturamento * 100 / total_atual) if total_atual > 0 else 0.0
        crescimento = bcg.crescimento_percentual(faturamento, faturamento_anterior)
        classificacao = bcg.classificar(participacao, crescimento, limite, vendeu=faturamento > 0)
        tem_ficha = produto_id in com_ficha
        itens.append(RelatorioBcgItem(
            produtoId=produto_id,
            nome=produto.nome,
            idCategoria=int(produto.id_categoria),
            quantidadeVendida=_float(quantidade),
            faturamento=_float(faturamento),
            faturamentoAnterior=_float(faturamento_anterior),
            participacao=round(participacao, 2),
            crescimento=None if crescimento is None else round(crescimento, 1),
            classificacao=classificacao,
            acaoSugerida=bcg.ACOES[classificacao],
            lucro=_float(faturamento - custos.get(produto_id, Decimal("0"))) if tem_ficha else None,
            temFichaTecnica=tem_ficha,
        ))
    itens.sort(key=lambda item: (-item.faturamento, item.nome))

    crescimento_total = bcg.crescimento_percentual(total_atual, total_anterior)
    return RelatorioBcgResponse(
        inicio=data_inicio,
        fim=data_fim,
        inicioAnterior=inicio_anterior,
        fimAnterior=fim_anterior,
        faturamentoTotal=_float(total_atual),
        faturamentoAnterior=_float(total_anterior),
        crescimentoTotal=None if crescimento_total is None else round(crescimento_total, 1),
        limiteParticipacao=round(limite, 2),
        limiteCrescimento=bcg.LIMITE_CRESCIMENTO,
        itens=itens,
    )


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


def _valores_financeiros(db: Session, inicio: datetime, fim: datetime) -> dict[str, Decimal]:
    """Lancado = recebido + em aberto. ENTREGUE exige pagamento, inclusive em registros antigos."""
    linha = db.execute(
        text(
            """
            SELECT
              COALESCE(SUM(valor_total) FILTER (WHERE id_status <> :cancelado), 0) AS lancado,
              COALESCE(SUM(valor_total) FILTER (WHERE id_status <> :cancelado AND (pago_em IS NOT NULL OR id_status = :entregue)), 0) AS recebido,
              COALESCE(SUM(valor_total) FILTER (WHERE id_status NOT IN (:cancelado, :entregue) AND pago_em IS NULL), 0) AS em_aberto,
              COALESCE(SUM(valor_total) FILTER (WHERE id_status = :cancelado), 0) AS cancelado
            FROM pedido
            WHERE data_hora BETWEEN :inicio AND :fim
            """
        ),
        {"cancelado": STATUS_CANCELADO_ID, "entregue": STATUS_ENTREGUE_ID, "inicio": inicio, "fim": fim},
    ).one()
    return {
        "lancado": _decimal(linha.lancado),
        "recebido": _decimal(linha.recebido),
        "em_aberto": _decimal(linha.em_aberto),
        "cancelado": _decimal(linha.cancelado),
    }


def _produtos_com_ficha(db: Session) -> set[int]:
    return {int(produto_id) for produto_id in db.scalars(text("SELECT DISTINCT produto_id FROM produto_insumos"))}


def _vendas_por_produto(db: Session, inicio: datetime, fim: datetime) -> dict[int, tuple[Decimal, Decimal]]:
    """Produto -> (quantidade, faturamento) dos pedidos nao cancelados no periodo."""
    return {
        int(row.id_produto): (_decimal(row.quantidade), _decimal(row.faturamento))
        for row in db.execute(
            text(
                """
                SELECT i.id_produto, SUM(i.quantidade) AS quantidade, SUM(i.subtotal) AS faturamento
                FROM item_pedido i
                JOIN pedido p ON p.id_pedido = i.id_pedido
                WHERE p.id_status <> :cancelado
                  AND NOT i.cancelado
                  AND p.data_hora BETWEEN :inicio AND :fim
                GROUP BY i.id_produto
                """
            ),
            {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim},
        )
    }


def _custos_por_produto(db: Session, inicio: datetime, fim: datetime) -> dict[int, Decimal]:
    return {
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
            {"cancelado": STATUS_CANCELADO_ID, "inicio": inicio, "fim": fim},
        )
    }


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
