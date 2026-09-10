from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import PedidoStatusNome, Role


class AuthLoginRequest(BaseModel):
    cpf: str = Field(min_length=1)
    senha: str = Field(min_length=1)


class AuthRefreshRequest(BaseModel):
    refreshToken: str = Field(min_length=1)


class AuthRegisterRequest(BaseModel):
    nome: str = Field(min_length=1)
    cpf: str = Field(min_length=1)
    senha: str = Field(min_length=1)
    role: Role


class AuthPasswordResetRequest(BaseModel):
    cpf: str = Field(min_length=1)
    novaSenha: str = Field(min_length=1)


class AuthResponse(BaseModel):
    token: str
    refreshToken: str
    id: int
    nome: str
    cpf: str
    role: Role


class UserUpdateRequest(BaseModel):
    nome: str = Field(min_length=1)
    cpf: str = Field(min_length=1)
    role: Role


class UserResponse(BaseModel):
    id: int
    nome: str
    cpf: str
    role: Role


class CategoriaRequest(BaseModel):
    nome: str = Field(min_length=1)
    descricao: str | None = None
    ordem: int | None = None


class CategoriaResponse(BaseModel):
    id: int
    nome: str
    descricao: str | None
    ordem: int


class ProdutoRequest(BaseModel):
    codigo: str | None = None
    idCategoria: int | None = None
    nome: str | None = None
    descricao: str | None = None
    preco: Decimal | None = None
    imagem: str | None = None
    ativo: bool | None = None
    tempoPreparo: int | None = None
    destaque: bool | None = None


class ProdutoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    codigo: str | None
    idCategoria: int
    nome: str
    descricao: str | None
    preco: float
    imagem: str | None
    ativo: bool
    tempoPreparo: int | None
    destaque: bool
    criadoEm: datetime | None


class ErrorResponse(BaseModel):
    mensagem: str
    timestamp: int


class MesaRequest(BaseModel):
    numero: int = Field(ge=1)
    capacidade: int = Field(ge=1)
    status: str = Field(min_length=1)
    localizacao: str | None = None


class MesaResponse(BaseModel):
    id: int
    numero: int
    capacidade: int
    status: str
    localizacao: str | None
    ativo: bool


class ClienteRequest(BaseModel):
    codigo: str | None = None
    nome: str = Field(min_length=1)
    cpf: str = Field(min_length=1)
    email: str | None = None
    telefone: str | None = None
    endereco: str | None = None


class ClienteResponse(BaseModel):
    id: int
    codigo: str
    nome: str
    cpf: str
    email: str | None
    telefone: str | None
    endereco: str | None
    ativo: bool
    criadoEm: datetime | None


class FornecedorRequest(BaseModel):
    codigo: str | None = None
    razaoSocial: str = Field(min_length=1)
    cnpj: str = Field(min_length=1)
    especialidade: str | None = None
    telefone: str | None = None
    email: str | None = None


class FornecedorResponse(BaseModel):
    id: int
    codigo: str
    razaoSocial: str
    cnpj: str
    especialidade: str | None
    telefone: str | None
    email: str | None
    ativo: bool
    criadoEm: datetime | None


class FuncionarioRequest(BaseModel):
    codigo: str | None = None
    nome: str = Field(min_length=1)
    cpf: str = Field(min_length=1)
    telefone: str | None = None
    cargo: str = Field(min_length=1)
    salario: Decimal | None = None


class FuncionarioResponse(BaseModel):
    id: int
    codigo: str
    nome: str
    cpf: str
    telefone: str | None
    cargo: str
    salario: float | None
    ativo: bool
    criadoEm: datetime | None


class InsumoRequest(BaseModel):
    nome: str = Field(min_length=1)
    unidade: str = Field(min_length=1)
    quantidadeAtual: Decimal = Field(ge=Decimal("0.000"))
    quantidadeMinima: Decimal = Field(ge=Decimal("0.000"))
    custoUnitario: Decimal = Field(ge=Decimal("0.00"))


class InsumoResponse(BaseModel):
    id: int
    nome: str
    unidade: str
    quantidadeAtual: float
    quantidadeMinima: float
    custoUnitario: float
    ativo: bool


class RestauranteRequest(BaseModel):
    nome: str = Field(min_length=1)
    cnpj: str | None = None
    telefone: str | None = None
    endereco: str | None = None
    email: str | None = None


class RestauranteResponse(BaseModel):
    id: int | None
    nome: str
    cnpj: str | None
    telefone: str | None
    endereco: str | None
    email: str | None


class CepResponse(BaseModel):
    sucesso: bool
    cep: str | None = None
    logradouro: str | None = None
    complemento: str | None = None
    bairro: str | None = None
    localidade: str | None = None
    uf: str | None = None
    ibge: str | None = None
    gia: str | None = None
    ddd: str | None = None
    siafi: str | None = None
    mensagem: str | None = None


class PedidoItemRequest(BaseModel):
    produtoId: int = Field(ge=1)
    quantidade: int = Field(ge=1)


class PedidoCreateRequest(BaseModel):
    numeroMesa: int | None = None
    mesaId: int | None = None
    vendaCaixa: bool | None = None
    formaPagamento: str | None = None
    desconto: Decimal | None = None
    observacoes: str | None = None
    itens: list[PedidoItemRequest] = Field(min_length=1)


class PedidoStatusUpdateRequest(BaseModel):
    status: PedidoStatusNome
    formaPagamento: str | None = None


class PedidoItemResponse(BaseModel):
    produtoId: int
    nomeProduto: str
    quantidade: int
    precoUnitario: float
    subtotal: float


class PedidoResponse(BaseModel):
    id: int
    numeroMesa: int | None
    origem: str
    status: PedidoStatusNome
    dataHora: datetime
    valorTotal: float
    observacoes: str | None
    itens: list[PedidoItemResponse]


class PaginatedPedidoResponse(BaseModel):
    content: list[PedidoResponse]
    page: int
    size: int
    totalElements: int
    totalPages: int


class ProdutoInsumoRequest(BaseModel):
    insumoId: int = Field(ge=1)
    quantidade: Decimal = Field(ge=Decimal("0.001"))


class ProdutoInsumoResponse(BaseModel):
    id: int
    produtoId: int
    insumoId: int
    nomeInsumo: str
    unidade: str
    quantidade: float


class TopProdutoResponse(BaseModel):
    produtoId: int
    nome: str
    quantidadeVendida: float
    faturamento: float


class VendasTimelineItem(BaseModel):
    label: str
    valor: float
    quantidade: int


class VendasPorDiaItem(BaseModel):
    data: str
    pedidos: int
    faturamento: float
    ticketMedio: float


class VendaHistoricoItem(BaseModel):
    id: int
    dataHora: datetime
    origem: str
    numeroMesa: int | None
    status: str
    itens: int
    valorTotal: float


class RelatorioCardapioItem(BaseModel):
    produtoId: int
    nome: str
    idCategoria: int
    precoVenda: float
    quantidadeVendida: float
    faturamento: float
    custoTotal: float
    lucro: float


class RelatorioResumoResponse(BaseModel):
    inicio: date
    fim: date
    pedidosRecebidos: int
    pedidosEmPreparo: int
    pedidosProntos: int
    pedidosEntregues: int
    pedidosCancelados: int
    faturamento: float
    ticketMedio: float
    topProdutos: list[TopProdutoResponse]


class RelatorioVendasResponse(BaseModel):
    inicio: date
    fim: date
    faturamento: float
    ticketMedio: float
    custoTotal: float
    totalPedidos: int
    pedidosEntregues: int
    pedidosCancelados: int
    timeline: list[VendasTimelineItem]
    porDia: list[VendasPorDiaItem]
    topProdutos: list[TopProdutoResponse]
    historico: list[VendaHistoricoItem]


class RelatorioCardapioResponse(BaseModel):
    topProdutos: list[RelatorioCardapioItem]
    totalItensVendidos: int
    faturamentoTotal: float


class RelatorioOperacionalResponse(BaseModel):
    inicio: date
    fim: date
    totalPedidos: int
    pedidosEntregues: int
    pedidosCancelados: int
    pedidosRecebidos: int
    pedidosEmPreparo: int
    pedidosProntos: int
    taxaCancelamento: float
    taxaEntrega: float
    ticketMedio: float
    faturamento: float
    tempoMedioPreparoMin: float
