from datetime import date, datetime
from typing import Literal
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

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
    resetToken: UUID
    codigo: str = Field(pattern=r"^\d{6}$")
    novaSenha: str = Field(min_length=8, max_length=72)


class AuthOwnPasswordChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    senhaAtual: str = Field(min_length=1, max_length=72)
    novaSenha: str = Field(min_length=8, max_length=72)

    @field_validator("novaSenha")
    @classmethod
    def validar_nova_senha(cls, senha: str) -> str:
        tem_letra = any(caractere in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" for caractere in senha)
        tem_numero = any("0" <= caractere <= "9" for caractere in senha)
        if not tem_letra or not tem_numero:
            raise ValueError("A senha deve ter pelo menos 8 caracteres, com letras e números.")
        if len(senha.encode("utf-8")) > 72:
            raise ValueError("A senha deve ter no máximo 72 bytes.")
        return senha


class AuthOwnRecoveryEmailChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    senhaAtual: str = Field(min_length=1, max_length=72)
    email: str = Field(min_length=5, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

    @field_validator("email", mode="before")
    @classmethod
    def normalizar_email(cls, email: str) -> str:
        if not isinstance(email, str):
            raise ValueError("E-mail inválido.")
        return email.strip().lower()


class AuthOwnRecoveryEmailConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codigo: str = Field(pattern=r"^[0-9]{6}$")


class AuthPasswordResetStartRequest(BaseModel):
    cpf: str = Field(min_length=1)


class AuthPasswordResetVerifyRequest(BaseModel):
    resetToken: UUID
    codigo: str = Field(pattern=r"^\d{6}$")


class DemoContactEmailRequest(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    telefone: str = Field(min_length=10, max_length=30)
    preferencia: Literal["email", "telefone"] = "email"

    @field_validator("nome", "email", "telefone", mode="before")
    @classmethod
    def remover_espacos_externos(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class AuthPasswordResetStartResponse(BaseModel):
    resetToken: UUID | None = None
    # Disponivel somente no Docker local, para permitir testar o fluxo sem SMTP/SMS.
    debugCode: str | None = None


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
    email: str | None = Field(default=None, max_length=255)
    funcionarioId: int | None = Field(default=None, ge=1)
    senha: str | None = Field(default=None, min_length=8, max_length=72)
    ativo: bool | None = None


class UserResponse(BaseModel):
    id: int
    nome: str
    cpf: str
    role: Role
    email: str | None
    ativo: bool
    funcionarioId: int | None = None
    funcionarioNome: str | None = None


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
    reservaNome: str | None = None
    reservaTelefone: str | None = None
    reservaDataHora: datetime | None = None
    observacoes: str | None = None

class StatusMesaSchema(BaseModel):
    status: str = Field(min_length=1, max_length=30)

class MesaStatusRequest(BaseModel):
    status: str = Field(min_length=1)


class MesaReservaRequest(BaseModel):
    reservaNome: str | None = None
    reservaTelefone: str | None = None
    reservaDataHora: datetime | None = None
    observacoes: str | None = None


class MesaResponse(BaseModel):
    id: int
    numero: int
    capacidade: int
    status: str
    localizacao: str | None
    reservaNome: str | None = None
    reservaTelefone: str | None = None
    reservaDataHora: datetime | None
    observacoes: str | None
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


class ClientePratoFavoritoResponse(BaseModel):
    produtoId: int
    nome: str
    quantidade: float


class ClienteGastoMensalResponse(BaseModel):
    # Mes no formato AAAA-MM; label curto para o grafico, ex.: "nov/26".
    mes: str
    label: str
    valor: float
    pedidos: int


class ClienteResumoPedidoItemResponse(BaseModel):
    nomeProduto: str
    quantidade: int


class ClienteResumoPedidoResponse(BaseModel):
    id: int
    dataHora: datetime
    origem: str
    numeroMesa: int | None
    status: PedidoStatusNome
    valorTotal: float
    itens: list[ClienteResumoPedidoItemResponse]


class ClienteResumoResponse(BaseModel):
    clienteId: int
    nome: str
    codigo: str
    totalPedidos: int
    totalGasto: float
    ticketMedio: float
    pratoMaisPedido: ClientePratoFavoritoResponse | None
    primeiraCompra: datetime | None
    ultimaCompra: datetime | None
    pedidosUltimos30Dias: int
    clienteFrequente: bool
    gastoPorMes: list[ClienteGastoMensalResponse]
    ultimosPedidos: list[ClienteResumoPedidoResponse]


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
    cpf: str | None = None
    telefone: str | None = None
    cargo: str
    salario: float | None = None
    ativo: bool
    criadoEm: datetime | None


class InsumoRequest(BaseModel):
    nome: str = Field(min_length=1)
    unidade: str = Field(min_length=1)
    quantidadeAtual: Decimal = Field(ge=Decimal("0.000"))
    quantidadeMinima: Decimal = Field(ge=Decimal("0.000"))
    custoUnitario: Decimal = Field(ge=Decimal("0.00"))
    fornecedorIds: list[int] | None = None


class FornecedorResumoResponse(BaseModel):
    id: int
    razaoSocial: str
    ativo: bool


class InsumoResponse(BaseModel):
    id: int
    nome: str
    unidade: str
    quantidadeAtual: float
    quantidadeMinima: float
    custoUnitario: float
    ativo: bool
    fornecedores: list[FornecedorResumoResponse] = Field(default_factory=list)


class RestauranteRequest(BaseModel):
    nome: str = Field(min_length=1)
    cnpj: str | None = None
    telefone: str | None = None
    endereco: str | None = None
    email: str | None = None


class RestauranteResponse(BaseModel):
    id: int | None
    nome: str
    cnpj: str | None = None
    telefone: str | None = None
    endereco: str | None = None
    email: str | None = None


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


class PagamentoDivididoRequest(BaseModel):
    pessoa: str = Field(min_length=1, max_length=60)
    formaPagamento: Literal["PIX", "DEBITO", "CREDITO", "DINHEIRO"]
    valor: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class PedidoCreateRequest(BaseModel):
    numeroMesa: int | None = Field(default=None, ge=1)
    mesaId: int | None = None
    mesaToken: UUID | None = None
    clienteId: int | None = Field(default=None, ge=1)
    vendaCaixa: bool | None = None
    formaPagamento: str | None = None
    pagamentosDivididos: list[PagamentoDivididoRequest] | None = Field(default=None, min_length=2, max_length=12)
    desconto: Decimal | None = None
    observacoes: str | None = None
    itens: list[PedidoItemRequest] = Field(min_length=1)


class PedidoStatusUpdateRequest(BaseModel):
    origemCancelamento: Literal["Atendente", "Cozinha", "Gerente", "Caixa"] | None = None
    status: PedidoStatusNome
    formaPagamento: str | None = None
    motivo: str | None = Field(default=None, max_length=255)


class PedidoAvaliacaoRequest(BaseModel):
    nota: int = Field(ge=1, le=5)
    comentario: str | None = Field(default=None, max_length=300)

    @field_validator("comentario", mode="before")
    @classmethod
    def limpar_comentario(cls, valor: str | None) -> str | None:
        if valor is None:
            return None
        texto = valor.strip()
        return texto or None


class PedidoAvaliacaoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pedidoId: int
    nota: int
    comentario: str | None
    dataHora: datetime


class ChamadoMesaRequest(BaseModel):
    tipo: Literal["ATENDENTE", "CONTA", "AGUA"]


class ChamadoMesaResponse(BaseModel):
    id: int
    mesaId: int
    numeroMesa: int
    tipo: Literal["ATENDENTE", "CONTA", "AGUA"]
    criadoEm: datetime


class PedidoEditRequest(BaseModel):
    itens: list[PedidoItemRequest] = Field(min_length=1, max_length=100)
    observacoes: str | None = Field(default=None, max_length=2000)
    motivo: str = Field(min_length=3, max_length=255)
    atualizadoEm: datetime


class PedidoItemResponse(BaseModel):
    produtoId: int
    nomeProduto: str
    quantidade: int
    precoUnitario: float
    subtotal: float
    tempoPreparo: int | None = None

class PedidoUrgenciaRequest(BaseModel):
    urgente: bool


class PedidoResponse(BaseModel):
    urgente: bool = False
    numeroPedido: str | None = None
    canceladoEm: datetime | None = None
    entregueEm: datetime | None = None
    motivoCancelamento: str | None = None
    origemCancelamento: str | None = None
    id: int
    numeroMesa: int | None
    clienteId: int | None = None
    clienteNome: str | None = None
    origem: str
    status: PedidoStatusNome
    dataHora: datetime
    atualizadoEm: datetime | None = None
    valorTotal: float
    observacoes: str | None
    itens: list[PedidoItemResponse]
    tokenAcesso: str | None = None


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
    # Sem ficha tecnica nao ha custo conhecido, entao o lucro nao e informado.
    lucro: float | None
    temFichaTecnica: bool


class RelatorioResumoResponse(BaseModel):
    inicio: date
    fim: date
    pedidosRecebidos: int
    pedidosEmPreparo: int
    pedidosProntos: int
    pedidosEntregues: int
    pedidosCancelados: int
    faturamento: float
    faturamentoRecebido: float
    faturamentoEmAberto: float
    valorCancelado: float
    ticketMedio: float
    topProdutos: list[TopProdutoResponse]


class RelatorioVendasResponse(BaseModel):
    inicio: date
    fim: date
    faturamento: float
    faturamentoRecebido: float
    faturamentoEmAberto: float
    valorCancelado: float
    ticketMedio: float
    custoTotal: float
    produtosSemFicha: int
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
    produtosSemFicha: int


class RelatorioBcgItem(BaseModel):
    produtoId: int
    nome: str
    idCategoria: int
    quantidadeVendida: float
    faturamento: float
    faturamentoAnterior: float
    participacao: float
    crescimento: float | None
    classificacao: str
    acaoSugerida: str
    lucro: float | None
    temFichaTecnica: bool


class AvaliacaoPorNotaResponse(BaseModel):
    nota: int
    quantidade: int


class AvaliacaoComentarioResponse(BaseModel):
    id: int
    pedidoId: int
    mesaNumero: int | None
    nota: int
    comentario: str | None
    dataHora: datetime


class RelatorioAvaliacoesResponse(BaseModel):
    notaMedia: float
    totalAvaliacoes: int
    quantidadePorNota: list[AvaliacaoPorNotaResponse]
    comentariosRecentes: list[AvaliacaoComentarioResponse]


class RelatorioBcgResponse(BaseModel):
    inicio: date
    fim: date
    inicioAnterior: date
    fimAnterior: date
    faturamentoTotal: float
    faturamentoAnterior: float
    crescimentoTotal: float | None
    limiteParticipacao: float
    limiteCrescimento: float
    itens: list[RelatorioBcgItem]


class EstoqueMovimentoResponse(BaseModel):
    id: int
    insumoId: int
    insumoNome: str
    unidade: str
    tipo: str
    quantidade: float
    saldoApos: float
    pedidoId: int | None
    usuarioNome: str | None
    motivo: str | None
    criadoEm: datetime


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


def _validar_cpf(valor: str) -> str:
    cpf = "".join(c for c in valor if c.isdigit())
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        raise ValueError("CPF invalido")
    for i in (9, 10):
        soma = sum(int(cpf[j]) * (i + 1 - j) for j in range(i))
        digito = (soma * 10 % 11) % 10
        if digito != int(cpf[i]):
            raise ValueError("CPF invalido")
    return cpf


class UserCreateRequest(BaseModel):
    nome: str = Field(min_length=2, max_length=120)
    cpf: str
    senha: str = Field(min_length=8, max_length=72)  # limite do bcrypt
    email: str = Field(min_length=5, max_length=255)
    role: Role
    funcionarioId: int | None = Field(default=None, ge=1)

    @field_validator("cpf")
    @classmethod
    def cpf_valido(cls, v: str) -> str:
        return _validar_cpf(v)


class TurnoCaixaAbrirRequest(BaseModel):
    valorInicial: Decimal = Field(ge=Decimal("0"), le=Decimal("99999999.99"))
    observacao: str | None = Field(default=None, max_length=255)


class TurnoCaixaFecharRequest(BaseModel):
    valorContado: Decimal = Field(ge=Decimal("0"), le=Decimal("99999999.99"))
    observacao: str | None = Field(default=None, max_length=255)


class TurnoCaixaTotaisResponse(BaseModel):
    pix: float
    debito: float
    credito: float
    dinheiro: float
    outros: float
    totalVendas: float
    quantidadeVendas: int


class TurnoCaixaResponse(BaseModel):
    id: int
    aberto: bool
    abertoPorId: int | None
    abertoPor: str | None
    abertoEm: datetime
    valorInicial: float
    fechadoPorId: int | None
    fechadoPor: str | None
    fechadoEm: datetime | None
    valorContado: float | None
    observacao: str | None
    totais: TurnoCaixaTotaisResponse
    # Dinheiro que deveria estar na gaveta: valor inicial + vendas em dinheiro.
    valorEsperadoDinheiro: float
    # valorContado - valorEsperadoDinheiro; negativo = falta, positivo = sobra. Nulo com o turno aberto.
    diferenca: float | None
