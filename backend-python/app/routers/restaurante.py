from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Restaurante
from app.schemas import RestauranteRequest, RestauranteResponse


router = APIRouter(prefix="/api/restaurante", tags=["restaurante"])


@router.get("", response_model=RestauranteResponse)
def obter_restaurante(db: Session = Depends(get_db)) -> RestauranteResponse:
    restaurante = db.scalar(select(Restaurante).where(Restaurante.ativo.is_(True)).limit(1))
    if restaurante is None:
        return RestauranteResponse(id=None, nome="DataPlate Restaurante", cnpj="", telefone="", endereco="", email="")
    return _to_response(restaurante)


@router.put("", response_model=RestauranteResponse)
def atualizar_restaurante(request: RestauranteRequest, db: Session = Depends(get_db)) -> RestauranteResponse:
    restaurante = db.scalar(select(Restaurante).where(Restaurante.ativo.is_(True)).limit(1))
    if restaurante is None:
        restaurante = Restaurante(ativo=True)

    restaurante.nome = request.nome
    if request.cnpj is not None:
        restaurante.cnpj = request.cnpj
    if request.telefone is not None:
        restaurante.telefone = request.telefone
    if request.endereco is not None:
        restaurante.endereco = request.endereco
    if request.email is not None:
        restaurante.email = request.email

    db.add(restaurante)
    db.commit()
    db.refresh(restaurante)
    return _to_response(restaurante)


def _to_response(restaurante: Restaurante) -> RestauranteResponse:
    return RestauranteResponse(
        id=restaurante.id,
        nome=restaurante.nome,
        cnpj=restaurante.cnpj,
        telefone=restaurante.telefone,
        endereco=restaurante.endereco,
        email=restaurante.email,
    )
