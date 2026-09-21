from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import AuthLoginRequest, AuthPasswordResetRequest, AuthRefreshRequest, AuthRegisterRequest, AuthResponse
from app.services import login, refresh, register, reset_password


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


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def auth_reset_password(request: AuthPasswordResetRequest, db: Session = Depends(get_db)) -> Response:
    reset_password(db, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
