"""Caixa por turno: abertura com o valor inicial, fechamento com a conferencia da gaveta e historico."""
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Pedido, Role, TurnoCaixa, User
from app.schemas import TurnoCaixaAbrirRequest, TurnoCaixaFecharRequest, TurnoCaixaResponse, TurnoCaixaTotaisResponse
from app.security import exigir_perfis


STATUS_CANCELADO_ID = 5
FORMAS_PAGAMENTO = ("PIX", "DEBITO", "CREDITO", "DINHEIRO")
OUTROS = "OUTROS"
QUANTIDADE = "QUANTIDADE"

# Caixa e Gerente abrem e fecham o turno; so o Gerente ve o historico.
exigir_caixa = exigir_perfis(Role.CAIXA, Role.GERENTE)

router = APIRouter(prefix="/api/caixa", tags=["caixa"])


@router.get("/turnos/atual", response_model=TurnoCaixaResponse | None, dependencies=[Depends(exigir_caixa)])
def turno_atual(db: Session = Depends(get_db)) -> TurnoCaixaResponse | None:
    """Turno aberto com os totais recebidos ate agora, ou null com o caixa fechado."""
    turno = _turno_aberto(db)
    if turno is None:
        return None
    return _to_response(turno, _totais_do_turno(db, turno))


@router.post("/turnos", response_model=TurnoCaixaResponse, status_code=status.HTTP_201_CREATED)
def abrir_turno(
    request: TurnoCaixaAbrirRequest,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_caixa),
) -> TurnoCaixaResponse:
    if _turno_aberto(db) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ja existe um turno de caixa aberto")
    turno = TurnoCaixa(
        aberto_por=usuario.id,
        aberto_em=datetime.now(),
        valor_inicial=request.valorInicial,
        observacao=_texto_ou_none(request.observacao),
    )
    db.add(turno)
    try:
        db.commit()
    except IntegrityError:
        # Duas aberturas ao mesmo tempo: o indice unico do banco deixa passar so a primeira.
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ja existe um turno de caixa aberto")
    db.refresh(turno)
    return _to_response(turno, _totais_vazios())


@router.put("/turnos/{turno_id}/fechar", response_model=TurnoCaixaResponse)
def fechar_turno(
    turno_id: int,
    request: TurnoCaixaFecharRequest,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_caixa),
) -> TurnoCaixaResponse:
    turno = db.scalar(select(TurnoCaixa).where(TurnoCaixa.id == turno_id).with_for_update())
    if turno is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turno de caixa nao encontrado")
    if turno.fechado_em is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este turno de caixa ja foi fechado")

    agora = datetime.now()
    totais = _totais_do_turno(db, turno, agora)
    turno.fechado_por = usuario.id
    turno.fechado_em = agora
    turno.valor_contado = request.valorContado
    turno.total_pix = totais["PIX"]
    turno.total_debito = totais["DEBITO"]
    turno.total_credito = totais["CREDITO"]
    turno.total_dinheiro = totais["DINHEIRO"]
    turno.total_outros = totais[OUTROS]
    turno.quantidade_vendas = totais[QUANTIDADE]
    observacao = _texto_ou_none(request.observacao)
    if observacao is not None:
        turno.observacao = observacao if not turno.observacao else f"{turno.observacao} | {observacao}"[:255]
    db.add(turno)
    db.commit()
    db.refresh(turno)
    return _to_response(turno, totais)


@router.get("/turnos", response_model=list[TurnoCaixaResponse], dependencies=[Depends(exigir_perfis(Role.GERENTE))])
def listar_turnos(limite: int = Query(default=50, ge=1, le=200), db: Session = Depends(get_db)) -> list[TurnoCaixaResponse]:
    """Turnos ja fechados, do mais recente ao mais antigo, com os totais gravados no fechamento."""
    turnos = db.scalars(
        select(TurnoCaixa)
        .options(joinedload(TurnoCaixa.usuario_abertura), joinedload(TurnoCaixa.usuario_fechamento))
        .where(TurnoCaixa.fechado_em.is_not(None))
        .order_by(TurnoCaixa.fechado_em.desc(), TurnoCaixa.id.desc())
        .limit(limite)
    ).all()
    return [_to_response(turno, _totais_gravados(turno)) for turno in turnos]


def _turno_aberto(db: Session) -> TurnoCaixa | None:
    return db.scalar(select(TurnoCaixa).where(TurnoCaixa.fechado_em.is_(None)).order_by(TurnoCaixa.id.desc()).limit(1))


def _totais_vazios() -> dict[str, Decimal | int]:
    totais: dict[str, Decimal | int] = {forma: Decimal("0") for forma in FORMAS_PAGAMENTO}
    totais[OUTROS] = Decimal("0")
    totais[QUANTIDADE] = 0
    return totais


def _totais_do_turno(db: Session, turno: TurnoCaixa, fim: datetime | None = None) -> dict[str, Decimal | int]:
    """Soma os pedidos pagos entre a abertura e `fim` (agora, com o turno aberto) por forma de pagamento."""
    filtros = [Pedido.pago_em >= turno.aberto_em, Pedido.id_status != STATUS_CANCELADO_ID]
    if fim is not None:
        filtros.append(Pedido.pago_em <= fim)
    linhas = db.execute(
        select(Pedido.forma_pagamento, func.coalesce(func.sum(Pedido.valor_total), 0), func.count(Pedido.id))
        .where(*filtros)
        .group_by(Pedido.forma_pagamento)
    ).all()
    totais = _totais_vazios()
    for forma, valor, quantidade in linhas:
        chave = (forma or "").strip().upper()
        totais[chave if chave in FORMAS_PAGAMENTO else OUTROS] += Decimal(valor)
        totais[QUANTIDADE] += quantidade
    return totais


def _totais_gravados(turno: TurnoCaixa) -> dict[str, Decimal | int]:
    return {
        "PIX": turno.total_pix or Decimal("0"),
        "DEBITO": turno.total_debito or Decimal("0"),
        "CREDITO": turno.total_credito or Decimal("0"),
        "DINHEIRO": turno.total_dinheiro or Decimal("0"),
        OUTROS: turno.total_outros or Decimal("0"),
        QUANTIDADE: turno.quantidade_vendas or 0,
    }


def _texto_ou_none(valor: str | None) -> str | None:
    if valor is None or not valor.strip():
        return None
    return valor.strip()


def _to_response(turno: TurnoCaixa, totais: dict[str, Decimal | int]) -> TurnoCaixaResponse:
    total_vendas = sum((Decimal(totais[forma]) for forma in FORMAS_PAGAMENTO), Decimal(totais[OUTROS]))
    esperado = turno.valor_inicial + Decimal(totais["DINHEIRO"])
    diferenca = None if turno.valor_contado is None else turno.valor_contado - esperado
    return TurnoCaixaResponse(
        id=turno.id,
        aberto=turno.fechado_em is None,
        abertoPorId=turno.aberto_por,
        abertoPor=turno.usuario_abertura.nome if turno.usuario_abertura else None,
        abertoEm=turno.aberto_em,
        valorInicial=float(turno.valor_inicial),
        fechadoPorId=turno.fechado_por,
        fechadoPor=turno.usuario_fechamento.nome if turno.usuario_fechamento else None,
        fechadoEm=turno.fechado_em,
        valorContado=None if turno.valor_contado is None else float(turno.valor_contado),
        observacao=turno.observacao,
        totais=TurnoCaixaTotaisResponse(
            pix=float(totais["PIX"]),
            debito=float(totais["DEBITO"]),
            credito=float(totais["CREDITO"]),
            dinheiro=float(totais["DINHEIRO"]),
            outros=float(totais[OUTROS]),
            totalVendas=float(total_vendas),
            quantidadeVendas=int(totais[QUANTIDADE]),
        ),
        valorEsperadoDinheiro=float(esperado),
        diferenca=None if diferenca is None else float(diferenca),
    )
