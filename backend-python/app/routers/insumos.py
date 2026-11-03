from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Fornecedor, Insumo, Role
from app.schemas import InsumoRequest, InsumoResponse
from app.security import exigir_perfis


router = APIRouter(prefix="/api/insumos", tags=["insumos"])


@router.get(
    "",
    response_model=list[InsumoResponse],
    dependencies=[Depends(exigir_perfis(Role.GERENTE, Role.COZINHA))],
)
def listar_insumos(db: Session = Depends(get_db)) -> list[InsumoResponse]:
    insumos = db.scalars(
        select(Insumo).options(selectinload(Insumo.fornecedores)).where(Insumo.ativo.is_(True)).limit(500)
    ).all()
    return [_to_response(insumo) for insumo in insumos]


@router.post(
    "",
    response_model=InsumoResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def criar_insumo(request: InsumoRequest, db: Session = Depends(get_db)) -> InsumoResponse:
    insumo = Insumo(
        nome=request.nome,
        unidade=request.unidade,
        quantidade_atual=request.quantidadeAtual,
        quantidade_minima=request.quantidadeMinima,
        custo_unitario=request.custoUnitario,
        ativo=True,
        fornecedores=_obter_fornecedores(db, request.fornecedorIds or []),
    )
    db.add(insumo)
    db.commit()
    db.refresh(insumo)
    return _to_response(insumo)


@router.put(
    "/{insumo_id}",
    response_model=InsumoResponse,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def atualizar_insumo(insumo_id: int, request: InsumoRequest, db: Session = Depends(get_db)) -> InsumoResponse:
    insumo = db.get(Insumo, insumo_id)
    if insumo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Insumo nao encontrado: {insumo_id}")

    insumo.nome = request.nome
    insumo.unidade = request.unidade
    insumo.quantidade_atual = request.quantidadeAtual
    insumo.quantidade_minima = request.quantidadeMinima
    insumo.custo_unitario = request.custoUnitario
    if "fornecedorIds" in request.model_fields_set:
        insumo.fornecedores = _obter_fornecedores(
            db,
            request.fornecedorIds or [],
            insumo.fornecedores,
        )
    db.add(insumo)
    db.commit()
    db.refresh(insumo)
    return _to_response(insumo)


@router.delete(
    "/{insumo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def excluir_insumo(insumo_id: int, db: Session = Depends(get_db)) -> Response:
    insumo = db.get(Insumo, insumo_id)
    if insumo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Insumo nao encontrado: {insumo_id}")

    insumo.ativo = False
    db.add(insumo)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _to_response(insumo: Insumo) -> InsumoResponse:
    return InsumoResponse(
        id=insumo.id,
        nome=insumo.nome,
        unidade=insumo.unidade,
        quantidadeAtual=float(insumo.quantidade_atual),
        quantidadeMinima=float(insumo.quantidade_minima),
        custoUnitario=float(insumo.custo_unitario),
        ativo=insumo.ativo,
        fornecedores=[
            {"id": f.id, "razaoSocial": f.razao_social, "ativo": f.ativo}
            for f in insumo.fornecedores
        ],
    )


def _obter_fornecedores(
    db: Session,
    fornecedor_ids: list[int],
    existentes: list[Fornecedor] | None = None,
) -> list[Fornecedor]:
    ids = list(dict.fromkeys(fornecedor_ids))
    if not ids:
        return []
    fornecedores = db.scalars(select(Fornecedor).where(Fornecedor.id.in_(ids))).all()
    existentes_ids = {fornecedor.id for fornecedor in (existentes or [])}
    validos = [
        fornecedor for fornecedor in fornecedores
        if fornecedor.ativo or fornecedor.id in existentes_ids
    ]
    if len(validos) != len(ids):
        raise HTTPException(status_code=400, detail="Um ou mais fornecedores nao foram encontrados ou estao inativos")
    return validos
