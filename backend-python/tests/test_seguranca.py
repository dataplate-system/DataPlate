import unittest
from unittest.mock import patch
from uuid import uuid4

import jwt
from apoio import TesteComBanco
from fastapi.testclient import TestClient
from sqlalchemy import select
from starlette.websockets import WebSocketDisconnect

from app.core.config import SEGREDO_JWT_DESENVOLVIMENTO, Settings
from app.core.producao import problemas_de_configuracao, validar_configuracao
from app.db import SessionLocal, get_db
from app.limiter import LimitadorTentativas
from app.main import app as aplicacao
from app.models import Role, User
from app.routers.auth import router as auth_router
from app.security import create_access_token, decode_access_token, get_usuario_atual
from app.security import _create_token as criar_token


SENHA = "senha-do-teste-1"


class AutenticacaoTest(TesteComBanco):
    routers = (auth_router,)

    def setUp(self):
        super().setUp()
        self.conta = self.criar_usuario(email="conta.teste@example.com")
        self.db.commit()
        self.client.app.dependency_overrides.pop(get_usuario_atual)

    def entrar(self, senha=SENHA, cpf=None):
        return self.client.post("/api/auth/login", json={"cpf": cpf or self.conta.cpf, "senha": senha})

    def test_bloqueia_login_apos_cinco_falhas_mesmo_com_a_senha_certa(self):
        for _ in range(5):
            self.assertEqual(self.entrar("errada").status_code, 401)
        resposta = self.entrar()
        self.assertEqual(resposta.status_code, 429)
        self.assertGreater(int(resposta.headers["Retry-After"]), 0)

    def test_login_certo_zera_as_falhas_do_cpf(self):
        for _ in range(4):
            self.entrar("errada")
        self.assertEqual(self.entrar().status_code, 200)
        for _ in range(4):
            self.assertEqual(self.entrar("errada").status_code, 401)

    def test_falhas_de_um_cpf_nao_bloqueiam_outro(self):
        for _ in range(5):
            self.entrar("errada")
        outra = self.criar_usuario()
        self.db.commit()
        self.assertEqual(self.entrar(cpf=outra.cpf).status_code, 200)

    def test_token_nao_expoe_cpf(self):
        corpo = self.entrar().json()
        for token in (corpo["token"], corpo["refreshToken"]):
            carga = jwt.decode(token, options={"verify_signature": False})
            self.assertEqual(carga["sub"], f"usuario:{self.conta.id}")
            self.assertNotIn(self.conta.cpf, str(carga))

    def test_token_e_refresh_identificam_o_usuario(self):
        corpo = self.entrar().json()
        me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {corpo['token']}"})
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(me.json()["id"], self.conta.id)
        renovado = self.client.post("/api/auth/refresh", json={"refreshToken": corpo["refreshToken"]})
        self.assertEqual(renovado.status_code, 200, renovado.text)
        self.assertEqual(renovado.json()["id"], self.conta.id)

    def test_token_antigo_com_cpf_e_recusado(self):
        ajustes = Settings(_env_file=None)
        with patch("app.security.get_settings", return_value=ajustes):
            antigo = criar_token("00000000002", 60_000, ajustes.jwt_secret, "access")
            with self.assertRaises(jwt.InvalidTokenError):
                decode_access_token(antigo)

    def solicitar_codigo(self, cpf):
        return self.client.post("/api/auth/password-reset/request", json={"cpf": cpf})

    def test_recuperacao_responde_igual_com_cpf_existente_ou_nao(self):
        with patch("app.services._send_password_reset_email") as enviar:
            existente = self.solicitar_codigo(self.conta.cpf)
            inexistente = self.solicitar_codigo("52998224725")
        self.assertEqual(existente.status_code, 202)
        self.assertEqual(inexistente.status_code, 202)
        self.assertEqual(set(existente.json()), set(inexistente.json()))
        self.assertTrue(existente.json()["resetToken"])
        self.assertTrue(inexistente.json()["resetToken"])
        self.assertIsNone(existente.json()["debugCode"])
        self.assertNotIn("recoveryEmail", existente.json())
        enviar.assert_called_once()
        self.assertEqual(enviar.call_args.args[0], self.conta.email)

    def test_falha_no_envio_nao_revela_que_o_cpf_existe(self):
        with patch("app.services.get_settings", return_value=Settings(_env_file=None, smtp_user=None, smtp_password=None)):
            resposta = self.solicitar_codigo(self.conta.cpf)
        self.assertEqual(resposta.status_code, 202)

    def test_token_de_cpf_inexistente_falha_como_codigo_invalido(self):
        token = self.solicitar_codigo("52998224725").json()["resetToken"]
        verificacao = self.client.post("/api/auth/password-reset/verify", json={"resetToken": token, "codigo": "123456"})
        self.assertEqual(verificacao.status_code, 400)

    def test_rota_que_revelava_o_email_foi_removida(self):
        resposta = self.client.post("/api/auth/password-reset/identify", json={"cpf": self.conta.cpf})
        self.assertEqual(resposta.status_code, 404)

    def test_limita_solicitacoes_de_codigo(self):
        with patch("app.services._send_password_reset_email"):
            for _ in range(3):
                self.assertEqual(self.solicitar_codigo(self.conta.cpf).status_code, 202)
            self.assertEqual(self.solicitar_codigo(self.conta.cpf).status_code, 429)


class LimitadorTest(unittest.TestCase):
    def test_libera_quando_a_janela_termina(self):
        limitador = LimitadorTentativas(maximo=2, janela_segundos=60)
        with patch("app.limiter.time.monotonic", return_value=100.0):
            limitador.registrar("a")
            limitador.registrar("a")
            self.assertEqual(limitador.segundos_restantes("a"), 60)
            self.assertEqual(limitador.segundos_restantes("b"), 0)
        with patch("app.limiter.time.monotonic", return_value=160.0):
            self.assertEqual(limitador.segundos_restantes("a"), 0)


class ConfiguracaoDeProducaoTest(unittest.TestCase):
    SEGREDO = "um-segredo-proprio-com-mais-de-32-caracteres"

    def test_ambiente_local_aceita_os_valores_padrao(self):
        self.assertEqual(problemas_de_configuracao(Settings(_env_file=None, app_env="local"), {}), [])

    def test_producao_recusa_segredo_e_senha_padrao(self):
        ajustes = Settings(_env_file=None, app_env="production", jwt_secret=SEGREDO_JWT_DESENVOLVIMENTO)
        problemas = " ".join(problemas_de_configuracao(ajustes, {}))
        self.assertIn("JWT_SECRET", problemas)
        self.assertIn("DEFAULT_ADMIN_PASSWORD", problemas)
        with patch("app.core.producao.problemas_de_configuracao", return_value=["teste"]):
            with self.assertRaisesRegex(RuntimeError, "Configuracao insegura"):
                validar_configuracao(ajustes)

    def test_producao_recusa_segredo_curto_e_acessos_de_teste(self):
        ajustes = Settings(_env_file=None, app_env="production", jwt_secret="curto")
        problemas = " ".join(problemas_de_configuracao(ajustes, {"DEFAULT_ADMIN_ENABLED": "false", "DEFAULT_TEST_USERS_ENABLED": "true"}))
        self.assertIn("JWT_SECRET", problemas)
        self.assertIn("DEFAULT_TEST_USERS_ENABLED", problemas)

    def test_producao_bem_configurada_passa(self):
        ajustes = Settings(_env_file=None, app_env="production", jwt_secret=self.SEGREDO)
        self.assertEqual(problemas_de_configuracao(ajustes, {"DEFAULT_ADMIN_ENABLED": "false"}), [])
        self.assertEqual(problemas_de_configuracao(ajustes, {"DEFAULT_ADMIN_PASSWORD": "senha-forte-da-implantacao"}), [])


class WebSocketTest(unittest.TestCase):
    """Usa a aplicacao completa, sem lifespan, e um usuario criado pela carga inicial."""

    def setUp(self):
        with SessionLocal() as db:
            gerente = db.scalar(select(User).where(User.role == Role.GERENTE, User.ativo.is_(True)).limit(1))
            cozinha_ou_admin = db.scalar(select(User).where(User.role == Role.ADMIN, User.ativo.is_(True)).limit(1))
            self.token = create_access_token(gerente)
            self.token_admin = create_access_token(cozinha_ou_admin)
        self.client = TestClient(aplicacao)

    def tearDown(self):
        self.client.close()

    def assert_recusa(self, websocket):
        with self.assertRaises(WebSocketDisconnect) as contexto:
            websocket.receive_json()
        self.assertEqual(contexto.exception.code, 1008)

    def test_equipe_autentica_na_primeira_mensagem(self):
        with self.client.websocket_connect("/ws") as websocket:
            websocket.send_json({"type": "AUTH", "token": self.token})
            self.assertEqual(websocket.receive_json()["type"], "AUTENTICADO")

    def test_token_invalido_e_recusado(self):
        with self.client.websocket_connect("/ws") as websocket:
            websocket.send_json({"type": "AUTH", "token": "inventado"})
            self.assert_recusa(websocket)

    def test_mensagem_que_nao_e_json_e_recusada(self):
        with self.client.websocket_connect("/ws") as websocket:
            websocket.send_text("nao e json")
            self.assert_recusa(websocket)

    def test_perfil_sem_eventos_operacionais_e_recusado(self):
        with self.client.websocket_connect("/ws") as websocket:
            websocket.send_json({"type": "AUTH", "token": self.token_admin})
            self.assert_recusa(websocket)

    def test_token_na_url_nao_autentica(self):
        with patch("app.main.WS_TEMPO_AUTENTICACAO_SEGUNDOS", 0.1):
            with self.client.websocket_connect(f"/ws?token={self.token}") as websocket:
                self.assert_recusa(websocket)

    def test_cliente_com_token_de_pedido_invalido_e_recusado(self):
        with self.client.websocket_connect(f"/ws?pedido=1&pedidoToken={uuid4()}") as websocket:
            self.assert_recusa(websocket)


if __name__ == "__main__":
    unittest.main()
