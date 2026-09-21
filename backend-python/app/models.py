from enum import StrEnum

from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Computed, DateTime, Enum, ForeignKey, Integer, Numeric, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(StrEnum):
    ADMIN = "ADMIN"
    COZINHA = "COZINHA"
    FUNCIONARIO = "FUNCIONARIO"


class PedidoStatusNome(StrEnum):
    RECEBIDO = "RECEBIDO"
    EM_PREPARO = "EM_PREPARO"
    PRONTO = "PRONTO"
    SERVIDO = "SERVIDO"
    ENTREGUE = "ENTREGUE"
    CANCELADO = "CANCELADO"


class User(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    cpf: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    senha: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False), nullable=False)


class Restaurante(Base):
    __tablename__ = "restaurante"

    id: Mapped[int] = mapped_column("id_restaurante", BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    cnpj: Mapped[str] = mapped_column(String(18), nullable=False)
    telefone: Mapped[str | None] = mapped_column(String(20))
    endereco: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Categoria(Base):
    __tablename__ = "categoria"

    id: Mapped[int] = mapped_column("id_categoria", BigInteger, primary_key=True, autoincrement=True)
    id_restaurante: Mapped[int] = mapped_column(BigInteger, nullable=False)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    icone: Mapped[str | None] = mapped_column(String(100))
    ordem: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Produto(Base):
    __tablename__ = "produto"

    id: Mapped[int] = mapped_column("id_produto", BigInteger, primary_key=True, autoincrement=True)
    codigo: Mapped[str | None] = mapped_column(String(20), unique=True)
    id_categoria: Mapped[int] = mapped_column(BigInteger, nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text)
    preco: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    imagem: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    tempo_preparo: Mapped[int | None] = mapped_column(Integer)
    destaque: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime)


class Mesa(Base):
    __tablename__ = "mesa"

    id: Mapped[int] = mapped_column("id_mesa", BigInteger, primary_key=True, autoincrement=True)
    id_restaurante: Mapped[int] = mapped_column(BigInteger, nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    capacidade: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    localizacao: Mapped[str | None] = mapped_column(String(100))
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Cliente(Base):
    __tablename__ = "clientes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo: Mapped[str | None] = mapped_column(String(20), unique=True)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    cpf: Mapped[str] = mapped_column(String(18), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    telefone: Mapped[str | None] = mapped_column(String(20))
    endereco: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime)


class Fornecedor(Base):
    __tablename__ = "fornecedores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo: Mapped[str | None] = mapped_column(String(20), unique=True)
    razao_social: Mapped[str] = mapped_column(String, nullable=False)
    cnpj: Mapped[str] = mapped_column(String(18), unique=True, nullable=False)
    especialidade: Mapped[str | None] = mapped_column(String)
    telefone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime)


class Funcionario(Base):
    __tablename__ = "funcionarios"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo: Mapped[str | None] = mapped_column(String(20), unique=True)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    cpf: Mapped[str] = mapped_column(String(14), unique=True, nullable=False)
    telefone: Mapped[str | None] = mapped_column(String)
    cargo: Mapped[str] = mapped_column(String, nullable=False)
    salario: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime | None] = mapped_column(DateTime)


class Insumo(Base):
    __tablename__ = "insumos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    unidade: Mapped[str] = mapped_column(String, nullable=False)
    quantidade_atual: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    quantidade_minima: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    custo_unitario: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class Pedido(Base):
    __tablename__ = "pedido"

    id: Mapped[int] = mapped_column("id_pedido", BigInteger, primary_key=True, autoincrement=True)
    id_mesa: Mapped[int | None] = mapped_column(Integer, ForeignKey("mesa.id_mesa"))
    id_status: Mapped[int] = mapped_column(Integer, nullable=False)
    numero_pedido: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    data_hora: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    observacoes: Mapped[str | None] = mapped_column(Text)
    valor_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    itens: Mapped[list["PedidoItem"]] = relationship(
        back_populates="pedido",
        cascade="all, delete-orphan",
    )


class PedidoItem(Base):
    __tablename__ = "item_pedido"

    id: Mapped[int] = mapped_column("id_item_pedido", BigInteger, primary_key=True, autoincrement=True)
    id_pedido: Mapped[int] = mapped_column(BigInteger, ForeignKey("pedido.id_pedido"), nullable=False)
    id_produto: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id_produto"), nullable=False)
    quantidade: Mapped[Decimal] = mapped_column(Numeric(8, 3), nullable=False)
    preco_unitario: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    subtotal: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), Computed("quantidade * preco_unitario"))
    observacao: Mapped[str | None] = mapped_column(Text)
    cancelado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    pedido: Mapped[Pedido] = relationship(back_populates="itens")
    produto: Mapped[Produto] = relationship()


class PedidoStatusHistorico(Base):
    __tablename__ = "pedido_status_historico"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    id_pedido: Mapped[int] = mapped_column(BigInteger, ForeignKey("pedido.id_pedido"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    registrado_em: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)


class ProdutoInsumo(Base):
    __tablename__ = "produto_insumos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    produto_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("produto.id_produto"), nullable=False)
    insumo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("insumos.id"), nullable=False)
    quantidade: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)

    produto: Mapped[Produto] = relationship()
    insumo: Mapped[Insumo] = relationship()
