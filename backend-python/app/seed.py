"""Cria os acessos padrao do DataPlate ao iniciar a API.

Como cada pessoa do grupo tem o proprio banco local, o usuario nao vem junto
com o codigo. Este modulo garante que todo ambiente tenha um ADMIN para entrar
no painel e criar os demais usuarios.

Credenciais padrao (apenas para desenvolvimento):
    CPF:   000.000.001-91   (CPF de teste valido)
    Senha: admin123

Para mudar, defina variaveis de ambiente no docker-compose ou no .env:
    DEFAULT_ADMIN_CPF, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_NOME
O Docker local tambem habilita DEFAULT_TEST_USERS_ENABLED=true para criar:
    000.000.000-01: Gerente
    000.000.000-02: Atendente
    000.000.000-03: Cozinha
    000.000.000-04: Caixa
Todos usam admin123. Esses CPFs simplificados servem apenas para testes de login.
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
DEFAULT_TEST_USERS = (
    ("Gerente", "00000000001", Role.ADMIN),
    ("Atendente", "00000000002", Role.FUNCIONARIO),
    ("Cozinha", "00000000003", Role.COZINHA),
    ("Caixa", "00000000004", Role.CAIXA),
)


def _only_digits(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


def ensure_default_users() -> None:
    if os.getenv("DEFAULT_ADMIN_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return

    nome = os.getenv("DEFAULT_ADMIN_NOME", DEFAULT_ADMIN_NOME).strip() or DEFAULT_ADMIN_NOME
    cpf = _only_digits(os.getenv("DEFAULT_ADMIN_CPF", DEFAULT_ADMIN_CPF))
    senha = os.getenv("DEFAULT_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)

    if len(cpf) != 11:
        logger.warning("DEFAULT_ADMIN_CPF invalido (precisa ter 11 digitos); administrador padrao nao criado.")
        return

    users = [(nome, cpf, Role.ADMIN, senha)]
    if os.getenv("DEFAULT_TEST_USERS_ENABLED", "false").strip().lower() in {"1", "true", "yes"}:
        users.extend((nome, cpf, role, DEFAULT_ADMIN_PASSWORD) for nome, cpf, role in DEFAULT_TEST_USERS)

    generator = get_db()
    db = next(generator)
    try:
        # Bancos criados antes da coluna "ativo" (ex.: o de um parceiro) sao atualizados aqui.
        db.execute(text("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE"))
        db.commit()

        for user_nome, user_cpf, user_role, user_senha in users:
            if db.scalar(select(User).where(User.cpf == user_cpf)) is not None:
                continue

            db.add(
                User(
                    nome=user_nome,
                    cpf=user_cpf,
                    senha_hash=hash_password(user_senha),
                    role=user_role.value,
                    ativo=True,
                )
            )
            db.commit()
            logger.info("Acesso padrao criado (perfil %s, CPF %s).", user_role.value, user_cpf)
    except Exception:
        db.rollback()
        logger.exception("Nao foi possivel criar os acessos padrao.")
        raise
    finally:
        generator.close()


if __name__ == "__main__":
    ensure_default_users()
