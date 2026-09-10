import time

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import IntegrityError, SQLAlchemyError


async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Erro na requisicao"
    return JSONResponse(
        status_code=exc.status_code,
        content={"mensagem": detail, "timestamp": int(time.time() * 1000)},
        headers=exc.headers,
    )


async def validation_exception_handler(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"mensagem": "Dados invalidos", "timestamp": int(time.time() * 1000)},
    )


async def integrity_exception_handler(_: Request, __: IntegrityError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={"mensagem": "Registro ja cadastrado ou dados invalidos.", "timestamp": int(time.time() * 1000)},
    )


async def database_exception_handler(_: Request, __: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"mensagem": "Banco de dados indisponivel.", "timestamp": int(time.time() * 1000)},
    )
