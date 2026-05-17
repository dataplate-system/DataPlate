CREATE TABLE IF NOT EXISTS restaurante (
    id_restaurante INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cnpj CHAR(18) NOT NULL UNIQUE,
    telefone VARCHAR(20),
    endereco TEXT,
    email VARCHAR(255) NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMP NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categoria (
    id_categoria INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_restaurante INTEGER NOT NULL REFERENCES restaurante(id_restaurante) ON DELETE RESTRICT,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    icone VARCHAR(100),
    ordem SMALLINT NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_categoria_nome UNIQUE (id_restaurante, nome)
);

CREATE TABLE IF NOT EXISTS produto (
    id_produto INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_categoria INTEGER NOT NULL REFERENCES categoria(id_categoria) ON DELETE RESTRICT,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    preco NUMERIC(10, 2) NOT NULL,
    imagem TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    tempo_preparo SMALLINT,
    destaque BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mesa (
    id_mesa INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_restaurante INTEGER NOT NULL REFERENCES restaurante(id_restaurante) ON DELETE RESTRICT,
    numero SMALLINT NOT NULL,
    capacidade SMALLINT NOT NULL DEFAULT 4,
    status VARCHAR(20) NOT NULL DEFAULT 'livre',
    localizacao VARCHAR(100),
    qr_code_token UUID NOT NULL DEFAULT gen_random_uuid(),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_mesa_numero UNIQUE (id_restaurante, numero)
);

CREATE TABLE IF NOT EXISTS status_pedido (
    id_status INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(60) NOT NULL UNIQUE,
    descricao TEXT,
    cor CHAR(7) DEFAULT '#CCCCCC',
    ordem SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pedido (
    id_pedido INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_mesa INTEGER NOT NULL REFERENCES mesa(id_mesa) ON DELETE RESTRICT,
    id_status INTEGER NOT NULL REFERENCES status_pedido(id_status) ON DELETE RESTRICT,
    numero_pedido VARCHAR(20) NOT NULL UNIQUE,
    data_hora TIMESTAMP NOT NULL DEFAULT now(),
    observacoes TEXT,
    valor_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_pedido (
    id_item_pedido INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pedido INTEGER NOT NULL REFERENCES pedido(id_pedido) ON DELETE CASCADE,
    id_produto INTEGER NOT NULL REFERENCES produto(id_produto) ON DELETE RESTRICT,
    quantidade NUMERIC(8, 3) NOT NULL DEFAULT 1,
    preco_unitario NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(10, 2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
    observacao TEXT,
    cancelado BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO status_pedido (nome, descricao, cor, ordem)
SELECT * FROM (VALUES
    ('RECEBIDO', 'Pedido recebido', '#2563EB', 1),
    ('EM_PREPARO', 'Pedido em preparo', '#F59E0B', 2),
    ('PRONTO', 'Pedido pronto', '#10B981', 3),
    ('ENTREGUE', 'Pedido entregue', '#16A34A', 4),
    ('CANCELADO', 'Pedido cancelado', '#EF4444', 5)
) AS v(nome, descricao, cor, ordem)
WHERE NOT EXISTS (SELECT 1 FROM status_pedido);
