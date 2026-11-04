"""Impede a API de subir fora do ambiente local com valores padrao conhecidos."""
import os
from collections.abc import Mapping

from app.core.config import SEGREDO_JWT_DESENVOLVIMENTO, Settings
from app.seed import DEFAULT_ADMIN_PASSWORD


def problemas_de_configuracao(settings: Settings, ambiente: Mapping[str, str] = os.environ) -> list[str]:
    if settings.app_env.strip().lower() == "local":
        return []

    problemas = []
    if settings.jwt_secret == SEGREDO_JWT_DESENVOLVIMENTO or len(settings.jwt_secret) < 32:
        problemas.append("defina JWT_SECRET com um valor proprio de pelo menos 32 caracteres")

    admin_ligado = ambiente.get("DEFAULT_ADMIN_ENABLED", "true").strip().lower() not in {"0", "false", "no"}
    if admin_ligado and ambiente.get("DEFAULT_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD) == DEFAULT_ADMIN_PASSWORD:
        problemas.append("defina DEFAULT_ADMIN_PASSWORD ou use DEFAULT_ADMIN_ENABLED=false")

    if ambiente.get("DEFAULT_TEST_USERS_ENABLED", "false").strip().lower() in {"1", "true", "yes"}:
        problemas.append("desligue DEFAULT_TEST_USERS_ENABLED")

    if settings.password_reset_debug_code:
        problemas.append("desligue PASSWORD_RESET_DEBUG_CODE")
    return problemas


def validar_configuracao(settings: Settings) -> None:
    problemas = problemas_de_configuracao(settings)
    if problemas:
        raise RuntimeError(
            "Configuracao insegura para producao: " + "; ".join(problemas)
            + ". Para desenvolvimento, use APP_ENV=local."
        )
