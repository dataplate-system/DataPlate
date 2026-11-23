import base64
from datetime import UTC, datetime, timedelta
from uuid import uuid4

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
        raise RuntimeError("JWT secret precisa ter pelo menos 32 bytes")
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
    return create_refresh_token_with_jti(user, uuid4().hex)


def create_refresh_token_with_jti(user: User, jti: str) -> str:
    settings = get_settings()
    return _create_token(
        _subject(user), settings.jwt_refresh_expiration_ms, settings.effective_refresh_secret, "refresh", jti
    )


def decode_access_token(token: str) -> int:
    settings = get_settings()
    return _id_do_usuario(_decode_subject(token, settings.jwt_secret, "access"))


def decode_refresh_token(token: str) -> int:
    usuario_id, _, _ = decode_refresh_token_data(token)
    return usuario_id


def decode_refresh_token_data(token: str) -> tuple[int, str, datetime]:
    settings = get_settings()
    payload = jwt.decode(
        token,
        _signing_key(settings.effective_refresh_secret),
        algorithms=["HS256"],
        issuer="dataplate",
        leeway=10,
        options={"require": ["exp", "iat", "sub", "type", "jti"]},
    )
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("Tipo de token invalido")
    jti = payload.get("jti")
    if not isinstance(jti, str) or not jti:
        raise jwt.InvalidTokenError("Refresh token sem jti")
    subject = payload.get("sub")
    if not isinstance(subject, str):
        raise jwt.InvalidTokenError("Refresh token sem subject")
    return _id_do_usuario(subject), jti, datetime.fromtimestamp(payload["exp"], UTC)


def _subject(user: User) -> str:
    return f"{PREFIXO_SUBJECT}{user.id}"


def _id_do_usuario(subject: str) -> int:
    # Tokens antigos traziam o CPF: sem o prefixo nao sao aceitos e pedem novo login.
    if not subject.startswith(PREFIXO_SUBJECT) or not subject[len(PREFIXO_SUBJECT):].isdecimal():
        raise jwt.InvalidTokenError("Subject invalido")
    return int(subject[len(PREFIXO_SUBJECT):])


def _create_token(subject: str, ttl_ms: int, secret: str, token_type: str, jti: str | None = None) -> str:
    now = datetime.now(UTC)
    payload = {
        "iss": "dataplate",
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(milliseconds=ttl_ms),
    }
    if jti is not None:
        payload["jti"] = jti
    return jwt.encode(payload, _signing_key(secret), algorithm="HS256")


def _decode_subject(token: str, secret: str, token_type: str) -> str:
    payload = jwt.decode(
        token,
        _signing_key(secret),
        algorithms=["HS256"],
        issuer="dataplate",
        leeway=10,  # tolera pequeno desvio de relógio
        options={"require": ["exp", "iat", "sub", "type"]},
    )
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
        raise _nao_autenticado("Token expirado") from None
    except jwt.InvalidTokenError:
        raise _nao_autenticado("Token invalido") from None

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
    permitidos = set(perfis)

    def _verificar(usuario_atual: User = Depends(get_usuario_atual)) -> User:
        if Role(usuario_atual.role) not in permitidos:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Acesso negado")
        return usuario_atual

    return _verificar


exigir_admin = exigir_perfis(Role.ADMIN)


def usuario_por_access_token(db: Session, token: str) -> User | None:
    try:
        usuario_id = decode_access_token(token)
    except jwt.InvalidTokenError:
        return None
    usuario = db.get(User, usuario_id)
    if usuario is None or not usuario.ativo:
        return None
    return usuario
