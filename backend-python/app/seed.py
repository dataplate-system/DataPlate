"""Cria os acessos padrao do DataPlate ao iniciar a API.

Como cada pessoa do grupo tem o proprio banco local, o usuario nao vem junto
com o codigo. Este modulo garante que todo ambiente tenha um ADMIN para entrar
no painel e criar os demais usuarios. Tambem aplica, de forma idempotente, as
colunas exigidas pelos modelos atuais (ver database/migrations/006_perfil_gerente.sql).

Credenciais padrao (apenas para desenvolvimento):
    CPF:   000.000.000-01   (CPF de teste)
    Senha: admin123

Para mudar, defina variaveis de ambiente no docker-compose ou no .env:
    DEFAULT_ADMIN_CPF, DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_NOME
O Docker local tambem habilita DEFAULT_TEST_USERS_ENABLED=true para criar:
    000.000.000-02: Gerente   (perfil GERENTE)
    000.000.000-03: Atendente (perfil FUNCIONARIO)
    000.000.000-04: Cozinha   (perfil COZINHA)
    000.000.000-05: Caixa     (perfil CAIXA)
Todos usam a senha admin123 (DEFAULT_TEST_PASSWORDS). Os CPFs sao sinteticos.
Bancos antigos em que o usuario 000.000.000-02 era ADMIN sao corrigidos pela
migracao 006_perfil_gerente.sql.
Para desligar (producao):
    DEFAULT_ADMIN_ENABLED=false
"""

import logging
import os
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select, text

from app.db import get_db
from app.models import Funcionario, Role, User
from app.security import hash_password

logger = logging.getLogger("uvicorn.error")

DEFAULT_ADMIN_CPF = "00000000001"
# CPF atual -> CPF antigo; bancos com o usuario antigo sao migrados (CPF e senha).
LEGACY_TEST_CPFS = {
    "00000000001": "91000000192", "00000000002": "91000000273",
    "00000000003": "91000000354", "00000000004": "91000000435",
    "00000000005": "91000000516",
}
DEFAULT_ADMIN_PASSWORD = "admin123"
DEFAULT_ADMIN_NOME = "Administrador"
DEFAULT_TEST_USERS = (
    ("Gerente", "00000000002", Role.GERENTE),
    ("Atendente", "00000000003", Role.FUNCIONARIO),
    ("Cozinha", "00000000004", Role.COZINHA),
    ("Caixa", "00000000005", Role.CAIXA),
)
DEFAULT_TEST_PASSWORDS = {
    Role.GERENTE: "admin123",
    Role.FUNCIONARIO: "admin123",
    Role.COZINHA: "admin123",
    Role.CAIXA: "admin123",
}
# Funcionario de demonstracao vinculado a cada usuario de teste: (cpf do usuario, cargo, salario)
DEFAULT_TEST_FUNCIONARIOS = (
    ("00000000002", "Gerente", Decimal("5200.00")),
    ("00000000003", "Atendente", Decimal("2100.00")),
    ("00000000004", "Cozinheiro", Decimal("2600.00")),
    ("00000000005", "Caixa", Decimal("2200.00")),
)

# Colunas usadas pelos modelos; mesmo conteudo da migracao 006 (sem o CHECK de perfil).
# (tabela, coluna, DDL): o DDL so roda se a coluna faltar, para nao exigir ser dono da tabela.
SCHEMA_COLUNAS = (
    ("usuarios", "ativo", "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE"),
    (
        "pedido_status_historico",
        "id_usuario",
        "ALTER TABLE pedido_status_historico ADD COLUMN IF NOT EXISTS id_usuario BIGINT REFERENCES usuarios(id) ON DELETE SET NULL",
    ),
    ("pedido_status_historico", "motivo", "ALTER TABLE pedido_status_historico ADD COLUMN IF NOT EXISTS motivo VARCHAR(255)"),
    ("pedido", "token_acesso", "ALTER TABLE pedido ADD COLUMN IF NOT EXISTS token_acesso UUID NOT NULL DEFAULT gen_random_uuid()"),
)
SCHEMA_INDICES = (
    ("uq_pedido_token_acesso", "CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_token_acesso ON pedido (token_acesso)"),
)


def _only_digits(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


def ensure_schema() -> None:
    generator = get_db()
    db = next(generator)
    try:
        # Bancos antigos (ex.: o de um parceiro) ganham aqui as colunas que faltam.
        tabelas = sorted({tabela for tabela, _, _ in SCHEMA_COLUNAS})
        colunas = set(
            db.execute(
                text(
                    "SELECT table_name, column_name FROM information_schema.columns "
                    "WHERE table_schema = current_schema() AND table_name = ANY(:tabelas)"
                ),
                {"tabelas": tabelas},
            ).tuples()
        )
        indices = set(
            db.scalars(text("SELECT indexname FROM pg_indexes WHERE schemaname = current_schema()")).all()
        )
        comandos = [ddl for tabela, coluna, ddl in SCHEMA_COLUNAS if (tabela, coluna) not in colunas]
        comandos += [ddl for nome, ddl in SCHEMA_INDICES if nome not in indices]
        for comando in comandos:
            db.execute(text(comando))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Nao foi possivel aplicar os ajustes de schema.")
        raise
    finally:
        generator.close()


def ensure_default_users() -> None:
    ensure_schema()
    if os.getenv("DEFAULT_ADMIN_ENABLED", "true").strip().lower() in {"0", "false", "no"}:
        return

    nome = os.getenv("DEFAULT_ADMIN_NOME", DEFAULT_ADMIN_NOME).strip() or DEFAULT_ADMIN_NOME
    cpf = _only_digits(os.getenv("DEFAULT_ADMIN_CPF", DEFAULT_ADMIN_CPF))
    senha = os.getenv("DEFAULT_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)

    if len(cpf) != 11:
        logger.warning("DEFAULT_ADMIN_CPF invalido (precisa ter 11 digitos); administrador padrao nao criado.")
        return

    users = [(nome, cpf, Role.ADMIN, senha)]
    test_users_enabled = os.getenv("DEFAULT_TEST_USERS_ENABLED", "false").strip().lower() in {"1", "true", "yes"}
    if test_users_enabled:
        users.extend((nome, cpf, role, DEFAULT_TEST_PASSWORDS[role]) for nome, cpf, role in DEFAULT_TEST_USERS)

    generator = get_db()
    db = next(generator)
    try:
        for user_nome, user_cpf, user_role, user_senha in users:
            if db.scalar(select(User).where(User.cpf == user_cpf)) is not None:
                continue

            antigo = db.scalar(select(User).where(User.cpf == LEGACY_TEST_CPFS.get(user_cpf, "")))
            if antigo is not None:
                antigo.cpf = user_cpf
                antigo.senha_hash = hash_password(user_senha)
                if antigo.funcionario is not None:
                    antigo.funcionario.cpf = _format_cpf(user_cpf)
                db.commit()
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

        if test_users_enabled:
            # O usuario de teste "Gerente" era criado como ADMIN em versoes anteriores.
            db.execute(
                text("UPDATE usuarios SET role = :novo WHERE cpf = :cpf AND role = :antigo"),
                {"novo": Role.GERENTE.value, "cpf": "00000000002", "antigo": Role.ADMIN.value},
            )
            db.commit()
            _ensure_test_funcionarios(db)
    except Exception:
        db.rollback()
        logger.exception("Nao foi possivel criar os acessos padrao.")
        raise
    finally:
        generator.close()


def _format_cpf(cpf: str) -> str:
    return f"{cpf[:3]}.{cpf[3:6]}.{cpf[6:9]}-{cpf[9:]}"


def _ensure_test_funcionarios(db) -> None:
    # So cria o que falta e so vincula usuario de teste que ainda nao tem funcionario.
    for user_cpf, cargo, salario in DEFAULT_TEST_FUNCIONARIOS:
        usuario = db.scalar(select(User).where(User.cpf == user_cpf))
        if usuario is None or usuario.funcionario_id is not None:
            continue

        cpf_formatado = _format_cpf(user_cpf)
        funcionario = db.scalar(select(Funcionario).where(Funcionario.cpf == cpf_formatado))
        if funcionario is None:
            funcionario = Funcionario(
                nome=usuario.nome,
                cpf=cpf_formatado,
                cargo=cargo,
                salario=salario,
                ativo=True,
                criado_em=datetime.now(),
            )
            db.add(funcionario)
            db.flush()
            funcionario.codigo = f"FUN-{funcionario.id:03d}"

        if db.scalar(select(User).where(User.funcionario_id == funcionario.id)) is None:
            usuario.funcionario_id = funcionario.id
        db.commit()
        logger.info("Funcionario de teste garantido (%s, CPF %s).", cargo, cpf_formatado)


if __name__ == "__main__":
    ensure_default_users()
