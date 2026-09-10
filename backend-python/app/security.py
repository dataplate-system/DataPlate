import base64
import hashlib
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings
from app.models import User


def _signing_key(secret: str) -> bytes:
    try:
        key = base64.b64decode(secret, validate=True)
    except ValueError:
        key = secret.encode("utf-8")

    if len(key) < 32:
        return hashlib.sha256(secret.encode("utf-8")).digest()

    return key


def verify_password(plain_password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def hash_password(plain_password: str) -> str:
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(user: User) -> str:
    settings = get_settings()
    return _create_token(user.cpf, settings.jwt_expiration_ms, settings.jwt_secret)


def create_refresh_token(user: User) -> str:
    settings = get_settings()
    return _create_token(user.cpf, settings.jwt_refresh_expiration_ms, settings.effective_refresh_secret)


def decode_access_token(token: str) -> str:
    settings = get_settings()
    return _decode_subject(token, settings.jwt_secret)


def decode_refresh_token(token: str) -> str:
    settings = get_settings()
    return _decode_subject(token, settings.effective_refresh_secret)


def _create_token(subject: str, ttl_ms: int, secret: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": now + timedelta(milliseconds=ttl_ms),
    }
    return jwt.encode(payload, _signing_key(secret), algorithm="HS256")


def _decode_subject(token: str, secret: str) -> str:
    payload = jwt.decode(token, _signing_key(secret), algorithms=["HS256"])
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise jwt.InvalidTokenError("Token sem subject")
    return subject
