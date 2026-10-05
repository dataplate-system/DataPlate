"""Cria o administrador padrao do DataPlate ao iniciar a API.

Como cada pessoa do grupo tem o proprio banco local, o usuario nao vem junto
com o codigo. Este modulo garante que todo ambiente tenha um ADMIN para entrar
no painel e criar os demais usuarios.

Credenciais padrao (apenas para desenvolvimento):
    CPF:   000.000.001-91   (CPF de teste valido)
    Senha: admin123

Para mudar, defina variaveis de ambiente no docker-compose ou no .env:
    DEFAULT_ADMIN_CPF, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_NOME
Para desligar (producao):
    DEFAULT_ADMIN_ENABLED=false
"""

import logging
import os

from sqlalchemy import select, text

from app.db import get_db
from app.models import Role, User
from app.security import hash_password

logger = logging.getLogger("uvicorn.error")

DEFAULT_ADMIN_CPF = "00000000191"
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NOME = "Administrador"


def _only_digits(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


def ensure_default_admin() -> None:
    if os.getenv("DEFAULT_ADMIN_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return

    nome = os.getenv("DEFAULT_ADMIN_NOME", DEFAULT_ADMIN_NOME).strip() or DEFAULT_ADMIN_NOME
    cpf = _only_digits(os.getenv("DEFAULT_ADMIN_CPF", DEFAULT_ADMIN_CPF))
    senha = os.getenv("DEFAULT_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)

    if len(cpf) != 11:
        logger.warning("DEFAULT_ADMIN_CPF invalido (precisa ter 11 digitos); administrador padrao nao criado.")
        return

    generator = get_db()
    db = next(generator)
    try:
        # Bancos criados antes da coluna "ativo" (ex.: o de um parceiro) sao atualizados aqui.
        db.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE"))
        db.commit()

        if db.scalar(select(User).where(User.cpf == cpf)) is not None:
            return

        db.add(
            User(
                nome=nome,
                cpf=cpf,
                senha_hash=hash_password(senha),
                role=Role.ADMIN.value,
                ativo=True,
            )
        )
        db.commit()
        logger.info("Administrador padrao criado (CPF %s).", cpf)
    except Exception:
        db.rollback()
        logger.exception("Nao foi possivel criar o administrador padrao.")
        raise
    finally:
        generator.close()


if __name__ == "__main__":
    ensure_default_admin()