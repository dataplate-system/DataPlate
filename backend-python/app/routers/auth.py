from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import AuthLoginRequest, AuthPasswordResetRequest, AuthPasswordResetStartRequest, AuthPasswordResetStartResponse, AuthPasswordResetVerifyRequest, AuthRefreshRequest, AuthRegisterRequest, AuthResponse
from app.services import identify_password_reset, login, refresh, register, request_password_reset, reset_password, verify_password_reset_code


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=AuthResponse)
def auth_login(request: AuthLoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return login(db, request)


@router.post("/refresh", response_model=AuthResponse)
def auth_refresh(request: AuthRefreshRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return refresh(db, request)


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def auth_register(request: AuthRegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    return register(db, request)


@router.post("/password-reset/request", response_model=AuthPasswordResetStartResponse, status_code=status.HTTP_202_ACCEPTED)
def auth_request_password_reset(request: AuthPasswordResetStartRequest, db: Session = Depends(get_db)) -> AuthPasswordResetStartResponse:
    return request_password_reset(db, request)


@router.post("/password-reset/identify", response_model=AuthPasswordResetStartResponse)
def auth_identify_password_reset(request: AuthPasswordResetStartRequest, db: Session = Depends(get_db)) -> AuthPasswordResetStartResponse:
    return identify_password_reset(db, request)


@router.post("/password-reset/verify", status_code=status.HTTP_204_NO_CONTENT)
def auth_verify_password_reset(request: AuthPasswordResetVerifyRequest, db: Session = Depends(get_db)) -> Response:
    verify_password_reset_code(db, request.resetToken, request.codigo)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def auth_reset_password(request: AuthPasswordResetRequest, db: Session = Depends(get_db)) -> Response:
    reset_password(db, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
