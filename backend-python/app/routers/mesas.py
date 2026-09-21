from fastapi import APIRouter, Depends, HTTPException, Response, status
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
        ativo=mesa.ativo,
    )
