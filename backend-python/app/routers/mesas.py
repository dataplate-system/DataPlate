from io import BytesIO
from urllib.parse import urlencode, urlparse, urlunparse
from uuid import UUID

import qrcode
from qrcode.image.svg import SvgPathImage
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Mesa
from app.schemas import MesaRequest, MesaResponse


DEFAULT_RESTAURANTE_ID = 1

router = APIRouter(prefix="/api/mesas", tags=["mesas"])


@router.get("", response_model=list[MesaResponse])
def listar_mesas(db: Session = Depends(get_db)) -> list[MesaResponse]:
    mesas = db.scalars(
        select(Mesa)
        .where(Mesa.ativo.is_(True))
        .order_by(Mesa.numero.asc())
    ).all()
    return [_to_response(mesa) for mesa in mesas]


@router.get("/por-token/{token}")
def buscar_mesa_por_token(token: UUID, db: Session = Depends(get_db)) -> dict[str, int]:
    mesa = db.scalar(
        select(Mesa).where(
            Mesa.qr_code_token == token,
            Mesa.ativo.is_(True),
        )
    )
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR Code de mesa invalido ou inativo.")

    return {"mesaId": mesa.id, "numero": mesa.numero}


@router.get("/{mesa_id}/qrcode.svg")
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


@router.post("", response_model=MesaResponse, status_code=status.HTTP_201_CREATED)
def criar_mesa(request: MesaRequest, db: Session = Depends(get_db)) -> MesaResponse:
    mesa = Mesa(id_restaurante=DEFAULT_RESTAURANTE_ID)
    _apply_request(mesa, request)
    db.add(mesa)
    db.commit()
    db.refresh(mesa)
    return _to_response(mesa)


@router.put("/{mesa_id}", response_model=MesaResponse)
def atualizar_mesa(mesa_id: int, request: MesaRequest, db: Session = Depends(get_db)) -> MesaResponse:
    mesa = db.get(Mesa, mesa_id)
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Mesa nao encontrada: {mesa_id}")

    _apply_request(mesa, request)
    db.add(mesa)
    db.commit()
    db.refresh(mesa)
    return _to_response(mesa)


@router.delete("/{mesa_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_mesa(mesa_id: int, db: Session = Depends(get_db)) -> Response:
    mesa = db.get(Mesa, mesa_id)
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Mesa nao encontrada: {mesa_id}")

    mesa.ativo = False
    db.add(mesa)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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


def _to_response(mesa: Mesa) -> MesaResponse:
    return MesaResponse(
        id=mesa.id,
        numero=mesa.numero,
        capacidade=mesa.capacidade,
        status=mesa.status,
        localizacao=mesa.localizacao,
        reservaNome=mesa.reserva_nome,
        reservaTelefone=mesa.reserva_telefone,
        reservaDataHora=mesa.reserva_data_hora,
        observacoes=mesa.observacoes,
        ativo=mesa.ativo,
    )
