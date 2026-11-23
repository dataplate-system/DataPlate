from io import BytesIO
from urllib.parse import urlencode, urlparse, urlunparse
from uuid import UUID

import qrcode
from qrcode.image.svg import SvgPathImage
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Mesa, Pedido, Role, User
from app.security import exigir_perfis
from app.schemas import ChamadoMesaResponse, MesaRequest, MesaReservaRequest, MesaResponse, MesaStatusRequest, MoverPedidosMesaRequest
from app.routers.chamados import _publicar_evento, encerrar_chamados_da_mesa


DEFAULT_RESTAURANTE_ID = 1
STATUS_MESA_PERMITIDOS = {"livre", "reservada", "ocupada", "manutencao", "aguardando_pagamento"}

router = APIRouter(prefix="/api/mesas", tags=["mesas"])


@router.get("", response_model=list[MesaResponse])
def listar_mesas(
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.GERENTE, Role.FUNCIONARIO, Role.CAIXA)),
) -> list[MesaResponse]:
    mesas = db.scalars(
        select(Mesa)
        .where(Mesa.ativo.is_(True))
        .order_by(Mesa.numero.asc())
    ).all()
    # Caixa nao precisa dos dados pessoais de quem reservou.
    ocultar_reserva = usuario.role == Role.CAIXA
    return [_to_response(mesa, ocultar_reserva) for mesa in mesas]


@router.get("/por-token/{token}")
def buscar_mesa_por_token(token: UUID, db: Session = Depends(get_db)) -> dict[str, int | bool | str]:
    mesa = db.scalar(
        select(Mesa).where(
            Mesa.qr_code_token == token,
            Mesa.ativo.is_(True),
        )
    )
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR Code de mesa invalido ou inativo.")

    return {
        "mesaId": mesa.id,
        "numero": mesa.numero,
        "aberta": mesa.status == "ocupada",
        "status": mesa.status,
    }


@router.get("/{mesa_id}/qrcode.svg", dependencies=[Depends(exigir_perfis(Role.GERENTE))])
def gerar_qrcode_mesa(
    mesa_id: int,
    url: str = Query(min_length=1, max_length=2048),
    db: Session = Depends(get_db),
) -> Response:
    mesa = db.get(Mesa, mesa_id)
    if mesa is None or not mesa.ativo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Mesa nao encontrada: {mesa_id}")

    parsed_url = urlparse(url)
    if (
        parsed_url.scheme not in {"http", "https"}
        or not parsed_url.netloc
        or not parsed_url.path.rstrip("/").endswith("/user.html")
        or parsed_url.query
        or parsed_url.fragment
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A URL deve apontar para o cardapio sem parâmetros adicionais.",
        )

    menu_url = urlunparse(
        parsed_url._replace(query=urlencode({"mesaToken": str(mesa.qr_code_token)}))
    )
    qr_code = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
    qr_code.add_data(menu_url)
    qr_code.make(fit=True)
    image = qr_code.make_image(image_factory=SvgPathImage)
    content = BytesIO()
    image.save(content)
    return Response(content=content.getvalue(), media_type="image/svg+xml")


@router.post(
    "",
    response_model=MesaResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def criar_mesa(request: MesaRequest, db: Session = Depends(get_db)) -> MesaResponse:
    mesa = Mesa(id_restaurante=DEFAULT_RESTAURANTE_ID)
    _apply_request(mesa, request)
    db.add(mesa)
    db.commit()
    db.refresh(mesa)
    return _to_response(mesa)


@router.put("/{mesa_id}", response_model=MesaResponse, dependencies=[Depends(exigir_perfis(Role.GERENTE))])
def atualizar_mesa(mesa_id: int, request: MesaRequest, db: Session = Depends(get_db)) -> MesaResponse:
    mesa = db.get(Mesa, mesa_id)
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Mesa nao encontrada: {mesa_id}")

    status_anterior = mesa.status
    _apply_request(mesa, request)
    chamados_encerrados = (
        encerrar_chamados_da_mesa(db, mesa.id)
        if status_anterior == "ocupada" and mesa.status != "ocupada"
        else []
    )
    db.add(mesa)
    db.commit()
    db.refresh(mesa)
    _publicar_chamados_encerrados(chamados_encerrados)
    return _to_response(mesa)


@router.patch("/{mesa_id}/status", response_model=MesaResponse)
def atualizar_status_mesa(
    mesa_id: int,
    request: MesaStatusRequest,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.GERENTE, Role.FUNCIONARIO, Role.CAIXA)),
) -> MesaResponse:
    novo_status = _normalize_status(request.status)
    if novo_status not in STATUS_MESA_PERMITIDOS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Status de mesa invalido: {request.status}")

    mesa = _obter_mesa_ativa(db, mesa_id)
    chamados_encerrados = (
        encerrar_chamados_da_mesa(db, mesa.id)
        if mesa.status == "ocupada" and novo_status != "ocupada"
        else []
    )
    mesa.status = novo_status
    db.add(mesa)
    db.commit()
    db.refresh(mesa)
    _publicar_chamados_encerrados(chamados_encerrados)
    return _to_response(mesa, usuario.role == Role.CAIXA)


@router.patch(
    "/{mesa_id}/reserva",
    response_model=MesaResponse,
    dependencies=[Depends(exigir_perfis(Role.GERENTE, Role.FUNCIONARIO))],
)
def atualizar_reserva_mesa(mesa_id: int, request: MesaReservaRequest, db: Session = Depends(get_db)) -> MesaResponse:
    mesa = _obter_mesa_ativa(db, mesa_id)
    status_anterior = mesa.status
    nome = _blank_to_none(request.reservaNome)
    telefone = _blank_to_none(request.reservaTelefone)

    # Cancelar/definir depende so dos dados da reserva; observacoes da mesa so mudam se enviadas.
    if nome is None and telefone is None and request.reservaDataHora is None:
        mesa.reserva_nome = None
        mesa.reserva_telefone = None
        mesa.reserva_data_hora = None
        if mesa.status == "reservada":
            mesa.status = "livre"
    else:
        mesa.reserva_nome = nome
        mesa.reserva_telefone = telefone
        mesa.reserva_data_hora = request.reservaDataHora
        mesa.status = "reservada"
    if "observacoes" in request.model_fields_set:
        mesa.observacoes = _blank_to_none(request.observacoes)

    chamados_encerrados = (
        encerrar_chamados_da_mesa(db, mesa.id)
        if status_anterior == "ocupada" and mesa.status != "ocupada"
        else []
    )
    db.add(mesa)
    db.commit()
    db.refresh(mesa)
    _publicar_chamados_encerrados(chamados_encerrados)
    return _to_response(mesa)


@router.delete(
    "/{mesa_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def excluir_mesa(mesa_id: int, db: Session = Depends(get_db)) -> Response:
    mesa = db.get(Mesa, mesa_id)
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Mesa nao encontrada: {mesa_id}")

    chamados_encerrados = encerrar_chamados_da_mesa(db, mesa.id)
    mesa.ativo = False
    db.add(mesa)
    db.commit()
    _publicar_chamados_encerrados(chamados_encerrados)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{mesa_id}/transferir", dependencies=[Depends(exigir_perfis(Role.GERENTE, Role.FUNCIONARIO))])
def transferir_mesa(mesa_id: int, request: MoverPedidosMesaRequest, db: Session = Depends(get_db)) -> dict[str, int | str]:
    return _mover_pedidos_entre_mesas(mesa_id, request.mesaDestinoId, db, juntar=False)


@router.put("/{mesa_id}/juntar", dependencies=[Depends(exigir_perfis(Role.GERENTE))])
def juntar_mesas(mesa_id: int, request: MoverPedidosMesaRequest, db: Session = Depends(get_db)) -> dict[str, int | str]:
    return _mover_pedidos_entre_mesas(mesa_id, request.mesaDestinoId, db, juntar=True)


def _mover_pedidos_entre_mesas(mesa_origem_id: int, mesa_destino_id: int, db: Session, *, juntar: bool) -> dict[str, int | str]:
    if mesa_origem_id == mesa_destino_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Escolha uma mesa diferente da origem.")

    mesas = db.scalars(
        select(Mesa)
        .where(Mesa.id.in_([mesa_origem_id, mesa_destino_id]), Mesa.ativo.is_(True))
        .order_by(Mesa.id.asc())
        .with_for_update()
    ).all()
    por_id = {mesa.id: mesa for mesa in mesas}
    origem = por_id.get(mesa_origem_id)
    destino = por_id.get(mesa_destino_id)
    if origem is None or destino is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mesa de origem ou destino não encontrada.")
    if origem.status not in {"ocupada", "aguardando_pagamento"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A mesa de origem não está ocupada.")
    if juntar:
        if destino.status not in {"ocupada", "aguardando_pagamento"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Para juntar mesas, a mesa de destino também precisa estar ocupada.")
    elif destino.status != "livre":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A transferência só pode ser feita para uma mesa livre.")

    pedidos = db.scalars(
        select(Pedido)
        .where(Pedido.id_mesa == origem.id, Pedido.id_status != 5, Pedido.pago_em.is_(None))
        .with_for_update()
    ).all()
    if not pedidos:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não há pedidos em aberto para mover nesta mesa.")

    for pedido in pedidos:
        pedido.id_mesa = destino.id
    origem.status = "livre"
    destino.status = "ocupada"
    chamados_encerrados = encerrar_chamados_da_mesa(db, origem.id)
    db.commit()
    _publicar_chamados_encerrados(chamados_encerrados)
    return {
        "mesaOrigem": origem.numero,
        "mesaDestino": destino.numero,
        "pedidosMovidos": len(pedidos),
    }


def _apply_request(mesa: Mesa, request: MesaRequest) -> None:
    mesa.numero = request.numero
    mesa.capacidade = request.capacidade
    mesa.status = _normalize_status(request.status)
    mesa.localizacao = _blank_to_none(request.localizacao)
    mesa.reserva_nome = _blank_to_none(request.reservaNome)
    mesa.reserva_telefone = _blank_to_none(request.reservaTelefone)
    mesa.reserva_data_hora = request.reservaDataHora
    mesa.observacoes = _blank_to_none(request.observacoes)
    if mesa.ativo is None:
        mesa.ativo = True


def _obter_mesa_ativa(db: Session, mesa_id: int) -> Mesa:
    mesa = db.get(Mesa, mesa_id)
    if mesa is None or not mesa.ativo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Mesa nao encontrada: {mesa_id}")
    return mesa


def _normalize_status(value: str | None) -> str:
    status_value = "livre" if value is None else value.strip().lower()
    match status_value:
        case "disponivel" | "disponível" | "livre":
            return "livre"
        case "reservada" | "reservado":
            return "reservada"
        case "ocupada" | "ocupado":
            return "ocupada"
        case "manutencao" | "manutenção":
            return "manutencao"
        case _:
            return status_value


def _blank_to_none(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    return value.strip()


def _publicar_chamados_encerrados(chamados: list[ChamadoMesaResponse]) -> None:
    for chamado in chamados:
        _publicar_evento("CHAMADO_ATENDIDO", chamado)


def _to_response(mesa: Mesa, ocultar_reserva: bool = False) -> MesaResponse:
    return MesaResponse(
        id=mesa.id,
        numero=mesa.numero,
        capacidade=mesa.capacidade,
        status=mesa.status,
        localizacao=mesa.localizacao,
        reservaNome=None if ocultar_reserva else mesa.reserva_nome,
        reservaTelefone=None if ocultar_reserva else mesa.reserva_telefone,
        reservaDataHora=mesa.reserva_data_hora,
        observacoes=mesa.observacoes,
        ativo=mesa.ativo,
    )
