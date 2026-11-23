from datetime import datetime
from decimal import Decimal

import anyio
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Produto, Role, User
from app.realtime import manager
from app.schemas import ProdutoDisponibilidadeRequest, ProdutoRequest, ProdutoResponse
from app.security import exigir_perfis, get_usuario_opcional


PRECO_MAXIMO = Decimal("999999.99")

router = APIRouter(prefix="/api/produtos", tags=["produtos"])


@router.get("", response_model=list[ProdutoResponse])
def listar_produtos(
    db: Session = Depends(get_db),
    usuario: User | None = Depends(get_usuario_opcional),
) -> list[ProdutoResponse]:
    produtos = db.scalars(select(Produto).where(Produto.ativo.is_(True)).limit(500)).all()
    nomes = _nomes_responsaveis(db, produtos) if usuario is not None else {}
    return [_to_response(produto, nomes) for produto in produtos]


@router.get("/{produto_id}", response_model=ProdutoResponse)
def obter_produto(
    produto_id: int,
    db: Session = Depends(get_db),
    usuario: User | None = Depends(get_usuario_opcional),
) -> ProdutoResponse:
    if produto_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID invalido")

    produto = db.get(Produto, produto_id)
    if produto is None or (usuario is None and not produto.ativo):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado")

    nomes = _nomes_responsaveis(db, [produto]) if usuario is not None else {}
    return _to_response(produto, nomes)


@router.put("/{produto_id}/disponibilidade", response_model=ProdutoResponse)
def atualizar_disponibilidade(
    produto_id: int,
    request: ProdutoDisponibilidadeRequest,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_perfis(Role.FUNCIONARIO, Role.GERENTE)),
) -> ProdutoResponse:
    """Marca o item como esgotado (com motivo opcional) ou o libera de novo."""
    if produto_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID invalido")

    produto = db.scalar(select(Produto).where(Produto.id == produto_id).with_for_update())
    if produto is None or not produto.ativo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado")

    if request.esgotado:
        motivo = (request.motivo or "").strip()
        # Remarcar um item ja esgotado so troca o motivo: o "desde" continua o original.
        if not produto.esgotado:
            produto.esgotado_em = datetime.now()
        produto.esgotado = True
        produto.esgotado_motivo = motivo or None
        produto.esgotado_por = usuario.id
    else:
        produto.esgotado = False
        produto.esgotado_motivo = None
        produto.esgotado_em = None
        produto.esgotado_por = None

    db.add(produto)
    db.commit()
    db.refresh(produto)

    response = _to_response(produto, _nomes_responsaveis(db, [produto]))
    _publicar_disponibilidade(response)
    return response


@router.post(
    "",
    response_model=ProdutoResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def criar_produto(request: ProdutoRequest, db: Session = Depends(get_db)) -> ProdutoResponse:
    erro = _validar_produto(request)
    if erro is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=erro)

    produto = Produto(
        codigo=_normalizar_codigo(request.codigo),
        id_categoria=request.idCategoria,
        nome=request.nome.strip(),
        descricao=request.descricao,
        preco=request.preco,
        imagem=request.imagem.strip() if request.imagem is not None else None,
        ativo=True if request.ativo is None else request.ativo,
        tempo_preparo=request.tempoPreparo,
        destaque=False if request.destaque is None else request.destaque,
        criado_em=datetime.now(),
    )
    db.add(produto)
    db.commit()
    db.refresh(produto)

    if produto.codigo is None:
        produto.codigo = f"{produto.id:03d}"
        db.add(produto)
        db.commit()
        db.refresh(produto)

    return _to_response(produto)


@router.put(
    "/{produto_id}",
    response_model=ProdutoResponse,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def atualizar_produto(produto_id: int, request: ProdutoRequest, db: Session = Depends(get_db)) -> ProdutoResponse:
    if produto_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID invalido")

    produto = db.get(Produto, produto_id)
    if produto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado")

    if request.nome is not None and request.nome:
        produto.nome = request.nome.strip()
    if request.preco is not None and request.preco > 0:
        produto.preco = request.preco
    if request.descricao is not None:
        produto.descricao = request.descricao.strip()
    if request.codigo is not None:
        produto.codigo = _normalizar_codigo(request.codigo)
    if request.idCategoria is not None and request.idCategoria > 0:
        produto.id_categoria = request.idCategoria
    if request.imagem is not None:
        produto.imagem = request.imagem.strip()
    if request.tempoPreparo is not None:
        produto.tempo_preparo = request.tempoPreparo
    if request.ativo is not None:
        produto.ativo = request.ativo
    if request.destaque is not None:
        produto.destaque = request.destaque

    db.add(produto)
    db.commit()
    db.refresh(produto)

    if produto.codigo is None:
        produto.codigo = f"{produto.id:03d}"
        db.add(produto)
        db.commit()
        db.refresh(produto)

    return _to_response(produto)


@router.delete(
    "/{produto_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def deletar_produto(produto_id: int, db: Session = Depends(get_db)) -> Response:
    if produto_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID invalido")

    produto = db.get(Produto, produto_id)
    if produto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado")

    produto.ativo = False
    db.add(produto)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _validar_produto(produto: ProdutoRequest) -> str | None:
    if produto.nome is None or not produto.nome.strip():
        return "Nome do produto e obrigatorio"
    if len(produto.nome) > 255:
        return "Nome do produto nao pode ter mais de 255 caracteres"
    if produto.idCategoria is None or produto.idCategoria <= 0:
        return "Categoria do produto e obrigatoria"
    if produto.preco is None or produto.preco <= 0:
        return "Preco deve ser maior que zero"
    if produto.preco > PRECO_MAXIMO:
        return "Preco nao pode ser maior que 999999.99"
    return None


def _normalizar_codigo(codigo: str | None) -> str | None:
    if codigo is None or not codigo.strip():
        return None
    return codigo.strip().upper()


def _nomes_responsaveis(db: Session, produtos: list[Produto]) -> dict[int, str]:
    ids = {produto.esgotado_por for produto in produtos if produto.esgotado and produto.esgotado_por is not None}
    if not ids:
        return {}
    return dict(db.execute(select(User.id, User.nome).where(User.id.in_(ids))).tuples().all())


def _publicar_disponibilidade(produto: ProdutoResponse) -> None:
    # Sem chave "pedido": o ConnectionManager entrega somente as conexoes da equipe.
    payload = {"type": "PRODUTO_DISPONIBILIDADE", "produto": produto.model_dump(mode="json")}
    anyio.from_thread.run(manager.broadcast, payload)


def _to_response(produto: Produto, nomes: dict[int, str] | None = None) -> ProdutoResponse:
    esgotado = bool(produto.esgotado)
    return ProdutoResponse(
        id=produto.id,
        codigo=produto.codigo,
        idCategoria=produto.id_categoria,
        nome=produto.nome,
        descricao=produto.descricao,
        preco=float(produto.preco),
        imagem=produto.imagem,
        ativo=produto.ativo,
        tempoPreparo=produto.tempo_preparo,
        destaque=produto.destaque,
        criadoEm=produto.criado_em,
        esgotado=esgotado,
        motivoEsgotado=produto.esgotado_motivo if esgotado else None,
        esgotadoEm=produto.esgotado_em if esgotado else None,
        esgotadoPorNome=(nomes or {}).get(produto.esgotado_por) if esgotado else None,
    )
