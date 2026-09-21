from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Produto
from app.schemas import ProdutoRequest, ProdutoResponse


PRECO_MAXIMO = Decimal("999999.99")

router = APIRouter(prefix="/api/produtos", tags=["produtos"])


@router.get("", response_model=list[ProdutoResponse])
def listar_produtos(db: Session = Depends(get_db)) -> list[ProdutoResponse]:
    produtos = db.scalars(select(Produto).where(Produto.ativo.is_(True)).limit(500)).all()
    return [_to_response(produto) for produto in produtos]


@router.get("/{produto_id}", response_model=ProdutoResponse)
def obter_produto(produto_id: int, db: Session = Depends(get_db)) -> ProdutoResponse:
    if produto_id <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID invalido")

    produto = db.get(Produto, produto_id)
    if produto is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto nao encontrado")

    return _to_response(produto)


@router.post("", response_model=ProdutoResponse, status_code=status.HTTP_201_CREATED)
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


@router.put("/{produto_id}", response_model=ProdutoResponse)
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


@router.delete("/{produto_id}", status_code=status.HTTP_204_NO_CONTENT)
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


def _to_response(produto: Produto) -> ProdutoResponse:
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
    )
