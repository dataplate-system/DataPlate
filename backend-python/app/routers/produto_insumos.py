from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Insumo, Produto, ProdutoInsumo
from app.schemas import ProdutoInsumoRequest, ProdutoInsumoResponse


router = APIRouter(prefix="/api/produtos/{produto_id}/insumos", tags=["produto-insumos"])


@router.get("", response_model=list[ProdutoInsumoResponse])
def listar_produto_insumos(produto_id: int, db: Session = Depends(get_db)) -> list[ProdutoInsumoResponse]:
    itens = db.scalars(
        select(ProdutoInsumo)
        .options(joinedload(ProdutoInsumo.insumo))
        .where(ProdutoInsumo.produto_id == produto_id)
    ).all()
    return [_to_response(item) for item in itens]


@router.post("", response_model=ProdutoInsumoResponse, status_code=status.HTTP_201_CREATED)
def adicionar_produto_insumo(
    produto_id: int,
    request: ProdutoInsumoRequest,
    db: Session = Depends(get_db),
) -> ProdutoInsumoResponse:
    produto = db.get(Produto, produto_id)
    if produto is None:
        raise HTTPException(status_code=404, detail=f"Produto nao encontrado: {produto_id}")

    insumo = db.get(Insumo, request.insumoId)
    if insumo is None:
        raise HTTPException(status_code=404, detail=f"Insumo nao encontrado: {request.insumoId}")

    item = ProdutoInsumo(produto=produto, insumo=insumo, produto_id=produto.id, insumo_id=insumo.id, quantidade=request.quantidade)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.delete("/{insumo_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_produto_insumo(produto_id: int, insumo_id: int, db: Session = Depends(get_db)) -> Response:
    db.execute(delete(ProdutoInsumo).where(ProdutoInsumo.produto_id == produto_id, ProdutoInsumo.insumo_id == insumo_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_response(item: ProdutoInsumo) -> ProdutoInsumoResponse:
    return ProdutoInsumoResponse(
        id=item.id,
        produtoId=item.produto_id,
        insumoId=item.insumo_id,
        nomeInsumo=item.insumo.nome,
        unidade=item.insumo.unidade,
        quantidade=float(item.quantidade),
    )
