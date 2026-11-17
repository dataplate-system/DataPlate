from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Funcionario, Role, User
from app.schemas import FuncionarioRequest, FuncionarioResponse
from app.security import exigir_perfis


router = APIRouter(prefix="/api/funcionarios", tags=["funcionarios"])


@router.get("", response_model=list[FuncionarioResponse])
def listar_funcionarios(
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.GERENTE, Role.ADMIN)),
) -> list[FuncionarioResponse]:
    funcionarios = db.scalars(select(Funcionario).where(Funcionario.ativo.is_(True)).limit(500)).all()
    # ADMIN ve apenas dados funcionais; dados pessoais e salario sao exclusivos do Gerente.
    completo = usuario.role == Role.GERENTE
    return [_to_response(funcionario, completo) for funcionario in funcionarios]


@router.post(
    "",
    response_model=FuncionarioResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def criar_funcionario(request: FuncionarioRequest, db: Session = Depends(get_db)) -> FuncionarioResponse:
    funcionario = Funcionario(criado_em=datetime.now())
    _apply_request(funcionario, request)
    db.add(funcionario)
    db.commit()
    db.refresh(funcionario)

    if funcionario.codigo is None:
        funcionario.codigo = _format_codigo("FUN", funcionario.id)
        db.add(funcionario)
        db.commit()
        db.refresh(funcionario)

    return _to_response(funcionario)


@router.put(
    "/{funcionario_id}",
    response_model=FuncionarioResponse,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def atualizar_funcionario(
    funcionario_id: int,
    request: FuncionarioRequest,
    db: Session = Depends(get_db),
) -> FuncionarioResponse:
    funcionario = db.get(Funcionario, funcionario_id)
    if funcionario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario nao encontrado")

    _apply_request(funcionario, request)
    db.add(funcionario)
    db.commit()
    db.refresh(funcionario)
    return _to_response(funcionario)


@router.delete(
    "/{funcionario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def excluir_funcionario(funcionario_id: int, db: Session = Depends(get_db)) -> Response:
    funcionario = db.get(Funcionario, funcionario_id)
    if funcionario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Funcionario nao encontrado")

    funcionario.ativo = False
    db.add(funcionario)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _apply_request(funcionario: Funcionario, request: FuncionarioRequest) -> None:
    funcionario.codigo = _normalize_codigo(request.codigo)
    funcionario.nome = request.nome.strip()
    funcionario.cpf = request.cpf.strip()
    funcionario.telefone = _blank_to_none(request.telefone)
    funcionario.cargo = request.cargo.strip()
    funcionario.salario = request.salario
    if funcionario.ativo is None:
        funcionario.ativo = True


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


def _to_response(funcionario: Funcionario, completo: bool = True) -> FuncionarioResponse:
    return FuncionarioResponse(
        id=funcionario.id,
        codigo=funcionario.codigo or _format_codigo("FUN", funcionario.id),
        nome=funcionario.nome,
        cpf=funcionario.cpf if completo else None,
        telefone=funcionario.telefone if completo else None,
        cargo=funcionario.cargo,
        salario=float(funcionario.salario) if completo and funcionario.salario is not None else None,
        ativo=funcionario.ativo,
        criadoEm=funcionario.criado_em,
    )
