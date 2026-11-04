import asyncio
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.producao import validar_configuracao
from app.db import SessionLocal, get_db
from app.errors import (
    database_exception_handler,
    http_exception_handler,
    integrity_exception_handler,
    validation_exception_handler,
)
from app.models import Pedido, Role
from app.realtime import manager
from app.routers import (
    auth,
    categorias,
    cep,
    clientes,
    fornecedores,
    funcionarios,
    insumos,
    leads,
    mesas,
    pedidos,
    produto_insumos,
    produtos,
    relatorios,
    restaurante,
    usuarios,
)
from app.security import exigir_admin, usuario_por_access_token
from app.seed import ensure_default_users


settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    validar_configuracao(settings)
    # Garante o administrador e, quando habilitados, os acessos de teste locais.
    ensure_default_users()
    yield


app = FastAPI(title="DataPlate API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Compartilha a configuracao de origens entre o frontend web e o app Capacitor.
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Authorization"],
)

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(IntegrityError, integrity_exception_handler)
app.add_exception_handler(SQLAlchemyError, database_exception_handler)
app.include_router(auth.router)
app.include_router(categorias.router)
app.include_router(cep.router)
app.include_router(clientes.router)
app.include_router(fornecedores.router)
app.include_router(funcionarios.router)
app.include_router(insumos.router)
app.include_router(leads.router)
app.include_router(mesas.router)
app.include_router(pedidos.router)
app.include_router(produto_insumos.router)
app.include_router(produtos.router)
app.include_router(relatorios.router)
app.include_router(restaurante.router)
app.include_router(usuarios.router)


@app.get("/actuator/health")
def health() -> dict[str, str]:
    return {"status": "UP"}


@app.get("/actuator/health/db", dependencies=[Depends(exigir_admin)])
def health_db(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "UP"}


PERFIS_TEMPO_REAL = {Role.GERENTE.value, Role.FUNCIONARIO.value, Role.CAIXA.value, Role.COZINHA.value}
WS_POLICY_VIOLATION = 1008
# Tempo para a equipe enviar o token apos conectar. O token nunca vai na URL,
# pois URLs ficam registradas nos logs de acesso.
WS_TEMPO_AUTENTICACAO_SEGUNDOS = 5
BIGINT_MAX = 2**63 - 1
_NAO_AUTORIZADO = object()


def _filtro_equipe(token: object) -> None | object:
    """Retorna None (equipe: todos os eventos) ou _NAO_AUTORIZADO."""
    if not isinstance(token, str) or not token:
        return _NAO_AUTORIZADO
    db = SessionLocal()
    try:
        usuario = usuario_por_access_token(db, token)
        if usuario is None or usuario.role not in PERFIS_TEMPO_REAL:
            return _NAO_AUTORIZADO
        return None
    finally:
        db.close()


def _filtro_pedido(pedido: str, pedido_token: str | None) -> int | object:
    """Retorna o id do pedido (cliente: so os proprios eventos) ou _NAO_AUTORIZADO."""
    try:
        pedido_id = int(pedido)
        token_acesso = UUID(pedido_token or "")
    except ValueError:
        return _NAO_AUTORIZADO
    # Fora da faixa de BIGINT o Postgres levantaria erro.
    if not 0 < pedido_id <= BIGINT_MAX:
        return _NAO_AUTORIZADO
    db = SessionLocal()
    try:
        registro = db.get(Pedido, pedido_id)
        if registro is None or registro.token_acesso != token_acesso:
            return _NAO_AUTORIZADO
        return pedido_id
    finally:
        db.close()


async def _autenticar_equipe(websocket: WebSocket) -> None | object:
    try:
        mensagem = await asyncio.wait_for(websocket.receive_json(), timeout=WS_TEMPO_AUTENTICACAO_SEGUNDOS)
    except (asyncio.TimeoutError, WebSocketDisconnect, KeyError, ValueError):
        return _NAO_AUTORIZADO
    token = mensagem.get("token") if isinstance(mensagem, dict) else None
    return await run_in_threadpool(_filtro_equipe, token)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    params = websocket.query_params
    await websocket.accept()
    pedido = params.get("pedido")
    if pedido:
        filtro = await run_in_threadpool(_filtro_pedido, pedido, params.get("pedidoToken"))
    else:
        filtro = await _autenticar_equipe(websocket)
    if filtro is _NAO_AUTORIZADO:
        try:
            await websocket.close(code=WS_POLICY_VIOLATION)
        except (RuntimeError, WebSocketDisconnect):
            pass
        return

    manager.registrar(websocket, filtro)
    try:
        if not pedido:
            await websocket.send_json({"type": "AUTENTICADO"})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
