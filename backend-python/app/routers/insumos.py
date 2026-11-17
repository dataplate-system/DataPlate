from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db import get_db
from app.estoque import registrar_ajuste_manual
from app.models import EstoqueMovimento, Fornecedor, Insumo, Role, User
from app.schemas import EstoqueMovimentoResponse, InsumoRequest, InsumoResponse
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


@router.get(
    "/movimentos",
    response_model=list[EstoqueMovimentoResponse],
    dependencies=[Depends(exigir_perfis(Role.GERENTE, Role.COZINHA))],
)
def listar_movimentos(
    limite: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[EstoqueMovimentoResponse]:
    movimentos = db.scalars(
        select(EstoqueMovimento)
        .options(joinedload(EstoqueMovimento.insumo), joinedload(EstoqueMovimento.usuario))
        .order_by(EstoqueMovimento.criado_em.desc(), EstoqueMovimento.id.desc())
        .limit(limite)
    ).all()
    return [
        EstoqueMovimentoResponse(
            id=movimento.id,
            insumoId=movimento.insumo_id,
            insumoNome=movimento.insumo.nome,
            unidade=movimento.insumo.unidade,
            tipo=movimento.tipo,
            quantidade=float(movimento.quantidade),
            saldoApos=float(movimento.saldo_apos),
            pedidoId=movimento.id_pedido,
            usuarioNome=movimento.usuario.nome if movimento.usuario else None,
            motivo=movimento.motivo,
            criadoEm=movimento.criado_em,
        )
        for movimento in movimentos
    ]


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
)
def atualizar_insumo(
    insumo_id: int,
    request: InsumoRequest,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.GERENTE)),
) -> InsumoResponse:
    insumo = db.get(Insumo, insumo_id)
    if insumo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Insumo nao encontrado: {insumo_id}")

    insumo.nome = request.nome
    insumo.unidade = request.unidade
    registrar_ajuste_manual(db, insumo, Decimal(str(request.quantidadeAtual)), usuario.id)
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
