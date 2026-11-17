from datetime import datetime, timedelta
from math import ceil
from uuid import UUID

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.limiter import chamados_qr_por_mesa_tipo, exigir_disponivel
from app.models import ChamadoMesa, Mesa, Role, User
from app.realtime import manager
from app.security import exigir_perfis
from app.schemas import ChamadoMesaRequest, ChamadoMesaResponse


router = APIRouter(prefix="/api/chamados", tags=["chamados"])
INTERVALO_CHAMADOS_SEGUNDOS = 120


@router.get("", response_model=list[ChamadoMesaResponse])
def listar_chamados_abertos(
    db: Session = Depends(get_db),
    _: User = Depends(exigir_perfis(Role.GERENTE, Role.FUNCIONARIO)),
) -> list[ChamadoMesaResponse]:
    linhas = db.execute(
        select(ChamadoMesa, Mesa.numero)
        .join(Mesa, Mesa.id == ChamadoMesa.id_mesa)
        .where(
            ChamadoMesa.atendido_em.is_(None),
            Mesa.ativo.is_(True),
            Mesa.status == "ocupada",
        )
        .order_by(ChamadoMesa.criado_em.asc())
    ).all()
    return [_para_resposta(chamado, numero) for chamado, numero in linhas]


@router.get("/mesa", response_model=list[ChamadoMesaResponse])
def listar_chamados_da_mesa(
    token: UUID = Query(),
    db: Session = Depends(get_db),
) -> list[ChamadoMesaResponse]:
    mesa = _obter_mesa_por_token(db, token)
    if mesa.status != "ocupada":
        return []
    linhas = db.execute(
        select(ChamadoMesa, Mesa.numero)
        .join(Mesa, Mesa.id == ChamadoMesa.id_mesa)
        .where(ChamadoMesa.id_mesa == mesa.id, ChamadoMesa.atendido_em.is_(None))
        .order_by(ChamadoMesa.criado_em.asc())
    ).all()
    return [_para_resposta(chamado, numero) for chamado, numero in linhas]


@router.post(
    "/mesa",
    response_model=ChamadoMesaResponse,
    status_code=status.HTTP_201_CREATED,
)
def criar_chamado(
    request: ChamadoMesaRequest,
    token: UUID = Query(),
    db: Session = Depends(get_db),
) -> ChamadoMesaResponse:
    mesa = db.scalar(
        select(Mesa)
        .where(Mesa.qr_code_token == token, Mesa.ativo.is_(True))
        .with_for_update()
    )
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR Code de mesa inválido ou inativo.")
    if mesa.status != "ocupada":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A mesa não está aberta.")

    chave = f"{mesa.id}:{request.tipo}"
    chamado_aberto = db.scalar(
        select(ChamadoMesa.id).where(
            ChamadoMesa.id_mesa == mesa.id,
            ChamadoMesa.tipo == request.tipo,
            ChamadoMesa.atendido_em.is_(None),
        )
    )
    if chamado_aberto is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um chamado deste tipo aguardando atendimento.")

    agora = datetime.now()
    ultimo_chamado = db.scalar(
        select(ChamadoMesa.criado_em)
        .where(ChamadoMesa.id_mesa == mesa.id, ChamadoMesa.tipo == request.tipo)
        .order_by(ChamadoMesa.criado_em.desc())
        .limit(1)
    )
    if ultimo_chamado is not None:
        restante = ceil((ultimo_chamado + timedelta(seconds=INTERVALO_CHAMADOS_SEGUNDOS) - agora).total_seconds())
        if restante > 0:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Aguarde antes de abrir outro chamado deste tipo.",
                headers={"Retry-After": str(restante)},
            )

    exigir_disponivel(
        chamados_qr_por_mesa_tipo,
        chave,
        "Este chamado foi enviado recentemente.",
    )
    chamado = ChamadoMesa(id_mesa=mesa.id, tipo=request.tipo)
    db.add(chamado)
    db.commit()
    db.refresh(chamado)
    chamados_qr_por_mesa_tipo.registrar(chave)

    resposta = _para_resposta(chamado, mesa.numero)
    _publicar_evento("CHAMADO_MESA", resposta)
    return resposta


@router.patch("/{chamado_id}/atender", response_model=ChamadoMesaResponse)
def atender_chamado(
    chamado_id: int,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.GERENTE, Role.FUNCIONARIO)),
) -> ChamadoMesaResponse:
    chamado = db.scalar(
        select(ChamadoMesa)
        .where(ChamadoMesa.id == chamado_id)
        .with_for_update()
    )
    if chamado is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chamado não encontrado.")
    if chamado.atendido_em is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este chamado já foi atendido.")

    mesa = db.get(Mesa, chamado.id_mesa)
    chamado.atendido_em = datetime.now()
    chamado.atendido_por = usuario.id
    db.add(chamado)
    db.commit()
    db.refresh(chamado)

    resposta = _para_resposta(chamado, mesa.numero)
    _publicar_evento("CHAMADO_ATENDIDO", resposta)
    return resposta


def encerrar_chamados_da_mesa(db: Session, mesa_id: int) -> list[ChamadoMesaResponse]:
    chamados = db.scalars(
        select(ChamadoMesa)
        .where(ChamadoMesa.id_mesa == mesa_id, ChamadoMesa.atendido_em.is_(None))
        .with_for_update()
    ).all()
    if not chamados:
        return []

    mesa = db.get(Mesa, mesa_id)
    agora = datetime.now()
    respostas = []
    for chamado in chamados:
        chamado.atendido_em = agora
        respostas.append(_para_resposta(chamado, mesa.numero))
    db.add_all(chamados)
    return respostas


def _obter_mesa_por_token(db: Session, token: UUID) -> Mesa:
    mesa = db.scalar(
        select(Mesa).where(Mesa.qr_code_token == token, Mesa.ativo.is_(True))
    )
    if mesa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="QR Code de mesa inválido ou inativo.")
    return mesa


def _para_resposta(chamado: ChamadoMesa, numero_mesa: int) -> ChamadoMesaResponse:
    return ChamadoMesaResponse(
        id=chamado.id,
        mesaId=chamado.id_mesa,
        numeroMesa=numero_mesa,
        tipo=chamado.tipo,
        criadoEm=chamado.criado_em,
    )


def _publicar_evento(tipo: str, chamado: ChamadoMesaResponse) -> None:
    anyio.from_thread.run(
        manager.broadcast,
        {"type": tipo, "chamado": chamado.model_dump(mode="json")},
    )
