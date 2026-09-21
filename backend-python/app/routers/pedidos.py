import math
import time
from datetime import datetime
from decimal import Decimal

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Mesa, Pedido, PedidoItem, PedidoStatusHistorico, PedidoStatusNome, Produto
from app.realtime import manager
from app.schemas import PedidoCreateRequest, PaginatedPedidoResponse, PedidoResponse, PedidoStatusUpdateRequest


STATUS_RECEBIDO_ID = 1
STATUS_EM_PREPARO_ID = 2
STATUS_PRONTO_ID = 3
STATUS_ENTREGUE_ID = 4
STATUS_CANCELADO_ID = 5
STATUS_SERVIDO_ID = 6
STATUS_ATIVOS = (STATUS_RECEBIDO_ID, STATUS_EM_PREPARO_ID, STATUS_PRONTO_ID, STATUS_SERVIDO_ID)

router = APIRouter(prefix="/api/pedidos", tags=["pedidos"])


@router.post("", response_model=PedidoResponse, status_code=status.HTTP_201_CREATED)
def criar_pedido(request: PedidoCreateRequest, db: Session = Depends(get_db)) -> PedidoResponse:
    venda_caixa = request.vendaCaixa is True
    _validar_criacao(request, venda_caixa)
    mesa = _resolver_mesa(db, request, venda_caixa)

    now = datetime.now()
    pedido = Pedido(
        id_mesa=None if mesa is None else mesa.id,
        id_status=STATUS_RECEBIDO_ID,
        numero_pedido=_gerar_numero_pedido(),
        data_hora=now,
        observacoes=_observacoes_pedido(request, venda_caixa),
        atualizado_em=now,
        valor_total=Decimal("0"),
    )
    db.add(pedido)
    db.flush()

    itens = [_criar_item(db, pedido, item.produtoId, item.quantidade) for item in request.itens]
    todos_instantaneos = venda_caixa and all(item.produto.tempo_preparo is not None and item.produto.tempo_preparo == 0 for item in itens)
    pedido.id_status = STATUS_ENTREGUE_ID if todos_instantaneos else STATUS_RECEBIDO_ID
    pedido.valor_total = _total_pedido(sum((_subtotal_do_item(item) for item in itens), Decimal("0")), request, venda_caixa)

    db.add_all(itens)
    db.add(PedidoStatusHistorico(id_pedido=pedido.id, status=_to_status(pedido.id_status).value, registrado_em=now))
    db.commit()
    db.refresh(pedido)
    response = _to_response(_get_pedido_with_itens(db, pedido.id), _mesa_map(db))
    _publicar_evento("VENDA_CAIXA" if todos_instantaneos else "NOVO_PEDIDO", response)
    return response


@router.get("/ativos", response_model=list[PedidoResponse])
def listar_ativos(db: Session = Depends(get_db)) -> list[PedidoResponse]:
    pedidos = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .where(Pedido.id_status.in_(STATUS_ATIVOS))
        .order_by(Pedido.data_hora.asc())
    ).unique().all()
    return [_to_response(pedido, _mesa_map(db)) for pedido in pedidos]


@router.get("", response_model=PaginatedPedidoResponse)
def listar_pedidos(
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1),
    db: Session = Depends(get_db),
) -> PaginatedPedidoResponse:
    safe_size = min(size, 200)
    total = db.scalar(select(func.count(Pedido.id))) or 0
    pedidos = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .order_by(Pedido.data_hora.desc())
        .offset(page * safe_size)
        .limit(safe_size)
    ).unique().all()
    return PaginatedPedidoResponse(
        content=[_to_response(pedido, _mesa_map(db)) for pedido in pedidos],
        page=page,
        size=safe_size,
        totalElements=total,
        totalPages=math.ceil(total / safe_size) if total else 0,
    )


@router.get("/mesa/{numero_mesa}", response_model=list[PedidoResponse])
def listar_por_mesa(numero_mesa: int, db: Session = Depends(get_db)) -> list[PedidoResponse]:
    mesa = db.scalar(select(Mesa).where(Mesa.numero == numero_mesa, Mesa.ativo.is_(True)))
    if mesa is None:
        return []

    pedidos = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .where(Pedido.id_mesa == mesa.id)
        .order_by(Pedido.data_hora.desc())
    ).unique().all()
    return [_to_response(pedido, _mesa_map(db)) for pedido in pedidos]


@router.get("/{pedido_id}", response_model=PedidoResponse)
def obter_pedido(pedido_id: int, db: Session = Depends(get_db)) -> PedidoResponse:
    return _to_response(_get_pedido_with_itens(db, pedido_id), _mesa_map(db))


@router.put("/{pedido_id}/status", response_model=PedidoResponse)
def atualizar_status(
    pedido_id: int,
    request: PedidoStatusUpdateRequest,
    db: Session = Depends(get_db),
) -> PedidoResponse:
    pedido = db.get(Pedido, pedido_id)
    if pedido is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pedido nao encontrado: {pedido_id}")

    pedido.id_status = _to_status_id(request.status)
    pedido.atualizado_em = datetime.now()
    if request.status == PedidoStatusNome.ENTREGUE and request.formaPagamento and request.formaPagamento.strip():
        obs = "" if pedido.observacoes is None else pedido.observacoes.strip()
        tag = "Pagamento: " + request.formaPagamento.strip().upper()
        if "Pagamento:" not in obs:
            pedido.observacoes = tag if not obs else f"{obs} | {tag}"

    db.add(PedidoStatusHistorico(id_pedido=pedido.id, status=request.status.value, registrado_em=datetime.now()))
    db.add(pedido)
    db.commit()
    response = _to_response(_get_pedido_with_itens(db, pedido_id), _mesa_map(db))
    _publicar_evento("PEDIDO_ATUALIZADO", response)
    return response


def _validar_criacao(request: PedidoCreateRequest, venda_caixa: bool) -> None:
    if venda_caixa:
        if request.formaPagamento is None or not request.formaPagamento.strip():
            raise HTTPException(status_code=400, detail="Forma de pagamento obrigatoria para venda no caixa.")
        return
    if request.mesaId is None and request.numeroMesa is None:
        raise HTTPException(status_code=400, detail="Mesa obrigatoria para pedidos de salao.")


def _resolver_mesa(db: Session, request: PedidoCreateRequest, venda_caixa: bool) -> Mesa | None:
    if venda_caixa:
        return None
    if request.mesaId is not None:
        mesa = db.get(Mesa, request.mesaId)
        if mesa is None:
            raise HTTPException(status_code=404, detail=f"Mesa nao encontrada: {request.mesaId}")
        return mesa
    mesa = db.scalar(select(Mesa).where(Mesa.numero == request.numeroMesa, Mesa.ativo.is_(True)))
    if mesa is None:
        raise HTTPException(status_code=404, detail=f"Mesa nao encontrada: {request.numeroMesa}")
    return mesa


def _criar_item(db: Session, pedido: Pedido, produto_id: int, quantidade: int) -> PedidoItem:
    produto = db.get(Produto, produto_id)
    if produto is None:
        raise HTTPException(status_code=404, detail=f"Produto nao encontrado: {produto_id}")
    quantidade_decimal = Decimal(quantidade)
    return PedidoItem(
        id_pedido=pedido.id,
        produto=produto,
        id_produto=produto.id,
        quantidade=quantidade_decimal,
        preco_unitario=produto.preco,
        cancelado=False,
    )


def _get_pedido_with_itens(db: Session, pedido_id: int) -> Pedido:
    pedido = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .where(Pedido.id == pedido_id)
    ).unique().first()
    if pedido is None:
        raise HTTPException(status_code=404, detail=f"Pedido nao encontrado: {pedido_id}")
    return pedido


def _gerar_numero_pedido() -> str:
    return f"P{int(time.time() * 1000)}"


def _observacoes_pedido(request: PedidoCreateRequest, venda_caixa: bool) -> str | None:
    obs = "" if request.observacoes is None else request.observacoes.strip()
    if not venda_caixa:
        return obs or None
    forma = "NAO_INFORMADO" if request.formaPagamento is None else request.formaPagamento.strip()
    prefixo = f"Venda no caixa - pagamento: {forma}"
    return prefixo if not obs else f"{prefixo} - {obs}"


def _total_pedido(total_itens: Decimal, request: PedidoCreateRequest, venda_caixa: bool) -> Decimal:
    if not venda_caixa or request.desconto is None or request.desconto <= 0:
        return total_itens
    return total_itens - min(request.desconto, total_itens)


def _subtotal_do_item(item: PedidoItem) -> Decimal:
    if item.subtotal is not None:
        return item.subtotal
    return item.preco_unitario * item.quantidade


def _mesa_map(db: Session) -> dict[int, int]:
    return dict(db.execute(select(Mesa.id, Mesa.numero)).all())


def _numero_mesa(id_mesa: int | None, mesas: dict[int, int]) -> int | None:
    if id_mesa is None:
        return None
    return mesas.get(id_mesa, id_mesa)


def _to_status_id(status_nome: PedidoStatusNome) -> int:
    return {
        PedidoStatusNome.RECEBIDO: STATUS_RECEBIDO_ID,
        PedidoStatusNome.EM_PREPARO: STATUS_EM_PREPARO_ID,
        PedidoStatusNome.PRONTO: STATUS_PRONTO_ID,
        PedidoStatusNome.ENTREGUE: STATUS_ENTREGUE_ID,
        PedidoStatusNome.SERVIDO: STATUS_SERVIDO_ID,
        PedidoStatusNome.CANCELADO: STATUS_CANCELADO_ID,
    }[status_nome]


def _to_status(status_id: int) -> PedidoStatusNome:
    return {
        STATUS_RECEBIDO_ID: PedidoStatusNome.RECEBIDO,
        STATUS_EM_PREPARO_ID: PedidoStatusNome.EM_PREPARO,
        STATUS_PRONTO_ID: PedidoStatusNome.PRONTO,
        STATUS_ENTREGUE_ID: PedidoStatusNome.ENTREGUE,
        STATUS_CANCELADO_ID: PedidoStatusNome.CANCELADO,
        STATUS_SERVIDO_ID: PedidoStatusNome.SERVIDO,
    }.get(status_id, PedidoStatusNome.RECEBIDO)


def _to_response(pedido: Pedido, mesas: dict[int, int]) -> PedidoResponse:
    itens = [
        {
            "produtoId": item.produto.id,
            "nomeProduto": item.produto.nome,
            "quantidade": int(item.quantidade),
            "precoUnitario": float(item.preco_unitario),
            "subtotal": float(_subtotal_do_item(item)),
            "tempoPreparo": item.produto.tempo_preparo,

        }
        for item in pedido.itens
    ]
    return PedidoResponse(
        id=pedido.id,
        numeroMesa=_numero_mesa(pedido.id_mesa, mesas),
        origem="CAIXA" if pedido.id_mesa is None else "MESA",
        status=_to_status(pedido.id_status),
        dataHora=pedido.data_hora,
        valorTotal=float(pedido.valor_total),
        observacoes=pedido.observacoes,
        itens=itens,
    )


def _publicar_evento(tipo: str, pedido: PedidoResponse) -> None:
    anyio.from_thread.run(manager.broadcast, {"type": tipo, "pedido": pedido.model_dump(mode="json")})
