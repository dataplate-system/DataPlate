from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Cliente, Mesa, Pedido, PedidoItem, PedidoStatusNome, Produto, Role
from app.schemas import (
    ClienteGastoMensalResponse,
    ClientePratoFavoritoResponse,
    ClienteRequest,
    ClienteResponse,
    ClienteResumoPedidoItemResponse,
    ClienteResumoPedidoResponse,
    ClienteResumoResponse,
)
from app.security import exigir_perfis


STATUS_CANCELADO_ID = 5
STATUS_NOMES = {
    1: PedidoStatusNome.RECEBIDO,
    2: PedidoStatusNome.EM_PREPARO,
    3: PedidoStatusNome.PRONTO,
    4: PedidoStatusNome.ENTREGUE,
    5: PedidoStatusNome.CANCELADO,
    6: PedidoStatusNome.SERVIDO,
}
# Perfil do cliente (RF12): janela do grafico, da lista de pedidos e do selo "Cliente frequente".
MESES_GASTO = 6
ULTIMOS_PEDIDOS = 10
DIAS_CLIENTE_FREQUENTE = 30
PEDIDOS_CLIENTE_FREQUENTE = 5
MESES_ABREVIADOS = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


@router.get("", response_model=list[ClienteResponse], dependencies=[Depends(exigir_perfis(Role.GERENTE, Role.CAIXA))])
def listar_clientes(db: Session = Depends(get_db)) -> list[ClienteResponse]:
    clientes = db.scalars(select(Cliente).where(Cliente.ativo.is_(True)).limit(500)).all()
    return [_to_response(cliente) for cliente in clientes]


@router.post(
    "",
    response_model=ClienteResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(exigir_perfis(Role.GERENTE, Role.CAIXA))],
)
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


@router.get(
    "/{cliente_id}/resumo",
    response_model=ClienteResumoResponse,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def resumo_cliente(cliente_id: int, db: Session = Depends(get_db)) -> ClienteResumoResponse:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente nao encontrado")

    agora = datetime.now()
    # Pedidos cancelados ficam fora de todas as contas do perfil.
    validos = (Pedido.id_cliente == cliente_id, Pedido.id_status != STATUS_CANCELADO_ID)
    total_pedidos, total_gasto, primeira, ultima = db.execute(
        select(
            func.count(Pedido.id),
            func.coalesce(func.sum(Pedido.valor_total), 0),
            func.min(Pedido.data_hora),
            func.max(Pedido.data_hora),
        ).where(*validos)
    ).one()
    total_gasto = Decimal(total_gasto)
    pedidos_30_dias = db.scalar(
        select(func.count(Pedido.id)).where(*validos, Pedido.data_hora >= agora - timedelta(days=DIAS_CLIENTE_FREQUENTE))
    ) or 0

    return ClienteResumoResponse(
        clienteId=cliente.id,
        nome=cliente.nome,
        codigo=cliente.codigo or _format_codigo("CLI", cliente.id),
        totalPedidos=total_pedidos,
        totalGasto=float(total_gasto),
        ticketMedio=float(round(total_gasto / total_pedidos, 2)) if total_pedidos else 0.0,
        pratoMaisPedido=_prato_mais_pedido(db, validos),
        primeiraCompra=primeira,
        ultimaCompra=ultima,
        pedidosUltimos30Dias=pedidos_30_dias,
        clienteFrequente=pedidos_30_dias >= PEDIDOS_CLIENTE_FREQUENTE,
        gastoPorMes=_gasto_por_mes(db, validos, agora),
        ultimosPedidos=_ultimos_pedidos(db, validos),
    )


@router.put(
    "/{cliente_id}",
    response_model=ClienteResponse,
    dependencies=[Depends(exigir_perfis(Role.GERENTE, Role.CAIXA))],
)
def atualizar_cliente(cliente_id: int, request: ClienteRequest, db: Session = Depends(get_db)) -> ClienteResponse:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente nao encontrado")

    _apply_request(cliente, request)
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return _to_response(cliente)


@router.delete(
    "/{cliente_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(exigir_perfis(Role.GERENTE))],
)
def excluir_cliente(cliente_id: int, db: Session = Depends(get_db)) -> Response:
    cliente = db.get(Cliente, cliente_id)
    if cliente is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente nao encontrado")

    cliente.ativo = False
    db.add(cliente)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _prato_mais_pedido(db: Session, validos: tuple) -> ClientePratoFavoritoResponse | None:
    quantidade = func.sum(PedidoItem.quantidade)
    linha = db.execute(
        select(Produto.id, Produto.nome, quantidade)
        .join(PedidoItem, PedidoItem.id_produto == Produto.id)
        .join(Pedido, Pedido.id == PedidoItem.id_pedido)
        .where(*validos, PedidoItem.cancelado.is_(False))
        .group_by(Produto.id, Produto.nome)
        .order_by(quantidade.desc(), Produto.nome.asc())
        .limit(1)
    ).first()
    if linha is None:
        return None
    return ClientePratoFavoritoResponse(produtoId=linha[0], nome=linha[1], quantidade=float(linha[2]))


def _gasto_por_mes(db: Session, validos: tuple, agora: datetime) -> list[ClienteGastoMensalResponse]:
    inicio = _primeiro_dia_do_mes(agora, MESES_GASTO - 1)
    mes = func.date_trunc("month", Pedido.data_hora)
    linhas = db.execute(
        select(mes, func.sum(Pedido.valor_total), func.count(Pedido.id))
        .where(*validos, Pedido.data_hora >= inicio)
        .group_by(mes)
    ).all()
    por_mes = {inicio_mes.strftime("%Y-%m"): (valor, quantidade) for inicio_mes, valor, quantidade in linhas}
    resultado = []
    # Do mes mais antigo ao atual, incluindo meses sem compras.
    for meses_atras in range(MESES_GASTO - 1, -1, -1):
        inicio_mes = _primeiro_dia_do_mes(agora, meses_atras)
        chave = inicio_mes.strftime("%Y-%m")
        valor, quantidade = por_mes.get(chave, (Decimal("0"), 0))
        resultado.append(
            ClienteGastoMensalResponse(
                mes=chave,
                label=f"{MESES_ABREVIADOS[inicio_mes.month - 1]}/{inicio_mes.year % 100:02d}",
                valor=float(valor),
                pedidos=quantidade,
            )
        )
    return resultado


def _primeiro_dia_do_mes(referencia: datetime, meses_atras: int) -> datetime:
    indice = referencia.year * 12 + (referencia.month - 1) - meses_atras
    return datetime(indice // 12, indice % 12 + 1, 1)


def _ultimos_pedidos(db: Session, validos: tuple) -> list[ClienteResumoPedidoResponse]:
    pedidos = db.scalars(
        select(Pedido)
        .options(joinedload(Pedido.itens).joinedload(PedidoItem.produto))
        .where(*validos)
        .order_by(Pedido.data_hora.desc(), Pedido.id.desc())
        .limit(ULTIMOS_PEDIDOS)
    ).unique().all()
    mesas = dict(db.execute(select(Mesa.id, Mesa.numero)).all())
    return [
        ClienteResumoPedidoResponse(
            id=pedido.id,
            dataHora=pedido.data_hora,
            origem="CAIXA" if pedido.id_mesa is None else "MESA",
            numeroMesa=None if pedido.id_mesa is None else mesas.get(pedido.id_mesa, pedido.id_mesa),
            status=STATUS_NOMES.get(pedido.id_status, PedidoStatusNome.RECEBIDO),
            valorTotal=float(pedido.valor_total),
            itens=[
                ClienteResumoPedidoItemResponse(nomeProduto=item.produto.nome, quantidade=int(item.quantidade))
                for item in pedido.itens
                if not item.cancelado
            ],
        )
        for pedido in pedidos
    ]


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
