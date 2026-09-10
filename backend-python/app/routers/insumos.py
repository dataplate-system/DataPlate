from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Insumo
from app.schemas import InsumoRequest, InsumoResponse


router = APIRouter(prefix="/api/insumos", tags=["insumos"])


@router.get("", response_model=list[InsumoResponse])
def listar_insumos(db: Session = Depends(get_db)) -> list[InsumoResponse]:
    insumos = db.scalars(select(Insumo).where(Insumo.ativo.is_(True)).limit(500)).all()
    return [_to_response(insumo) for insumo in insumos]


@router.post("", response_model=InsumoResponse, status_code=status.HTTP_201_CREATED)
def criar_insumo(request: InsumoRequest, db: Session = Depends(get_db)) -> InsumoResponse:
    insumo = Insumo(
        nome=request.nome,
        unidade=request.unidade,
        quantidade_atual=request.quantidadeAtual,
        quantidade_minima=request.quantidadeMinima,
        custo_unitario=request.custoUnitario,
        ativo=True,
    )
    db.add(insumo)
    db.commit()
    db.refresh(insumo)
    return _to_response(insumo)


@router.put("/{insumo_id}", response_model=InsumoResponse)
def atualizar_insumo(insumo_id: int, request: InsumoRequest, db: Session = Depends(get_db)) -> InsumoResponse:
    insumo = db.get(Insumo, insumo_id)
    if insumo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Insumo nao encontrado: {insumo_id}")

    insumo.nome = request.nome
    insumo.unidade = request.unidade
    insumo.quantidade_atual = request.quantidadeAtual
    insumo.quantidade_minima = request.quantidadeMinima
    insumo.custo_unitario = request.custoUnitario
    db.add(insumo)
    db.commit()
    db.refresh(insumo)
    return _to_response(insumo)


@router.delete("/{insumo_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_insumo(insumo_id: int, db: Session = Depends(get_db)) -> Response:
    insumo = db.get(Insumo, insumo_id)
    if insumo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Insumo nao encontrado: {insumo_id}")

    insumo.ativo = False
    db.add(insumo)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_response(insumo: Insumo) -> InsumoResponse:
    return InsumoResponse(
        id=insumo.id,
        nome=insumo.nome,
        unidade=insumo.unidade,
        quantidadeAtual=float(insumo.quantidade_atual),
        quantidadeMinima=float(insumo.quantidade_minima),
        custoUnitario=float(insumo.custo_unitario),
        ativo=insumo.ativo,
    )
