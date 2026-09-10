from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Categoria, Restaurante
from app.schemas import CategoriaRequest, CategoriaResponse


router = APIRouter(prefix="/api/categorias", tags=["categorias"])


@router.get("", response_model=list[CategoriaResponse])
def listar_categorias(db: Session = Depends(get_db)) -> list[CategoriaResponse]:
    categorias = db.scalars(
        select(Categoria)
        .where(Categoria.ativo.is_(True))
        .order_by(Categoria.ordem.asc(), Categoria.nome.asc())
    ).all()
    return [_to_response(categoria) for categoria in categorias]


@router.post("", response_model=CategoriaResponse, status_code=status.HTTP_201_CREATED)
def criar_categoria(request: CategoriaRequest, db: Session = Depends(get_db)) -> CategoriaResponse:
    nome = request.nome.strip()
    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome da categoria e obrigatorio.")

    existente = db.scalar(
        select(Categoria).where(
            func.lower(Categoria.nome) == nome.lower(),
            Categoria.ativo.is_(True),
        )
    )
    if existente is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Essa categoria ja existe.")

    id_restaurante = db.scalar(select(Restaurante.id).limit(1))
    if id_restaurante is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum restaurante cadastrado no banco.")

    ordem = request.ordem if request.ordem is not None else _proxima_ordem(db)
    categoria = Categoria(
        id_restaurante=id_restaurante,
        nome=nome,
        descricao=request.descricao,
        ordem=ordem,
        ativo=True,
    )
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return _to_response(categoria)


@router.delete("/{categoria_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_categoria(categoria_id: int, db: Session = Depends(get_db)) -> Response:
    categoria = db.get(Categoria, categoria_id)
    if categoria is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Categoria nao encontrada")

    categoria.ativo = False
    db.add(categoria)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _proxima_ordem(db: Session) -> int:
    maior_ordem = db.scalar(select(func.max(Categoria.ordem)).where(Categoria.ativo.is_(True)))
    return int(maior_ordem or 0) + 1


def _to_response(categoria: Categoria) -> CategoriaResponse:
    return CategoriaResponse(
        id=categoria.id,
        nome=categoria.nome,
        descricao=categoria.descricao,
        ordem=categoria.ordem,
    )
