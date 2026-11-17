from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.limiter import (
    exigir_disponivel,
    login_por_cpf,
    login_por_origem,
    origem_da_requisicao,
    recuperacao_por_cpf,
    recuperacao_por_origem,
)
from app.security import exigir_admin, get_usuario_atual
from app.models import User
from app.schemas import AuthLoginRequest, AuthPasswordResetRequest, AuthPasswordResetStartRequest, AuthPasswordResetStartResponse, AuthPasswordResetVerifyRequest, AuthRefreshRequest, AuthRegisterRequest, AuthResponse
from app.services import login, refresh, register, request_password_reset, reset_password, verify_password_reset_code


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _chave_cpf(http_request: Request, cpf: str) -> str:
    return f"{origem_da_requisicao(http_request)}:{''.join(c for c in cpf if c.isdigit())}"


@router.get("/me")
def auth_me(usuario: User = Depends(get_usuario_atual)) -> dict:
    return {"id": usuario.id, "nome": usuario.nome, "cpf": usuario.cpf, "role": usuario.role}


@router.post("/login", response_model=AuthResponse)
def auth_login(request: AuthLoginRequest, http_request: Request, db: Session = Depends(get_db)) -> AuthResponse:
    origem = origem_da_requisicao(http_request)
    chave = _chave_cpf(http_request, request.cpf)
    mensagem = "Muitas tentativas de login."
    exigir_disponivel(login_por_cpf, chave, mensagem)
    exigir_disponivel(login_por_origem, origem, mensagem)
    try:
        resposta = login(db, request)
    except HTTPException as error:
        if error.status_code == status.HTTP_401_UNAUTHORIZED:
            login_por_cpf.registrar(chave)
            login_por_origem.registrar(origem)
        raise
    login_por_cpf.limpar(chave)
    return resposta


@router.post("/refresh", response_model=AuthResponse)
def auth_refresh(request: AuthRefreshRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return refresh(db, request)


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exigir_admin)],
)
def auth_register(request: AuthRegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return register(db, request)


@router.post("/password-reset/request", response_model=AuthPasswordResetStartResponse, status_code=status.HTTP_202_ACCEPTED)
def auth_request_password_reset(
    request: AuthPasswordResetStartRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> AuthPasswordResetStartResponse:
    origem = origem_da_requisicao(http_request)
    chave = _chave_cpf(http_request, request.cpf)
    mensagem = "Muitas solicitações de recuperação."
    exigir_disponivel(recuperacao_por_cpf, chave, mensagem)
    exigir_disponivel(recuperacao_por_origem, origem, mensagem)
    recuperacao_por_cpf.registrar(chave)
    recuperacao_por_origem.registrar(origem)
    return request_password_reset(db, request, background_tasks)


@router.post("/password-reset/verify", status_code=status.HTTP_204_NO_CONTENT)
def auth_verify_password_reset(request: AuthPasswordResetVerifyRequest, db: Session = Depends(get_db)) -> Response:
    verify_password_reset_code(db, request.resetToken, request.codigo)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def auth_reset_password(request: AuthPasswordResetRequest, db: Session = Depends(get_db)) -> Response:
    reset_password(db, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
