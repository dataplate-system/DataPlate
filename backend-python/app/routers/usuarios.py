from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.security import exigir_admin
from app.db import get_db
from app.models import User
from app.schemas import UserCreateRequest, UserResponse, UserUpdateRequest
from app.security import exigir_admin, hash_password


router = APIRouter(
    prefix="/api/usuarios",
    tags=["usuarios"],
    dependencies=[Depends(exigir_admin)],
)


@router.get("", response_model=list[UserResponse])
def listar_usuarios(db: Session = Depends(get_db), usuario=Depends(exigir_admin)) -> list[UserResponse]:
    usuarios = db.scalars(select(User).limit(500)).all()
    return [_to_response(usuario) for usuario in usuarios]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def criar_usuario(request: UserCreateRequest, db: Session = Depends(get_db), usuario=Depends(exigir_admin)) -> UserResponse:
    if db.scalar(select(User).where(User.cpf == request.cpf)) is not None:
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")

    usuario = User(
        nome=request.nome,
        cpf=request.cpf,
        senha_hash=hash_password(request.senha),
        role=request.role.value,
    )
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")
    db.refresh(usuario)
    return _to_response(usuario)


@router.put("/{usuario_id}", response_model=UserResponse)
def atualizar_usuario(
    usuario_id: int,
    request: UserUpdateRequest,
    db: Session = Depends(get_db),usuario=Depends(exigir_admin)
) -> UserResponse:
    usuario = db.get(User, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    outro = db.scalar(select(User).where(User.cpf == request.cpf, User.id != usuario_id))
    if outro is not None:
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")

    usuario.nome = request.nome
    usuario.cpf = request.cpf
    usuario.role = request.role.value if hasattr(request.role, "value") else request.role
    if request.senha is not None:
        usuario.senha_hash = hash_password(request.senha)
    db.add(usuario)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="CPF ja cadastrado")
    db.refresh(usuario)
    return _to_response(usuario)


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    atual: User = Depends(exigir_admin),
) -> Response:
    if usuario_id == atual.id:
        raise HTTPException(status_code=400, detail="Voce nao pode excluir a si mesmo")

    usuario = db.get(User, usuario_id)
    if usuario is None:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    db.delete(usuario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_response(usuario: User) -> UserResponse:
    return UserResponse(id=usuario.id, nome=usuario.nome, cpf=usuario.cpf, role=usuario.role)