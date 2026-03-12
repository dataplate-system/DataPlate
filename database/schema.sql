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