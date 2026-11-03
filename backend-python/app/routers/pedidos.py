import math
import re
import time
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Cliente, Mesa, Pedido, PedidoItem, PedidoStatusHistorico, PedidoStatusNome, Produto, Role, User
from app.realtime import manager
from app.security import exigir_perfis, get_usuario_atual, get_usuario_opcional
from app.schemas import PedidoCreateRequest, PedidoEditRequest, PaginatedPedidoResponse, PedidoResponse, PedidoStatusUpdateRequest


STATUS_RECEBIDO_ID = 1
STATUS_EM_PREPARO_ID = 2
STATUS_PRONTO_ID = 3
STATUS_ENTREGUE_ID = 4
STATUS_CANCELADO_ID = 5
STATUS_SERVIDO_ID = 6
STATUS_ATIVOS = (STATUS_RECEBIDO_ID, STATUS_EM_PREPARO_ID, STATUS_PRONTO_ID, STATUS_SERVIDO_ID)

LIMITE_DESCONTO_PERCENTUAL = Decimal("10")
MESA_STATUS_LIBERADOS = ("livre", "reservada")

PERFIS_CRIAM_PEDIDO = {Role.GERENTE.value, Role.FUNCIONARIO.value, Role.CAIXA.value}
PERFIS_RECURSOS_CAIXA = {Role.GERENTE.value, Role.CAIXA.value}
PERFIS_CONSULTA_PEDIDO = {
    Role.GERENTE.value,
    Role.ADMIN.value,
    Role.FUNCIONARIO.value,
    Role.CAIXA.value,
    Role.COZINHA.value,
}

_S = PedidoStatusNome
_COZINHA_GERENTE = frozenset({Role.COZINHA.value, Role.GERENTE.value})
_CAIXA_GERENTE = frozenset({Role.CAIXA.value, Role.GERENTE.value})
_SOMENTE_GERENTE = frozenset({Role.GERENTE.value})
# (origem, destino) -> perfis autorizados (RN-AC32, RN-AC41). Fora desta tabela: 409.
TRANSICOES_STATUS: dict[tuple[PedidoStatusNome, PedidoStatusNome], frozenset[str]] = {
    (_S.RECEBIDO, _S.EM_PREPARO): _COZINHA_GERENTE,
    (_S.EM_PREPARO, _S.PRONTO): _COZINHA_GERENTE,
    (_S.RECEBIDO, _S.PRONTO): _COZINHA_GERENTE,
    (_S.PRONTO, _S.SERVIDO): frozenset({Role.FUNCIONARIO.value, Role.GERENTE.value}),
    (_S.PRONTO, _S.ENTREGUE): _CAIXA_GERENTE,
    (_S.SERVIDO, _S.ENTREGUE): _CAIXA_GERENTE,
    (_S.RECEBIDO, _S.CANCELADO): frozenset({Role.FUNCIONARIO.value, Role.CAIXA.value, Role.GERENTE.value}),
    (_S.EM_PREPARO, _S.CANCELADO): _SOMENTE_GERENTE,
    (_S.PRONTO, _S.CANCELADO): _SOMENTE_GERENTE,
    (_S.SERVIDO, _S.CANCELADO): _SOMENTE_GERENTE,
}

exigir_operacao = exigir_perfis(Role.GERENTE, Role.FUNCIONARIO, Role.CAIXA, Role.COZINHA)
exigir_historico = exigir_perfis(Role.GERENTE, Role.ADMIN, Role.CAIXA)

router = APIRouter(prefix="/api/pedidos", tags=["pedidos"])


@router.post("", response_model=PedidoResponse, status_code=status.HTTP_201_CREATED)
def criar_pedido(
    request: PedidoCreateRequest,
    db: Session = Depends(get_db),
    usuario: User | None = Depends(get_usuario_opcional),
) -> PedidoResponse:
    venda_caixa = request.vendaCaixa is True
    _autorizar_criacao(request, usuario, venda_caixa)
    _validar_criacao(request, venda_caixa)
    mesa = _resolver_mesa(db, request, venda_caixa, anonimo=usuario is None)
    produtos = _resolver_produtos(db, request)
    subtotal_itens = sum(
        (produtos[item.produtoId].preco * Decimal(item.quantidade) for item in request.itens),
        Decimal("0"),
    )
    _validar_desconto(request, usuario, subtotal_itens, venda_caixa)
    cliente = _resolver_cliente(db, request.clienteId)

    now = datetime.now()
    pedido = Pedido(
        id_mesa=None if mesa is None else mesa.id,
        cliente=cliente,
        id_status=STATUS_RECEBIDO_ID,
        numero_pedido=_gerar_numero_pedido(),
        data_hora=now,
        observacoes=_observacoes_pedido(request, venda_caixa),
        atualizado_em=now,
        valor_total=Decimal("0"),
    )
    db.add(pedido)
    if mesa is not None and mesa.status in MESA_STATUS_LIBERADOS:
        mesa.status = "ocupada"
        db.add(mesa)
    db.flush()

    itens = [_criar_item(pedido, produtos[item.produtoId], item.quantidade) for item in request.itens]
    todos_instantaneos = venda_caixa and all(item.produto.tempo_preparo is not None and item.produto.tempo_preparo == 0 for item in itens)
    pedido.id_status = STATUS_ENTREGUE_ID if todos_instantaneos else STATUS_RECEBIDO_ID
    pedido.valor_total = _total_pedido(sum((_subtotal_do_item(item) for item in itens), Decimal("0")), request, venda_caixa)

    db.add_all(itens)
    db.add(
        PedidoStatusHistorico(
            id_pedido=pedido.id,
            status=_to_status(pedido.id_status).value,
            registrado_em=now,
            id_usuario=None if usuario is None else usuario.id,
        )
    )
    db.commit()
    db.refresh(pedido)
    response = _to_response(_get_pedido_with_itens(db, pedido.id), _mesa_map(db))
    _publicar_evento("VENDA_CAIXA" if todos_instantaneos else "NOVO_PEDIDO", response)
    # O token de acompanhamento so e devolvido a quem criou o pedido, nunca nos eventos.
    return response.model_copy(update={"tokenAcesso": str(pedido.token_acesso)})


@router.get("/ativos", response_model=list[PedidoResponse], dependencies=[Depends(exigir_operacao)])
def listar_ativos(db: Session = Depends(get_db)) -> list[PedidoResponse]:
    pedidos = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .options(joinedload(Pedido.cliente))
        .where(Pedido.id_status.in_(STATUS_ATIVOS))
        .order_by(Pedido.data_hora.asc())
    ).unique().all()
    return [_to_response(pedido, _mesa_map(db)) for pedido in pedidos]


@router.get("", response_model=PaginatedPedidoResponse, dependencies=[Depends(exigir_historico)])
def listar_pedidos(
    page: int = Query(default=0, ge=0),
    size: int = Query(default=50, ge=1),
    data: date | None = Query(default=None),
    status: list[PedidoStatusNome] | None = Query(default=None),
    db: Session = Depends(get_db),
) -> PaginatedPedidoResponse:
    safe_size = min(size, 200)
    filters = []
    if data is not None:
        inicio = datetime.combine(data, datetime.min.time())
        filters.extend((Pedido.data_hora >= inicio, Pedido.data_hora < inicio + timedelta(days=1)))
    if status:
        filters.append(Pedido.id_status.in_([_to_status_id(item) for item in status]))
    total = db.scalar(select(func.count(Pedido.id)).where(*filters)) or 0
    pedidos = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .options(joinedload(Pedido.cliente))
        .where(*filters)
        .order_by(Pedido.data_hora.desc(), Pedido.id.desc())
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


@router.get("/mesa/{numero_mesa}", response_model=list[PedidoResponse], dependencies=[Depends(exigir_operacao)])
def listar_por_mesa(numero_mesa: int, db: Session = Depends(get_db)) -> list[PedidoResponse]:
    mesa = db.scalar(select(Mesa).where(Mesa.numero == numero_mesa, Mesa.ativo.is_(True)))
    if mesa is None:
        return []

    pedidos = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .options(joinedload(Pedido.cliente))
        .where(Pedido.id_mesa == mesa.id)
        .order_by(Pedido.data_hora.desc())
    ).unique().all()
    return [_to_response(pedido, _mesa_map(db)) for pedido in pedidos]


@router.get("/{pedido_id}", response_model=PedidoResponse)
def obter_pedido(
    pedido_id: int,
    token: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
    usuario: User | None = Depends(get_usuario_opcional),
) -> PedidoResponse:
    if usuario is not None:
        if usuario.role not in PERFIS_CONSULTA_PEDIDO:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
        return _to_response(_get_pedido_with_itens(db, pedido_id), _mesa_map(db))

    # Cliente anonimo: somente o proprio pedido, com o token de acompanhamento.
    token_acesso = _parse_uuid(token)
    pedido = None if token_acesso is None else _get_pedido_with_itens(db, pedido_id)
    if pedido is None or pedido.token_acesso != token_acesso:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Pedido nao encontrado: {pedido_id}")
    return _to_response(pedido, _mesa_map(db))


@router.put("/{pedido_id}/itens", response_model=PedidoResponse)
def editar_pedido(
    pedido_id: int,
    request: PedidoEditRequest,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.COZINHA, Role.GERENTE)),
) -> PedidoResponse:
    pedido = db.scalar(select(Pedido).where(Pedido.id == pedido_id).with_for_update())
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")
    if pedido.id_status not in (STATUS_RECEBIDO_ID, STATUS_EM_PREPARO_ID, STATUS_PRONTO_ID):
        raise HTTPException(status_code=409, detail="Somente pedidos na fila da cozinha podem ser alterados")
    if pedido.atualizado_em != request.atualizadoEm:
        raise HTTPException(status_code=409, detail="O pedido mudou. Reabra a edicao para carregar a versao atual.")
    if len({item.produtoId for item in request.itens}) != len(request.itens):
        raise HTTPException(status_code=422, detail="Agrupe as quantidades de cada produto em uma unica linha")
    motivo = request.motivo.strip()
    if len(motivo) < 3:
        raise HTTPException(status_code=422, detail="Informe o motivo da alteracao")
    produtos = _resolver_produtos(db, request)
    anteriores = {item.id_produto: item for item in pedido.itens if not item.cancelado}
    subtotal_anterior = sum((_subtotal_do_item(item) for item in anteriores.values()), Decimal("0"))
    desconto = max(Decimal("0"), subtotal_anterior - pedido.valor_total)
    resumo_anterior = ", ".join(f"{item.quantidade}x {item.produto.nome}" for item in anteriores.values())
    novas_linhas = []
    for item in request.itens:
        linha = _criar_item(pedido, produtos[item.produtoId], item.quantidade)
        if item.produtoId in anteriores:
            linha.preco_unitario = anteriores[item.produtoId].preco_unitario
        novas_linhas.append(linha)
    subtotal = sum((_subtotal_do_item(item) for item in novas_linhas), Decimal("0"))
    pedido.itens = novas_linhas
    pedido.valor_total = max(Decimal("0"), subtotal - desconto)
    obs = _texto_ou_none(request.observacoes)
    # Dados financeiros registrados pelo caixa nao podem desaparecer na edicao.
    tags = [parte.strip() for parte in (pedido.observacoes or "").split("|")
            if parte.strip().startswith(("Pagamento:", "Desconto:"))]
    for tag in tags:
        if tag not in (obs or ""):
            obs = f"{obs} | {tag}" if obs else tag
    observacoes_anteriores = pedido.observacoes
    pedido.observacoes = obs
    # Pedido pronto volta ao preparo para a cozinha conferir a alteracao.
    if pedido.id_status == STATUS_PRONTO_ID:
        pedido.id_status = STATUS_EM_PREPARO_ID
    pedido.atualizado_em = datetime.now()
    resumo_novo = ", ".join(f"{item.quantidade}x {item.produto.nome}" for item in novas_linhas)
    db.add(PedidoStatusHistorico(
        id_pedido=pedido.id, status=_to_status(pedido.id_status).value,
        registrado_em=pedido.atualizado_em, id_usuario=usuario.id,
        motivo=f"Edicao: {motivo}. Antes: {resumo_anterior}. Depois: {resumo_novo}. Obs anterior: {observacoes_anteriores or '-'}"[:255],
    ))
    db.commit()
    response = _to_response(_get_pedido_with_itens(db, pedido_id), _mesa_map(db))
    _publicar_evento("PEDIDO_ATUALIZADO", response)
    return response


@router.put("/{pedido_id}/despacho", response_model=PedidoResponse)
def despachar_balcao(
    pedido_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.FUNCIONARIO, Role.GERENTE)),
) -> PedidoResponse:
    pedido = db.scalar(select(Pedido).where(Pedido.id == pedido_id).with_for_update())
    if pedido is None:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")
    if pedido.id_mesa is not None or pedido.id_status != STATUS_PRONTO_ID:
        raise HTTPException(status_code=409, detail="Somente pedidos de balcao prontos podem ser retirados")
    if not re.search(r"(?:Pagamento:|Venda no caixa - pagamento:)\s*(PIX|DEBITO|CREDITO|DINHEIRO)\b", pedido.observacoes or "", re.IGNORECASE):
        raise HTTPException(status_code=409, detail="Confirme o pagamento no caixa antes de entregar o pedido")
    pedido.id_status = STATUS_ENTREGUE_ID
    pedido.atualizado_em = datetime.now()
    db.add(PedidoStatusHistorico(id_pedido=pedido.id, status="ENTREGUE",
        registrado_em=pedido.atualizado_em, id_usuario=usuario.id,
        motivo="Retirada no balcao; pagamento ja registrado pelo caixa"))
    db.commit()
    response = _to_response(_get_pedido_with_itens(db, pedido.id), _mesa_map(db))
    _publicar_evento("PEDIDO_ATUALIZADO", response)
    return response


@router.put("/{pedido_id}/status", response_model=PedidoResponse)
def atualizar_status(
    pedido_id: int,
    request: PedidoStatusUpdateRequest,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
) -> PedidoResponse:
    # Lock da linha do pedido: transicoes concorrentes nao podem partir do mesmo estado.
    pedido = db.scalar(select(Pedido).where(Pedido.id == pedido_id).with_for_update())
    if pedido is None:
        raise HTTPException(status_code=404, detail=f"Pedido nao encontrado: {pedido_id}")

    origem = _to_status(pedido.id_status)
    destino = request.status
    perfis = TRANSICOES_STATUS.get((origem, destino))
    if perfis is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Transicao de status invalida")
    _autorizar_transicao(pedido, origem, destino, perfis, usuario)

    motivo = _texto_ou_none(request.motivo)
    forma_pagamento = _texto_ou_none(request.formaPagamento)
    if destino == PedidoStatusNome.CANCELADO and motivo is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Motivo do cancelamento e obrigatorio")
    if destino == PedidoStatusNome.ENTREGUE and forma_pagamento is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Forma de pagamento obrigatoria para finalizar o pedido",
        )

    agora = datetime.now()
    pedido.id_status = _to_status_id(destino)
    pedido.atualizado_em = agora
    if destino == PedidoStatusNome.ENTREGUE:
        obs = "" if pedido.observacoes is None else pedido.observacoes.strip()
        tag = "Pagamento: " + forma_pagamento.upper()
        if "Pagamento:" not in obs:
            pedido.observacoes = tag if not obs else f"{obs} | {tag}"

    db.add(
        PedidoStatusHistorico(
            id_pedido=pedido.id,
            status=destino.value,
            registrado_em=agora,
            id_usuario=usuario.id,
            motivo=motivo,
        )
    )
    db.add(pedido)
    db.commit()
    response = _to_response(_get_pedido_with_itens(db, pedido_id), _mesa_map(db))
    _publicar_evento("PEDIDO_ATUALIZADO", response)
    return response


def _autorizar_transicao(
    pedido: Pedido,
    origem: PedidoStatusNome,
    destino: PedidoStatusNome,
    perfis: frozenset[str],
    usuario: User,
) -> None:
    if usuario.role in perfis:
        return
    # Caixa pode marcar como pronto um pedido sem nenhum item que exija preparo.
    if (
        origem == PedidoStatusNome.RECEBIDO
        and destino == PedidoStatusNome.PRONTO
        and usuario.role == Role.CAIXA
        and not _possui_item_com_preparo(pedido)
    ):
        return
    if destino == PedidoStatusNome.CANCELADO and usuario.role in (Role.FUNCIONARIO, Role.CAIXA):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cancelamento apos o inicio do preparo exige o perfil Gerente",
        )
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")


def _possui_item_com_preparo(pedido: Pedido) -> bool:
    return any(
        not item.cancelado and (item.produto.tempo_preparo is None or item.produto.tempo_preparo > 0)
        for item in pedido.itens
    )


def _autorizar_criacao(request: PedidoCreateRequest, usuario: User | None, venda_caixa: bool) -> None:
    usa_recurso_caixa = (
        venda_caixa
        or (request.desconto is not None and request.desconto > 0)
        or request.clienteId is not None
    )
    if usuario is None:
        if usa_recurso_caixa:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
        if request.mesaToken is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Leia o QR Code da mesa para fazer o pedido",
            )
        return
    if usuario.role not in PERFIS_CRIAM_PEDIDO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
    if usa_recurso_caixa and usuario.role not in PERFIS_RECURSOS_CAIXA:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")


def _validar_desconto(request: PedidoCreateRequest, usuario: User | None, subtotal: Decimal, venda_caixa: bool) -> None:
    if request.desconto is None or request.desconto == 0:
        return
    if request.desconto < 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Desconto nao pode ser negativo")
    if not venda_caixa:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Desconto so pode ser aplicado em venda no caixa",
        )
    if request.desconto > subtotal:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Desconto nao pode ser maior que o subtotal",
        )
    if usuario is not None and usuario.role == Role.CAIXA:
        limite = subtotal * LIMITE_DESCONTO_PERCENTUAL / Decimal("100")
        if request.desconto > limite:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Desconto acima do limite de 10% exige o perfil Gerente",
            )


def _validar_criacao(request: PedidoCreateRequest, venda_caixa: bool) -> None:
    if venda_caixa:
        if request.formaPagamento is None or not request.formaPagamento.strip():
            raise HTTPException(status_code=400, detail="Forma de pagamento obrigatoria para venda no caixa.")
        return
    if request.mesaId is None and request.numeroMesa is None and request.mesaToken is None:
        raise HTTPException(status_code=400, detail="Mesa obrigatoria para pedidos de salao.")


def _resolver_mesa(db: Session, request: PedidoCreateRequest, venda_caixa: bool, anonimo: bool) -> Mesa | None:
    if venda_caixa:
        return None
    if request.mesaToken is not None:
        mesa = db.scalar(select(Mesa).where(Mesa.qr_code_token == request.mesaToken, Mesa.ativo.is_(True)))
        if mesa is None:
            codigo = status.HTTP_403_FORBIDDEN if anonimo else status.HTTP_404_NOT_FOUND
            raise HTTPException(status_code=codigo, detail="QR Code de mesa invalido ou inativo.")
        if (request.mesaId is not None and request.mesaId != mesa.id) or (
            request.numeroMesa is not None and request.numeroMesa != mesa.numero
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A mesa informada nao corresponde ao QR Code.")
        return mesa
    if request.mesaId is not None:
        mesa = db.get(Mesa, request.mesaId)
        if mesa is None:
            raise HTTPException(status_code=404, detail=f"Mesa nao encontrada: {request.mesaId}")
        return mesa
    mesa = db.scalar(select(Mesa).where(Mesa.numero == request.numeroMesa, Mesa.ativo.is_(True)))
    if mesa is None:
        raise HTTPException(status_code=404, detail=f"Mesa nao encontrada: {request.numeroMesa}")
    return mesa


def _resolver_cliente(db: Session, cliente_id: int | None) -> Cliente | None:
    if cliente_id is None:
        return None
    cliente = db.get(Cliente, cliente_id)
    if cliente is None or not cliente.ativo:
        raise HTTPException(status_code=404, detail=f"Cliente nao encontrado ou inativo: {cliente_id}")
    return cliente


def _resolver_produtos(db: Session, request: PedidoCreateRequest | PedidoEditRequest) -> dict[int, Produto]:
    produtos: dict[int, Produto] = {}
    for item in request.itens:
        if item.produtoId in produtos:
            continue
        produto = db.get(Produto, item.produtoId)
        if produto is None:
            raise HTTPException(status_code=404, detail=f"Produto nao encontrado: {item.produtoId}")
        if not produto.ativo:
            raise HTTPException(status_code=400, detail=f"Produto indisponivel: {produto.nome}")
        produtos[item.produtoId] = produto
    return produtos


def _parse_uuid(valor: str | None) -> UUID | None:
    if not valor:
        return None
    try:
        return UUID(valor)
    except ValueError:
        return None


def _texto_ou_none(valor: str | None) -> str | None:
    if valor is None or not valor.strip():
        return None
    return valor.strip()


def _criar_item(pedido: Pedido, produto: Produto, quantidade: int) -> PedidoItem:
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
        clienteId=pedido.id_cliente,
        clienteNome=pedido.cliente.nome if pedido.cliente else None,
        origem="CAIXA" if pedido.id_mesa is None else "MESA",
        status=_to_status(pedido.id_status),
        dataHora=pedido.data_hora,
        atualizadoEm=pedido.atualizado_em,
        valorTotal=float(pedido.valor_total),
        observacoes=pedido.observacoes,
        itens=itens,
    )


def _publicar_evento(tipo: str, pedido: PedidoResponse) -> None:
    payload = {"type": tipo, "pedido": pedido.model_dump(mode="json", exclude={"tokenAcesso"})}
    anyio.from_thread.run(manager.broadcast, payload)
