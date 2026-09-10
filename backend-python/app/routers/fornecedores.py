from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Fornecedor
from app.schemas import FornecedorRequest, FornecedorResponse


router = APIRouter(prefix="/api/fornecedores", tags=["fornecedores"])


@router.get("", response_model=list[FornecedorResponse])
def listar_fornecedores(db: Session = Depends(get_db)) -> list[FornecedorResponse]:
    fornecedores = db.scalars(select(Fornecedor).where(Fornecedor.ativo.is_(True)).limit(500)).all()
    return [_to_response(fornecedor) for fornecedor in fornecedores]


@router.post("", response_model=FornecedorResponse, status_code=status.HTTP_201_CREATED)
def criar_fornecedor(request: FornecedorRequest, db: Session = Depends(get_db)) -> FornecedorResponse:
    fornecedor = Fornecedor(criado_em=datetime.now())
    _apply_request(fornecedor, request)
    db.add(fornecedor)
    db.commit()
    db.refresh(fornecedor)

    if fornecedor.codigo is None:
        fornecedor.codigo = _format_codigo("FOR", fornecedor.id)
        db.add(fornecedor)
        db.commit()
        db.refresh(fornecedor)

    return _to_response(fornecedor)


@router.put("/{fornecedor_id}", response_model=FornecedorResponse)
def atualizar_fornecedor(
    fornecedor_id: int,
    request: FornecedorRequest,
    db: Session = Depends(get_db),
) -> FornecedorResponse:
    fornecedor = db.get(Fornecedor, fornecedor_id)
    if fornecedor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fornecedor nao encontrado")

    _apply_request(fornecedor, request)
    db.add(fornecedor)
    db.commit()
    db.refresh(fornecedor)
    return _to_response(fornecedor)


@router.delete("/{fornecedor_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_fornecedor(fornecedor_id: int, db: Session = Depends(get_db)) -> Response:
    fornecedor = db.get(Fornecedor, fornecedor_id)
    if fornecedor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fornecedor nao encontrado")

    fornecedor.ativo = False
    db.add(fornecedor)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _apply_request(fornecedor: Fornecedor, request: FornecedorRequest) -> None:
    fornecedor.codigo = _normalize_codigo(request.codigo)
    fornecedor.razao_social = request.razaoSocial.strip()
    fornecedor.cnpj = request.cnpj.strip()
    fornecedor.especialidade = _blank_to_none(request.especialidade)
    fornecedor.telefone = _blank_to_none(request.telefone)
    fornecedor.email = _blank_to_none(request.email)
    if fornecedor.ativo is None:
        fornecedor.ativo = True


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


def _to_response(fornecedor: Fornecedor) -> FornecedorResponse:
    return FornecedorResponse(
        id=fornecedor.id,
        codigo=fornecedor.codigo or _format_codigo("FOR", fornecedor.id),
        razaoSocial=fornecedor.razao_social,
        cnpj=fornecedor.cnpj,
        especialidade=fornecedor.especialidade,
        telefone=fornecedor.telefone,
        email=fornecedor.email,
        ativo=fornecedor.ativo,
        criadoEm=fornecedor.criado_em,
    )
