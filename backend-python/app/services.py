from fastapi import HTTPException, status
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.schemas import AuthLoginRequest, AuthPasswordResetRequest, AuthRefreshRequest, AuthRegisterRequest, AuthResponse
from app.security import create_access_token, create_refresh_token, decode_refresh_token, hash_password, verify_password


def login(db: Session, request: AuthLoginRequest) -> AuthResponse:
    user = _get_user_by_cpf(db, request.cpf)
    if user is None or not verify_password(request.senha, user.senha):
        raise _bad_credentials("CPF ou senha invalidos")
    return _to_auth_response(user)


def refresh(db: Session, request: AuthRefreshRequest) -> AuthResponse:
    try:
        cpf = decode_refresh_token(request.refreshToken)
    except InvalidTokenError:
        raise _bad_credentials("Refresh token invalido") from None

    user = _get_user_by_cpf(db, cpf)
    if user is None:
        raise _bad_credentials("Refresh token invalido")

    return _to_auth_response(user)


def register(db: Session, request: AuthRegisterRequest) -> AuthResponse:
    nome = request.nome.strip()
    cpf = request.cpf.strip()

    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome obrigatorio")
    if not cpf:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF obrigatorio")
    if _get_user_by_cpf(db, cpf) is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"CPF ja cadastrado: {cpf}")

    user = User(nome=nome, cpf=cpf, senha=hash_password(request.senha), role=request.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_auth_response(user)


def reset_password(db: Session, request: AuthPasswordResetRequest) -> None:
    user = _get_user_by_cpf(db, request.cpf)
    if user is None:
        raise _bad_credentials("CPF nao encontrado")

    user.senha = hash_password(request.novaSenha)
    db.add(user)
    db.commit()


def _get_user_by_cpf(db: Session, cpf: str) -> User | None:
    return db.scalar(select(User).where(User.cpf == cpf))


def _to_auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        token=create_access_token(user),
        refreshToken=create_refresh_token(user),
        id=user.id,
        nome=user.nome,
        cpf=user.cpf,
        role=user.role,
    )


def _bad_credentials(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=message)
