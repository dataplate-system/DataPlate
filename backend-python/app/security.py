import base64
import hashlib
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.models import Role, User

bearer_scheme = HTTPBearer(auto_error=False)
# O token identifica o usuario pelo id: CPF nao deve ficar legivel no payload do JWT.
PREFIXO_SUBJECT = "usuario:"


def _signing_key(secret: str) -> bytes:
    try:
        key = base64.b64decode(secret, validate=True)
    except ValueError:
        key = secret.encode("utf-8")

    if len(key) < 32:
        return hashlib.sha256(secret.encode("utf-8")).digest()

    return key


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(user: User) -> str:
    settings = get_settings()
    return _create_token(_subject(user), settings.jwt_expiration_ms, settings.jwt_secret, "access")


def create_refresh_token(user: User) -> str:
    settings = get_settings()
    return _create_token(_subject(user), settings.jwt_refresh_expiration_ms, settings.effective_refresh_secret, "refresh")


def decode_access_token(token: str) -> int:
    settings = get_settings()
    return _id_do_usuario(_decode_subject(token, settings.jwt_secret, "access"))


def decode_refresh_token(token: str) -> int:
    settings = get_settings()
    return _id_do_usuario(_decode_subject(token, settings.effective_refresh_secret, "refresh"))


def _subject(user: User) -> str:
    return f"{PREFIXO_SUBJECT}{user.id}"


def _id_do_usuario(subject: str) -> int:
    # Tokens antigos traziam o CPF: sem o prefixo nao sao aceitos e pedem novo login.
    if not subject.startswith(PREFIXO_SUBJECT) or not subject[len(PREFIXO_SUBJECT):].isdecimal():
        raise jwt.InvalidTokenError("Subject invalido")
    return int(subject[len(PREFIXO_SUBJECT):])


def _create_token(subject: str, ttl_ms: int, secret: str, token_type: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(milliseconds=ttl_ms),
    }
    return jwt.encode(payload, _signing_key(secret), algorithm="HS256")


def _decode_subject(token: str, secret: str, token_type: str) -> str:
    payload = jwt.decode(token, _signing_key(secret), algorithms=["HS256"])
    if payload.get("type") != token_type:
        raise jwt.InvalidTokenError("Tipo de token invalido")
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise jwt.InvalidTokenError("Token sem subject")
    return subject


def _nao_autenticado(motivo: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=motivo,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_usuario_atual(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _nao_autenticado("Token ausente")

    try:
        usuario_id = decode_access_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise _nao_autenticado("Token expirado")
    except jwt.InvalidTokenError:
        raise _nao_autenticado("Token invalido")

    usuario = db.get(User, usuario_id)
    if usuario is None:
        raise _nao_autenticado("Usuario do token nao encontrado")
    if not usuario.ativo:
        raise _nao_autenticado("Usuario inativo")
    return usuario


def get_usuario_opcional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    return get_usuario_atual(credentials, db)


def exigir_perfis(*perfis: Role):
    permitidos = {p.value for p in perfis}

    def _verificar(usuario_atual: User = Depends(get_usuario_atual)) -> User:
        if usuario_atual.role not in permitidos:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
        return usuario_atual

    return _verificar


def exigir_admin(usuario_atual: User = Depends(get_usuario_atual)) -> User:
    if usuario_atual.role != Role.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
    return usuario_atual


def usuario_por_access_token(db: Session, token: str) -> User | None:
    try:
        usuario_id = decode_access_token(token)
    except jwt.InvalidTokenError:
        return None
    usuario = db.get(User, usuario_id)
    if usuario is None or not usuario.ativo:
        return None
    return usuario
