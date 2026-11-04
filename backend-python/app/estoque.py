"""Baixa de insumos pela ficha tecnica, com registro de cada movimentacao.

Regras:
- A baixa ocorre quando o preparo comeca, ou na venda de caixa entregue na hora.
- Editar um pedido ja baixado ajusta apenas a diferenca.
- Cancelar antes do preparo nao movimenta nada; depois do preparo o insumo ja foi usado.
- O saldo pode ficar negativo: o estoque registrado nao impede a cozinha de trabalhar.
"""
from collections import defaultdict
from collections.abc import Iterable
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import EstoqueMovimento, Insumo, PedidoItem, ProdutoInsumo


TIPO_BAIXA_PEDIDO = "BAIXA_PEDIDO"
TIPO_AJUSTE_PEDIDO = "AJUSTE_PEDIDO"
TIPO_AJUSTE_MANUAL = "AJUSTE_MANUAL"


def _consumo_dos_itens(db: Session, itens: Iterable[PedidoItem]) -> dict[int, Decimal]:
    quantidades: dict[int, Decimal] = defaultdict(Decimal)
    for item in itens:
        if not item.cancelado:
            quantidades[item.id_produto] += item.quantidade
    if not quantidades:
        return {}

    consumo: dict[int, Decimal] = defaultdict(Decimal)
    fichas = db.execute(
        select(ProdutoInsumo.produto_id, ProdutoInsumo.insumo_id, ProdutoInsumo.quantidade)
        .where(ProdutoInsumo.produto_id.in_(quantidades))
    )
    for produto_id, insumo_id, quantidade in fichas:
        consumo[insumo_id] += quantidade * quantidades[produto_id]
    return consumo


def _consumo_registrado(db: Session, pedido_id: int) -> dict[int, Decimal]:
    linhas = db.execute(
        select(EstoqueMovimento.insumo_id, func.sum(EstoqueMovimento.quantidade))
        .where(EstoqueMovimento.id_pedido == pedido_id)
        .group_by(EstoqueMovimento.insumo_id)
    )
    return {insumo_id: -total for insumo_id, total in linhas}


def sincronizar_estoque_do_pedido(
    db: Session,
    pedido_id: int,
    itens: Iterable[PedidoItem],
    usuario_id: int | None,
    motivo: str,
) -> list[dict]:
    """Aplica somente a diferenca entre o consumo atual e o ja registrado (idempotente).

    Devolve os insumos que acabaram de atingir o estoque minimo.
    """
    consumo = _consumo_dos_itens(db, itens)
    registrado = _consumo_registrado(db, pedido_id)
    diferencas = {
        insumo_id: consumo.get(insumo_id, Decimal("0")) - registrado.get(insumo_id, Decimal("0"))
        for insumo_id in set(consumo) | set(registrado)
    }
    diferencas = {insumo_id: valor for insumo_id, valor in diferencas.items() if valor != 0}
    if not diferencas:
        return []

    tipo = TIPO_AJUSTE_PEDIDO if registrado else TIPO_BAIXA_PEDIDO
    # Ordem fixa nos bloqueios: duas baixas simultaneas nao entram em deadlock.
    insumos = db.scalars(
        select(Insumo).where(Insumo.id.in_(diferencas)).order_by(Insumo.id).with_for_update()
    ).all()

    criticos = []
    for insumo in insumos:
        saldo_anterior = insumo.quantidade_atual
        insumo.quantidade_atual = saldo_anterior - diferencas[insumo.id]
        db.add(EstoqueMovimento(
            insumo_id=insumo.id,
            id_pedido=pedido_id,
            tipo=tipo,
            quantidade=-diferencas[insumo.id],
            saldo_apos=insumo.quantidade_atual,
            id_usuario=usuario_id,
            motivo=motivo[:255],
        ))
        if saldo_anterior > insumo.quantidade_minima >= insumo.quantidade_atual:
            criticos.append({
                "id": insumo.id,
                "nome": insumo.nome,
                "unidade": insumo.unidade,
                "quantidadeAtual": float(insumo.quantidade_atual),
                "quantidadeMinima": float(insumo.quantidade_minima),
            })
    return criticos


def registrar_ajuste_manual(db: Session, insumo: Insumo, nova_quantidade: Decimal, usuario_id: int) -> None:
    diferenca = nova_quantidade - insumo.quantidade_atual
    insumo.quantidade_atual = nova_quantidade
    if diferenca == 0:
        return
    db.add(EstoqueMovimento(
        insumo_id=insumo.id,
        tipo=TIPO_AJUSTE_MANUAL,
        quantidade=diferenca,
        saldo_apos=nova_quantidade,
        id_usuario=usuario_id,
        motivo="Ajuste no cadastro do insumo",
    ))
