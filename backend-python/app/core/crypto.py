import base64
import hashlib
import logging
import os
from functools import lru_cache

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_PREFIXO_MASCARA = "••••••••"


def _chave() -> bytes:
    chave = os.environ.get("INTEGRATIONS_KEY", "").strip()
    if chave:
        return chave.encode()
    if os.environ.get("APP_ENV") == "local":
        logger.warning("INTEGRATIONS_KEY ausente: usando chave de DESENVOLVIMENTO (APP_ENV=local)")
        return base64.urlsafe_b64encode(hashlib.sha256(b"dataplate-dev-integrations-key").digest())
    raise RuntimeError("A variável INTEGRATIONS_KEY é obrigatória para iniciar a API")


@lru_cache
def _fernet() -> Fernet:
    try:
        return Fernet(_chave())
    except ValueError as exc:
        raise RuntimeError("INTEGRATIONS_KEY inválida: use uma chave Fernet (base64 urlsafe de 32 bytes)") from exc


def validar_chave() -> None:
    _fernet()


def encrypt(valor: str) -> str:
    return _fernet().encrypt(valor.encode("utf-8")).decode("utf-8")


def decrypt(valor: str) -> str:
    return _fernet().decrypt(valor.encode("utf-8")).decode("utf-8")


def mask(valor: str | None) -> str | None:
    if not valor:
        return None
    return _PREFIXO_MASCARA + valor[-4:]