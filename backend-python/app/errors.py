import time

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError


async def http_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, HTTPException):
        raise TypeError("http_exception_handler recebeu uma excecao inesperada.")

    detail = exc.detail if isinstance(exc.detail, str) else "Erro na requisicao"
    return JSONResponse(
        status_code=exc.status_code,
        content={"mensagem": detail, "timestamp": int(time.time() * 1000)},
        headers=exc.headers,
    )


async def validation_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise TypeError("validation_exception_handler recebeu uma excecao inesperada.")

    return JSONResponse(
        status_code=400,
        content={"mensagem": "Dados invalidos", "timestamp": int(time.time() * 1000)},
    )


async def integrity_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, IntegrityError):
        raise TypeError("integrity_exception_handler recebeu uma excecao inesperada.")

    return JSONResponse(
        status_code=400,
        content={"mensagem": "Registro ja cadastrado ou dados invalidos.", "timestamp": int(time.time() * 1000)},
    )


async def database_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, SQLAlchemyError):
        raise TypeError("database_exception_handler recebeu uma excecao inesperada.")

    return JSONResponse(
        status_code=503,
        content={"mensagem": "Banco de dados indisponivel.", "timestamp": int(time.time() * 1000)},
    )
