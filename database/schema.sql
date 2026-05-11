<<<<<<< HEAD
-- Criação da tabela de Ingredientes (Insumos)
CREATE TABLE ingredientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    quantidade_atual DECIMAL(10,2) NOT NULL,
    unidade_medida VARCHAR(10) NOT NULL, -- 'g', 'ml', 'un'
    preco_custo DECIMAL(10,2) NOT NULL
);

-- Tabela de Pratos
CREATE TABLE pratos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    preco_venda DECIMAL(10,2) NOT NULL,
    categoria VARCHAR(50) -- 'Burgers', 'Bebidas', etc.
);

-- Tabela Intermediária: Ficha Técnica (Relacionamento N:N)
CREATE TABLE ficha_tecnica (
    prato_id INT REFERENCES pratos(id),
    ingrediente_id INT REFERENCES ingredientes(id),
    quantidade_necessaria DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (prato_id, ingrediente_id)
);
=======
CREATE TABLE IF NOT EXISTS produto (
    id_produto BIGSERIAL PRIMARY KEY,
    id_categoria BIGINT NOT NULL,
    nome VARCHAR(200) NOT NULL,
    descricao VARCHAR(1000),
    preco DOUBLE PRECISION NOT NULL,
    imagem VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    tempo_preparo INTEGER,
    destaque BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedidos (
    id BIGSERIAL PRIMARY KEY,
    numero_mesa INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL,
    data_hora TIMESTAMP NOT NULL,
    valor_total NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS pedido_itens (
    id BIGSERIAL PRIMARY KEY,
    pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id BIGINT NOT NULL REFERENCES produto(id_produto),
    quantidade INTEGER NOT NULL,
    preco_unitario NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS insumos (
    id BIGSERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL UNIQUE,
    unidade VARCHAR(30) NOT NULL,
    quantidade_atual NUMERIC(12, 3) NOT NULL,
    quantidade_minima NUMERIC(12, 3) NOT NULL,
    custo_unitario NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS produto_insumos (
    id BIGSERIAL PRIMARY KEY,
    produto_id BIGINT NOT NULL REFERENCES produto(id_produto) ON DELETE CASCADE,
    insumo_id BIGINT NOT NULL REFERENCES insumos(id),
    quantidade NUMERIC(12, 3) NOT NULL
);

INSERT INTO produto (id_produto, id_categoria, nome, descricao, preco, imagem, ativo, destaque)
VALUES
    (1, 1, 'Burger Gourmet', 'Hamburguer artesanal com queijo cheddar, bacon crocante, alface e tomate', 32.90, '../images/Hambúrguer.jpg', TRUE, TRUE),
    (2, 2, 'Pasta Carbonara', 'Massa fresca com molho carbonara tradicional, bacon e parmesao', 38.50, '../images/Pasta Carbonara.jpg', TRUE, TRUE),
    (3, 3, 'Salmão Grelhado', 'File de salmao grelhado com legumes salteados e molho de limao', 52.90, '../images/Salmão Grelhado.jpg', TRUE, TRUE),
    (4, 4, 'Salada Caesar', 'Alface romana, croutons, parmesao e molho caesar', 24.90, '../images/Salada Caesar.jpg', TRUE, TRUE),
    (5, 5, 'Bolo de Chocolate', 'Bolo de chocolate belga com cobertura cremosa de chocolate', 18.90, '../images/Bolo de Chocolate.jpg', TRUE, TRUE),
    (6, 5, 'Tiramisu', 'Sobremesa italiana classica com cafe e mascarpone', 22.90, '../images/Tiramisu.jpg', TRUE, TRUE),
    (7, 6, 'Água', 'Agua mineral natural sem gas 500ml', 2.90, '../images/Água.jpg', TRUE, TRUE)
ON CONFLICT (id_produto) DO NOTHING;

SELECT setval('produto_id_produto_seq', (SELECT MAX(id_produto) FROM produto));
>>>>>>> 37a57ca (Armazenar os dados do front e back no banco de dados)
