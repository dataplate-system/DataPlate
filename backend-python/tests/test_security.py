import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from unittest.mock import patch
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db import Base, get_db
from app.limiter import login_por_cpf, login_por_origem, refresh_por_origem
from app.models import IntegrationAudit, IntegrationConfig, RefreshToken, Role, User
from app.routers.auth import router as auth_router
from app.routers.integrations import router as integrations_router
from app.schemas import AuthLoginRequest, AuthRegisterRequest, UserCreateRequest, IntegrationConfigUpdate
from app.security import (
    _create_token,
    _signing_key,
    get_usuario_atual,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)


SEGREDO_ACCESS = "segredo-de-teste-access-com-mais-de-32-bytes"
SEGREDO_REFRESH = "segredo-de-teste-refresh-com-mais-de-32-bytes"


@pytest.fixture
def configuracao(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SEGREDO_ACCESS)
    monkeypatch.setenv("JWT_REFRESH_SECRET", SEGREDO_REFRESH)
    ajustes = Settings(_env_file=None)
    monkeypatch.setattr("app.security.get_settings", lambda: ajustes)
    return ajustes


def test_token_de_acesso_valido_decodifica_id(configuracao):
    token = create_access_token(User(id=1))

    assert decode_access_token(token) == 1


def test_token_expirado_levanta_erro(configuracao):
    token = _create_token("usuario:1", -20_000, configuracao.jwt_secret, "access")

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_tokens_de_tipos_diferentes_sao_rejeitados(configuracao):
    acesso = create_access_token(User(id=1))
    refresh = create_refresh_token(User(id=1))

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(refresh)
    with pytest.raises(jwt.InvalidTokenError):
        decode_refresh_token(acesso)


def test_subject_antigo_sem_prefixo_e_rejeitado(configuracao):
    token = _create_token("52998224725", 60_000, configuracao.jwt_secret, "access")

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token)


def test_token_adulterado_e_rejeitado(configuracao):
    token = create_access_token(User(id=1))
    adulterado = token[:-1] + ("a" if token[-1] != "a" else "b")

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(adulterado)


@pytest.mark.parametrize("campo_ausente", ["iss", "exp"])
def test_token_sem_claim_obrigatoria_e_rejeitado(configuracao, campo_ausente):
    payload = {"iss": "dataplate", "sub": "usuario:1", "type": "access", "iat": 1, "exp": 4_102_444_800}
    payload.pop(campo_ausente)
    token = jwt.encode(payload, configuracao.jwt_secret, algorithm="HS256")

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token)


def test_segredo_curto_levanta_runtime_error():
    with pytest.raises(RuntimeError):
        _signing_key("curto")


def test_chave_de_integracoes_ausente_falha_na_validacao_de_inicio(monkeypatch):
    from app.core import crypto

    monkeypatch.delenv("INTEGRATIONS_KEY", raising=False)
    monkeypatch.setattr("app.core.config.get_settings", lambda: Settings(_env_file=None))
    crypto._fernet.cache_clear()
    with pytest.raises(RuntimeError, match="INTEGRATIONS_KEY"):
        crypto.validar_chave()
    crypto._fernet.cache_clear()


def test_hash_e_verificacao_de_senha():
    senha = "senha-segura-de-teste"
    senha_hash = hash_password(senha)

    assert verify_password(senha, senha_hash)
    assert not verify_password("senha-incorreta", senha_hash)


def test_schemas_barram_senha_acima_de_72_bytes():
    senha_longa = "á" * 37

    with pytest.raises(ValidationError):
        AuthLoginRequest(cpf="52998224725", senha=senha_longa)
    with pytest.raises(ValidationError):
        AuthRegisterRequest(nome="Teste", cpf="52998224725", senha=senha_longa, role=Role.ADMIN)
    with pytest.raises(ValidationError):
        UserCreateRequest(
            nome="Teste",
            cpf="52998224725",
            senha=senha_longa,
            email="teste@example.com",
            role=Role.ADMIN,
        )


def test_schema_de_login_aceita_senha_antiga_curta():
    assert AuthLoginRequest(cpf="52998224725", senha="x").senha == "x"
    assert AuthLoginRequest(cpf="52998224725", senha="").senha == ""


@pytest.fixture
def cliente_api(monkeypatch):
    from app.core import crypto

    monkeypatch.setenv("INTEGRATIONS_KEY", "chave-de-teste-fernet-nao-secreta-para-testes")
    crypto._fernet.cache_clear()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    tabelas = [
        Base.metadata.tables["funcionarios"], User.__table__, RefreshToken.__table__,
        IntegrationConfig.__table__, IntegrationAudit.__table__,
    ]
    Base.metadata.create_all(engine, tables=tabelas)
    fabrica = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = fabrica()
    administrador = User(
        id=1,
        nome="Admin de teste",
        cpf="52998224725",
        senha_hash=hash_password("senha-de-teste-1"),
        role=Role.ADMIN.value,
        email="admin@example.com",
        ativo=True,
    )
    db.add(administrador)
    db.commit()

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(integrations_router)

    def obter_banco():
        yield db

    app.dependency_overrides[get_db] = obter_banco
    app.dependency_overrides[get_usuario_atual] = lambda: User(id=1, role=Role.ADMIN)
    login_por_cpf.limpar()
    login_por_origem.limpar()
    refresh_por_origem.limpar()
    client = TestClient(app)
    yield client, db
    client.close()
    db.close()
    engine.dispose()
    crypto._fernet.cache_clear()


def test_integracoes_bloqueiam_usuario_nao_admin(cliente_api):
    from app.routers.integrations import router

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: None
    app.dependency_overrides[get_usuario_atual] = lambda: User(id=1, role=Role.GERENTE)

    with TestClient(app) as client:
        resposta = client.get("/api/integrations")

    assert resposta.status_code == 403


def test_get_integracoes_mascara_segredos_e_put_vazio_nao_altera(cliente_api):
    from app.core.crypto import decrypt

    client, db = cliente_api
    segredo = "ifood-token-super-secreto-9876"
    gravado = client.put("/api/integrations/ifood", json={"ifoodToken": segredo, "ifoodRestauranteId": "loja-1"})
    assert gravado.status_code == 200

    leitura = client.get("/api/integrations")
    assert leitura.status_code == 200
    assert leitura.json()["ifoodToken"] == "••••••••9876"
    assert segredo not in leitura.text

    vazio = client.put("/api/integrations/ifood", json={"ifoodToken": ""})
    assert vazio.status_code == 200
    registro = db.get(IntegrationConfig, 1)
    assert decrypt(registro.ifood_token) == segredo
    assert db.scalar(select(IntegrationAudit).where(IntegrationAudit.field == "ifood_token")) is not None


def test_chave_pix_invalida_retorna_422(cliente_api):
    client, _ = cliente_api

    resposta = client.put("/api/integrations/pagamentos", json={"chavePix": "11111111111"})

    assert resposta.status_code == 422


def test_rotacao_refresh_e_reuso_revogam_todas_as_sessoes(cliente_api):
    client, db = cliente_api
    login = client.post("/api/auth/login", json={"cpf": "52998224725", "senha": "senha-de-teste-1"})
    token_original = login.json()["refreshToken"]

    renovacao = client.post("/api/auth/refresh", json={"refreshToken": token_original})
    token_novo = renovacao.json()["refreshToken"]
    assert renovacao.status_code == 200
    assert token_novo != token_original

    repeticao = client.post("/api/auth/refresh", json={"refreshToken": token_original})
    assert repeticao.status_code == 401
    registros = db.scalars(select(RefreshToken).where(RefreshToken.user_id == 1)).all()
    assert len(registros) == 2
    assert all(registro.revoked_at is not None for registro in registros)


def test_logout_revoga_refresh_token(cliente_api):
    client, _ = cliente_api
    login = client.post("/api/auth/login", json={"cpf": "52998224725", "senha": "senha-de-teste-1"})
    token = login.json()["refreshToken"]

    logout = client.post("/api/auth/logout", json={"refreshToken": token})
    renovacao = client.post("/api/auth/refresh", json={"refreshToken": token})

    assert logout.status_code == 204
    assert renovacao.status_code == 401


def test_login_de_usuario_inexistente_verifica_hash_falso(cliente_api):
    client, _ = cliente_api
    with patch("app.services.verify_password", return_value=False) as verificar:
        resposta = client.post("/api/auth/login", json={"cpf": "00000000000", "senha": "senha-de-teste-1"})

    assert resposta.status_code == 401
    verificar.assert_called_once()


def test_teste_de_provedor_sem_verificacao_disponivel_retorna_501(cliente_api):
    client, _ = cliente_api

    resposta = client.post("/api/integrations/pagamentos/test", json={})

    assert resposta.status_code == 501
    assert "ainda não está disponível" in resposta.json()["detail"]


@pytest.mark.parametrize(
    "chave",
    ["52998224725", "11.222.333/0001-81", "usuario@example.com", "+5511987654321", "550e8400-e29b-41d4-a716-446655440000"],
)
def test_chave_pix_aceita_formatos_validos(chave):
    assert IntegrationConfigUpdate.model_validate({"chavePix": chave}).pix_key == chave

