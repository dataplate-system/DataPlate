from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import get_db
from app.errors import (
    database_exception_handler,
    http_exception_handler,
    integrity_exception_handler,
    validation_exception_handler,
)
from app.realtime import manager
from app.routers import (
    auth,
    categorias,
    cep,
    clientes,
    fornecedores,
    funcionarios,
    insumos,
    mesas,
    pedidos,
    produto_insumos,
    produtos,
    relatorios,
    restaurante,
    usuarios,
)


settings = get_settings()

app = FastAPI(title="DataPlate API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
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


@app.get("/actuator/health/db")
def health_db(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "UP"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
