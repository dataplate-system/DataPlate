from datetime import datetime, timedelta
from hashlib import sha256
from email.message import EmailMessage
import logging
import smtplib
from secrets import randbelow
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from jwt import InvalidTokenError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import PasswordResetToken, User
from app.schemas import AuthLoginRequest, AuthPasswordResetRequest, AuthPasswordResetStartRequest, AuthPasswordResetStartResponse, AuthRefreshRequest, AuthRegisterRequest, AuthResponse
from app.security import create_access_token, create_refresh_token, decode_refresh_token, hash_password, verify_password

logger = logging.getLogger(__name__)


def login(db: Session, request: AuthLoginRequest) -> AuthResponse:
    user = _get_user_by_cpf(db, request.cpf)
    if user is None or not user.ativo or not verify_password(request.senha, user.senha_hash):
        raise _bad_credentials("CPF ou senha invalidos")
    return _to_auth_response(user)


def refresh(db: Session, request: AuthRefreshRequest) -> AuthResponse:
    try:
        cpf = decode_refresh_token(request.refreshToken)
    except InvalidTokenError:
        raise _bad_credentials("Refresh token invalido") from None

    user = _get_user_by_cpf(db, cpf)
    if user is None or not user.ativo:
        raise _bad_credentials("Refresh token invalido")

    return _to_auth_response(user)


def register(db: Session, request: AuthRegisterRequest) -> AuthResponse:
    nome = request.nome.strip()
    cpf = _only_digits(request.cpf)

    if not nome:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nome obrigatorio")
    if len(cpf) != 11:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CPF invalido")
    if _get_user_by_cpf(db, cpf) is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"CPF ja cadastrado: {cpf}")

    user = User(nome=nome, cpf=cpf, senha_hash=hash_password(request.senha), role=request.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _to_auth_response(user)


def request_password_reset(db: Session, request: AuthPasswordResetStartRequest) -> AuthPasswordResetStartResponse:
    user = _get_user_by_cpf(db, request.cpf)
    # A resposta nao revela se o CPF existe.
    if user is None or not user.ativo:
        return AuthPasswordResetStartResponse()

    code = f"{randbelow(1_000_000):06d}"
    token = PasswordResetToken(
        id=uuid4(),
        user_id=user.id,
        code_hash=_password_reset_code_hash(code),
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(token)
    settings = get_settings()
    _send_password_reset_email(user.email, code)
    db.commit()
    return AuthPasswordResetStartResponse(
        resetToken=token.id,
        debugCode=code if settings.password_reset_debug_code else None,
        recoveryEmail=_mask_email(user.email),
    )


def identify_password_reset(db: Session, request: AuthPasswordResetStartRequest) -> AuthPasswordResetStartResponse:
    user = _get_user_by_cpf(db, request.cpf)
    return AuthPasswordResetStartResponse(recoveryEmail=_mask_email(user.email) if user and user.ativo and user.email else None)


def verify_password_reset_code(db: Session, reset_token: UUID, code: str) -> PasswordResetToken:
    token = db.get(PasswordResetToken, reset_token)
    if token is None or token.used_at is not None or datetime.utcnow() > token.expires_at:
        raise _invalid_password_reset_code()
    if token.attempts >= 3:
        raise _invalid_password_reset_code()
    if _password_reset_code_hash(code) != token.code_hash:
        token.attempts += 1
        db.commit()
        raise _invalid_password_reset_code()
    return token


def reset_password(db: Session, request: AuthPasswordResetRequest) -> None:
    token = verify_password_reset_code(db, request.resetToken, request.codigo)
    user = db.get(User, token.user_id)
    if user is None or not user.ativo:
        raise _invalid_password_reset_code()

    user.senha_hash = hash_password(request.novaSenha)
    token.used_at = datetime.utcnow()
    db.commit()


def _only_digits(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


def _password_reset_code_hash(code: str) -> str:
    secret = get_settings().effective_password_reset_secret
    return sha256(f"{secret}:{code}".encode("utf-8")).hexdigest()


def _invalid_password_reset_code() -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Codigo de recuperacao invalido ou expirado")


def _mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    name, domain = email.split("@", 1)
    return f"{name[:1]}{'*' * max(2, len(name) - 1)}@{domain}"


def _send_password_reset_email(email: str | None, code: str) -> None:
    settings = get_settings()
    if settings.password_reset_debug_code:
        return
    if not email or not settings.smtp_user or not settings.smtp_password:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Envio de e-mail de recuperação não configurado")
    message = EmailMessage()
    message["Subject"] = "DataPlate - código para redefinir sua senha"
    message["From"] = settings.smtp_from_email or settings.smtp_user
    message["To"] = email
    message.set_content(f"Seu código de recuperação DataPlate é: {code}\n\nEle expira em 10 minutos.")
    try:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        logger.exception("Falha ao enviar o e-mail de recuperação de senha.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Não foi possível enviar o e-mail de recuperação. Verifique as configurações SMTP.",
        ) from None


def _get_user_by_cpf(db: Session, cpf: str) -> User | None:
    # O banco guarda o CPF so com digitos; aceita entrada com ou sem mascara.
    return db.scalar(select(User).where(User.cpf == _only_digits(cpf)))


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
