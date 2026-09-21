from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import UserResponse, UserUpdateRequest


router = APIRouter(prefix="/api/usuarios", tags=["usuarios"])


@router.get("", response_model=list[UserResponse])
def listar_usuarios(db: Session = Depends(get_db)) -> list[UserResponse]:
    usuarios = db.scalars(select(User).limit(500)).all()
    return [_to_response(usuario) for usuario in usuarios]


@router.put("/{usuario_id}", response_model=UserResponse)
def atualizar_usuario(usuario_id: int, request: UserUpdateRequest, db: Session = Depends(get_db)) -> UserResponse:
    usuario = db.get(User, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    usuario.nome = request.nome
    usuario.cpf = request.cpf
    usuario.role = request.role
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return _to_response(usuario)


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_usuario(usuario_id: int, db: Session = Depends(get_db)) -> Response:
    usuario = db.get(User, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    db.delete(usuario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_response(usuario: User) -> UserResponse:
    return UserResponse(id=usuario.id, nome=usuario.nome, cpf=usuario.cpf, role=usuario.role)
