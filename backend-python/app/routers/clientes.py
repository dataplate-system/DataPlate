from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Cliente
from app.schemas import ClienteRequest, ClienteResponse


router = APIRouter(prefix="/api/clientes", tags=["clientes"])


@router.get("", response_model=list[ClienteResponse])
def listar_clientes(db: Session = Depends(get_db)) -> list[ClienteResponse]:
    clientes = db.scalars(select(Cliente).where(Cliente.ativo.is_(True)).limit(500)).all()
    return [_to_response(cliente) for cliente in clientes]


@router.post("", response_model=ClienteResponse, status_code=status.HTTP_201_CREATED)
def criar_cliente(request: ClienteRequest, db: Session = Depends(get_db)) -> ClienteResponse:
    cliente = Cliente(criado_em=datetime.now())
    _apply_request(cliente, request)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)

    if cliente.codigo is None:
        cliente.codigo = _format_codigo("CLI", cliente.id)
        db.add(cliente)
        db.commit()
        db.refresh(cliente)

    return _to_response(cliente)


@router.put("/{cliente_id}", response_model=ClienteResponse)
def atualizar_cliente(cliente_id: int, request: ClienteRequest, db: Session = Depends(get_db)) -> ClienteResponse:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente nao encontrado")

    _apply_request(cliente, request)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return _to_response(cliente)


@router.delete("/{cliente_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)) -> Response:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente nao encontrado")

    cliente.ativo = False
    db.add(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _apply_request(cliente: Cliente, request: ClienteRequest) -> None:
    cliente.codigo = _normalize_codigo(request.codigo)
    cliente.nome = request.nome.strip()
    cliente.cpf = request.cpf.strip()
    cliente.email = _blank_to_none(request.email)
    cliente.telefone = _blank_to_none(request.telefone)
    cliente.endereco = _blank_to_none(request.endereco)
    if cliente.ativo is None:
        cliente.ativo = True


def _normalize_codigo(codigo: str | None) -> str | None:
    if codigo is None or not codigo.strip():
        return None
    return codigo.strip().upper()


def _blank_to_none(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    return value.strip()


def _format_codigo(prefixo: str, item_id: int) -> str:
    return f"{prefixo}-{item_id:03d}"


def _to_response(cliente: Cliente) -> ClienteResponse:
    return ClienteResponse(
        id=cliente.id,
        codigo=cliente.codigo or _format_codigo("CLI", cliente.id),
        nome=cliente.nome,
        cpf=cliente.cpf,
        email=cliente.email,
        telefone=cliente.telefone,
        endereco=cliente.endereco,
        ativo=cliente.ativo,
        criadoEm=cliente.criado_em,
    )
