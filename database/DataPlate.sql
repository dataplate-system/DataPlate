CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- Para UUIDs e hashing
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- Para buscas sem acento
 
 
-- Tipo de movimentação de estoque
CREATE TYPE tipo_movimentacao_enum AS ENUM ('entrada', 'saida');
 
-- Status de pagamento
CREATE TYPE status_pagamento_enum AS ENUM ('pendente', 'aprovado', 'recusado', 'cancelado', 'estornado');
 
 

CREATE TABLE restaurante (
    id_restaurante  INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome            VARCHAR(150)    NOT NULL,
    cnpj            CHAR(18)        NOT NULL UNIQUE,           -- formato: XX.XXX.XXX/XXXX-XX
    telefone        VARCHAR(20),
    endereco        TEXT,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    ativo           BOOLEAN         NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMP       NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMP       NOT NULL DEFAULT NOW(),
 
    CONSTRAINT chk_restaurante_cnpj  CHECK (cnpj  ~ '^\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}$'),
    CONSTRAINT chk_restaurante_email CHECK (email ~ '^[^@]+@[^@]+\.[^@]+$')
);
 
COMMENT ON TABLE  restaurante              IS 'Cadastro dos restaurantes clientes do DataPlate';
COMMENT ON COLUMN restaurante.cnpj        IS 'CNPJ no formato XX.XXX.XXX/XXXX-XX';
COMMENT ON COLUMN restaurante.ativo       IS 'FALSE = restaurante desativado/suspenso';
 
 

CREATE TABLE mesa (
    id_mesa         INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_restaurante  INTEGER         NOT NULL,
    numero          SMALLINT        NOT NULL,
    capacidade      SMALLINT        NOT NULL DEFAULT 4,
    status          VARCHAR(20)     NOT NULL DEFAULT 'livre',
    localizacao     VARCHAR(100),                              -- ex.: "Varanda", "Salão Principal"
    qr_code_token   UUID            NOT NULL DEFAULT gen_random_uuid(), -- token único para o QR Code
    ativo           BOOLEAN         NOT NULL DEFAULT TRUE,
 
    CONSTRAINT fk_mesa_restaurante  FOREIGN KEY (id_restaurante) REFERENCES restaurante(id_restaurante) ON DELETE RESTRICT,
    CONSTRAINT chk_mesa_status      CHECK (status IN ('livre', 'ocupada', 'reservada', 'inativa')),
    CONSTRAINT chk_mesa_capacidade  CHECK (capacidade > 0),
    CONSTRAINT uq_mesa_numero       UNIQUE (id_restaurante, numero)
);
 
COMMENT ON COLUMN mesa.qr_code_token IS 'Token UUID embutido no QR Code para acesso ao cardápio digital';
 
CREATE INDEX idx_mesa_restaurante ON mesa(id_restaurante);
CREATE INDEX idx_mesa_qr_token    ON mesa(qr_code_token);
 
 

CREATE TABLE categoria (
    id_categoria    INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_restaurante  INTEGER         NOT NULL,
    nome            VARCHAR(100)    NOT NULL,
    descricao       TEXT,
    icone           VARCHAR(100),                              -- nome do ícone ou URL
    ordem           SMALLINT        NOT NULL DEFAULT 0,
    ativo           BOOLEAN         NOT NULL DEFAULT TRUE,
 
    CONSTRAINT fk_categoria_restaurante FOREIGN KEY (id_restaurante) REFERENCES restaurante(id_restaurante) ON DELETE RESTRICT,
    CONSTRAINT uq_categoria_nome        UNIQUE (id_restaurante, nome)
);
 
CREATE INDEX idx_categoria_restaurante ON categoria(id_restaurante);
CREATE INDEX idx_categoria_ordem       ON categoria(ordem);
 

CREATE TABLE produto (
    id_produto      INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_categoria    INTEGER         NOT NULL,
    nome            VARCHAR(200)    NOT NULL,
    descricao       TEXT,
    preco           NUMERIC(10, 2)  NOT NULL,
    imagem          TEXT,                                      -- URL da imagem
    ativo           BOOLEAN         NOT NULL DEFAULT TRUE,
    tempo_preparo   SMALLINT,                                  -- em minutos
    destaque        BOOLEAN         NOT NULL DEFAULT FALSE,    -- produto em destaque no cardápio
    criado_em       TIMESTAMP       NOT NULL DEFAULT NOW(),
 
    CONSTRAINT fk_produto_categoria FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria) ON DELETE RESTRICT,
    CONSTRAINT chk_produto_preco    CHECK (preco >= 0),
    CONSTRAINT chk_tempo_preparo    CHECK (tempo_preparo IS NULL OR tempo_preparo > 0)
);
 
CREATE INDEX idx_produto_categoria ON produto(id_categoria);
CREATE INDEX idx_produto_ativo     ON produto(ativo);
 

CREATE TABLE ingrediente (
    id_ingrediente  INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_restaurante  INTEGER         NOT NULL,
    nome            VARCHAR(150)    NOT NULL,
    unidade_medida  VARCHAR(20)     NOT NULL,                  -- ex.: kg, g, L, ml, un
    criado_em       TIMESTAMP       NOT NULL DEFAULT NOW(),
 
    CONSTRAINT fk_ingrediente_restaurante FOREIGN KEY (id_restaurante) REFERENCES restaurante(id_restaurante) ON DELETE RESTRICT,
    CONSTRAINT uq_ingrediente_nome        UNIQUE (id_restaurante, nome),
    CONSTRAINT chk_unidade_medida         CHECK (unidade_medida IN ('kg','g','L','ml','un','cx','pct','fatia','dose'))
);
 
CREATE INDEX idx_ingrediente_restaurante ON ingrediente(id_restaurante);
 
 
CREATE TABLE ficha_tecnica (
    id_ficha        INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_produto      INTEGER         NOT NULL UNIQUE,           -- 1:1 com produto
    rendimento      NUMERIC(8, 3)   NOT NULL DEFAULT 1,        -- nº de porções que a ficha produz
    unidade_rendimento VARCHAR(20)  NOT NULL DEFAULT 'porcao',
    modo_preparo    TEXT,
    custo_calculado NUMERIC(10, 2)  GENERATED ALWAYS AS (NULL::NUMERIC) STORED, -- preenchido via trigger
    criado_em       TIMESTAMP       NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMP       NOT NULL DEFAULT NOW(),
 
    CONSTRAINT fk_ficha_produto FOREIGN KEY (id_produto) REFERENCES produto(id_produto) ON DELETE CASCADE
);
 
-- Nota: custo_calculado será gerenciado via trigger (coluna real, não gerada)
-- A linha acima usa NULL apenas como placeholder; veja trigger atualiza_custo_ficha.
 
-- Recriamos sem a generated column para suportar updates via trigger:
ALTER TABLE ficha_tecnica DROP COLUMN custo_calculado;
ALTER TABLE ficha_tecnica ADD  COLUMN custo_calculado NUMERIC(10, 2);
 
CREATE INDEX idx_ficha_produto ON ficha_tecnica(id_produto);
 
 

CREATE TABLE ficha_tecnica_item (
    id_ficha        INTEGER         NOT NULL,
    id_ingrediente  INTEGER         NOT NULL,
    quantidade      NUMERIC(10, 4)  NOT NULL,
    observacao      VARCHAR(255),
 
    CONSTRAINT pk_ficha_item          PRIMARY KEY (id_ficha, id_ingrediente),
    CONSTRAINT fk_ficha_item_ficha    FOREIGN KEY (id_ficha)       REFERENCES ficha_tecnica(id_ficha) ON DELETE CASCADE,
    CONSTRAINT fk_ficha_item_ingred   FOREIGN KEY (id_ingrediente) REFERENCES ingrediente(id_ingrediente) ON DELETE RESTRICT,
    CONSTRAINT chk_fti_quantidade     CHECK (quantidade > 0)
);
 
CREATE INDEX idx_fti_ingrediente ON ficha_tecnica_item(id_ingrediente);
 
 
CREATE TABLE estoque (
    id_estoque          INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_ingrediente      INTEGER         NOT NULL,              -- estoque por ingrediente
    id_restaurante      INTEGER         NOT NULL,
    quantidade_atual    NUMERIC(12, 4)  NOT NULL DEFAULT 0,
    quantidade_minima   NUMERIC(12, 4)  NOT NULL DEFAULT 0,    -- nível para alerta de estoque baixo
    unidade_medida      VARCHAR(20)     NOT NULL,
    custo_unitario      NUMERIC(10, 4),                        -- custo por unidade de medida
    ultima_atualizacao  TIMESTAMP       NOT NULL DEFAULT NOW(),
 
    CONSTRAINT fk_estoque_ingrediente  FOREIGN KEY (id_ingrediente) REFERENCES ingrediente(id_ingrediente) ON DELETE RESTRICT,
    CONSTRAINT fk_estoque_restaurante  FOREIGN KEY (id_restaurante) REFERENCES restaurante(id_restaurante) ON DELETE RESTRICT,
    CONSTRAINT uq_estoque_ingred_rest  UNIQUE (id_ingrediente, id_restaurante),
    CONSTRAINT chk_estoque_qtd_min     CHECK (quantidade_minima >= 0),
    CONSTRAINT chk_estoque_custo       CHECK (custo_unitario IS NULL OR custo_unitario >= 0)
);
 
CREATE INDEX idx_estoque_ingrediente  ON estoque(id_ingrediente);
CREATE INDEX idx_estoque_restaurante  ON estoque(id_restaurante);
CREATE INDEX idx_estoque_baixo        ON estoque(id_restaurante) WHERE quantidade_atual <= quantidade_minima;
 
 
-- Tabela de domínio para os status do ciclo de vida do pedido

CREATE TABLE status_pedido (
    id_status       INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome            VARCHAR(60)     NOT NULL UNIQUE,
    descricao       TEXT,
    cor             CHAR(7)         DEFAULT '#CCCCCC',         -- cor hex para a UI
    ordem           SMALLINT        NOT NULL DEFAULT 0,        -- ordem no fluxo
 
    CONSTRAINT chk_status_cor CHECK (cor ~ '^#[0-9A-Fa-f]{6}$')
);
 
 

CREATE TABLE pedido (
    id_pedido       INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_mesa         INTEGER         NOT NULL,
    id_status       INTEGER         NOT NULL,
    numero_pedido   VARCHAR(20)     NOT NULL,                  -- ex.: "2024-0001"
    data_hora       TIMESTAMP       NOT NULL DEFAULT NOW(),
    observacoes     TEXT,
    valor_total     NUMERIC(10, 2)  NOT NULL DEFAULT 0,
    atualizado_em   TIMESTAMP       NOT NULL DEFAULT NOW(),
 
    CONSTRAINT fk_pedido_mesa    FOREIGN KEY (id_mesa)   REFERENCES mesa(id_mesa)          ON DELETE RESTRICT,
    CONSTRAINT fk_pedido_status  FOREIGN KEY (id_status) REFERENCES status_pedido(id_status) ON DELETE RESTRICT,
    CONSTRAINT chk_pedido_total  CHECK (valor_total >= 0),
    CONSTRAINT uq_pedido_numero  UNIQUE (numero_pedido)
);
 
CREATE INDEX idx_pedido_mesa    ON pedido(id_mesa);
CREATE INDEX idx_pedido_status  ON pedido(id_status);
CREATE INDEX idx_pedido_data    ON pedido(data_hora DESC);
 
 

CREATE TABLE item_pedido (
    id_item_pedido  INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pedido       INTEGER         NOT NULL,
    id_produto      INTEGER         NOT NULL,
    quantidade      NUMERIC(8, 3)   NOT NULL DEFAULT 1,
    preco_unitario  NUMERIC(10, 2)  NOT NULL,
    subtotal        NUMERIC(10, 2)  GENERATED ALWAYS AS (quantidade * preco_unitario) STORED,
    observacao      TEXT,                                      -- pedido especial do cliente
    cancelado       BOOLEAN         NOT NULL DEFAULT FALSE,
 
    CONSTRAINT fk_item_pedido_pedido  FOREIGN KEY (id_pedido)  REFERENCES pedido(id_pedido)  ON DELETE CASCADE,
    CONSTRAINT fk_item_pedido_produto FOREIGN KEY (id_produto) REFERENCES produto(id_produto) ON DELETE RESTRICT,
    CONSTRAINT chk_item_quantidade    CHECK (quantidade > 0),
    CONSTRAINT chk_item_preco         CHECK (preco_unitario >= 0)
);
 
CREATE INDEX idx_item_pedido_pedido  ON item_pedido(id_pedido);
CREATE INDEX idx_item_pedido_produto ON item_pedido(id_produto);
 
 

-- 1:1 com pedido (gerada ao fechar o pedido)

CREATE TABLE venda (
    id_venda        INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pedido       INTEGER         NOT NULL UNIQUE,           -- 1:1 com pedido
    data_hora       TIMESTAMP       NOT NULL DEFAULT NOW(),
    valor_total     NUMERIC(10, 2)  NOT NULL,
    desconto        NUMERIC(10, 2)  NOT NULL DEFAULT 0,
    valor_final     NUMERIC(10, 2)  GENERATED ALWAYS AS (valor_total - desconto) STORED,
    numero_nota     VARCHAR(50),                               -- número fiscal / cupom
    observacoes     TEXT,
 
    CONSTRAINT fk_venda_pedido    FOREIGN KEY (id_pedido) REFERENCES pedido(id_pedido) ON DELETE RESTRICT,
    CONSTRAINT chk_venda_desconto CHECK (desconto >= 0 AND desconto <= valor_total),
    CONSTRAINT chk_venda_total    CHECK (valor_total >= 0)
);
 
CREATE INDEX idx_venda_pedido    ON venda(id_pedido);
CREATE INDEX idx_venda_data      ON venda(data_hora DESC);
 
 

CREATE TABLE forma_pagamento (
    id_forma_pagamento  INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome                VARCHAR(80)     NOT NULL UNIQUE,
    descricao           TEXT,
    taxa                NUMERIC(5, 4)   NOT NULL DEFAULT 0,    -- ex.: 0.0299 = 2,99%
    ativo               BOOLEAN         NOT NULL DEFAULT TRUE,
 
    CONSTRAINT chk_forma_taxa CHECK (taxa >= 0 AND taxa <= 1)
);
 


CREATE TABLE pagamento (
    id_pagamento        INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_venda            INTEGER         NOT NULL,
    id_forma_pagamento  INTEGER         NOT NULL,
    valor               NUMERIC(10, 2)  NOT NULL,
    data_hora           TIMESTAMP       NOT NULL DEFAULT NOW(),
    status              status_pagamento_enum NOT NULL DEFAULT 'pendente',
    comprovante         TEXT,                                  -- URL ou código do comprovante
    observacoes         TEXT,
 
    CONSTRAINT fk_pagamento_venda  FOREIGN KEY (id_venda)           REFERENCES venda(id_venda)              ON DELETE RESTRICT,
    CONSTRAINT fk_pagamento_forma  FOREIGN KEY (id_forma_pagamento) REFERENCES forma_pagamento(id_forma_pagamento) ON DELETE RESTRICT,
    CONSTRAINT chk_pagamento_valor CHECK (valor > 0)
);
 
CREATE INDEX idx_pagamento_venda ON pagamento(id_venda);
CREATE INDEX idx_pagamento_forma ON pagamento(id_forma_pagamento);
CREATE INDEX idx_pagamento_data  ON pagamento(data_hora DESC);
 
 

CREATE TABLE movimentacao_estoque (
    id_movimentacao     INTEGER             GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_estoque          INTEGER             NOT NULL,
    id_venda            INTEGER,                               -- NULL = entrada manual
    tipo_movimentacao   tipo_movimentacao_enum NOT NULL,
    quantidade          NUMERIC(12, 4)      NOT NULL,
    data_hora           TIMESTAMP           NOT NULL DEFAULT NOW(),
    responsavel         VARCHAR(150),                          -- nome do usuário/sistema
    observacao          TEXT,
 
    CONSTRAINT fk_movim_estoque FOREIGN KEY (id_estoque) REFERENCES estoque(id_estoque) ON DELETE RESTRICT,
    CONSTRAINT fk_movim_venda   FOREIGN KEY (id_venda)   REFERENCES venda(id_venda)    ON DELETE SET NULL,
    CONSTRAINT chk_movim_qtd    CHECK (quantidade > 0)
);
 
CREATE INDEX idx_movim_estoque ON movimentacao_estoque(id_estoque);
CREATE INDEX idx_movim_data    ON movimentacao_estoque(data_hora DESC);
CREATE INDEX idx_movim_venda   ON movimentacao_estoque(id_venda) WHERE id_venda IS NOT NULL;
 
 


-- Gera número sequencial de pedido (YYYY-NNNNNN)

CREATE OR REPLACE FUNCTION gerar_numero_pedido()
RETURNS TRIGGER AS $$
DECLARE
    v_seq    INTEGER;
    v_numero VARCHAR(20);
BEGIN
    SELECT COALESCE(MAX(CAST(SPLIT_PART(numero_pedido, '-', 2) AS INTEGER)), 0) + 1
      INTO v_seq
      FROM pedido
     WHERE numero_pedido LIKE TO_CHAR(NOW(), 'YYYY') || '-%';
 
    v_numero := TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_seq::TEXT, 6, '0');
    NEW.numero_pedido := v_numero;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_gerar_numero_pedido
    BEFORE INSERT ON pedido
    FOR EACH ROW
    WHEN (NEW.numero_pedido IS NULL OR NEW.numero_pedido = '')
    EXECUTE FUNCTION gerar_numero_pedido();
 
 
-- Atualiza valor_total do pedido ao inserir/atualizar item

CREATE OR REPLACE FUNCTION recalcular_total_pedido()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pedido
       SET valor_total    = (
               SELECT COALESCE(SUM(subtotal), 0)
                 FROM item_pedido
                WHERE id_pedido = COALESCE(NEW.id_pedido, OLD.id_pedido)
                  AND cancelado = FALSE
           ),
           atualizado_em  = NOW()
     WHERE id_pedido = COALESCE(NEW.id_pedido, OLD.id_pedido);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_recalcular_total_pedido
    AFTER INSERT OR UPDATE OR DELETE ON item_pedido
    FOR EACH ROW
    EXECUTE FUNCTION recalcular_total_pedido();
 
 

-- Baixa de estoque automática pela ficha técnica
-- Disparado ao inserir um item_pedido (não cancelado)

CREATE OR REPLACE FUNCTION baixar_estoque_por_ficha()
RETURNS TRIGGER AS $$
DECLARE
    v_rec RECORD;
BEGIN
    -- Só processa se o item não foi marcado como cancelado
    IF NEW.cancelado THEN
        RETURN NEW;
    END IF;
 
    -- Para cada ingrediente da ficha técnica do produto, desconta do estoque
    FOR v_rec IN
        SELECT
            fti.id_ingrediente,
            fti.quantidade * NEW.quantidade AS qtd_consumida,
            ft.rendimento
        FROM  ficha_tecnica       ft
        JOIN  ficha_tecnica_item  fti ON fti.id_ficha = ft.id_ficha
        WHERE ft.id_produto = NEW.id_produto
    LOOP
        -- Calcula quantidade real a descontar (considerando rendimento da ficha)
        DECLARE
            v_qtd_real  NUMERIC(12,4);
            v_id_est    INTEGER;
            v_rest      INTEGER;
        BEGIN
            SELECT m.id_restaurante INTO v_rest
              FROM mesa m
              JOIN pedido p ON p.id_mesa = m.id_mesa
             WHERE p.id_pedido = NEW.id_pedido;
 
            v_qtd_real := v_rec.qtd_consumida / NULLIF(v_rec.rendimento, 0);
 
            SELECT id_estoque INTO v_id_est
              FROM estoque
             WHERE id_ingrediente = v_rec.id_ingrediente
               AND id_restaurante = v_rest;
 
            IF v_id_est IS NOT NULL THEN
                -- Atualiza quantidade em estoque
                UPDATE estoque
                   SET quantidade_atual  = quantidade_atual - v_qtd_real,
                       ultima_atualizacao = NOW()
                 WHERE id_estoque = v_id_est;
 
                -- Registra movimentação de saída
                INSERT INTO movimentacao_estoque
                    (id_estoque, tipo_movimentacao, quantidade, responsavel, observacao)
                VALUES
                    (v_id_est, 'saida', v_qtd_real, 'sistema',
                     FORMAT('Saída automática — item_pedido #%s, produto #%s',
                            NEW.id_item_pedido, NEW.id_produto));
            END IF;
        END;
    END LOOP;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_baixar_estoque
    AFTER INSERT ON item_pedido
    FOR EACH ROW
    EXECUTE FUNCTION baixar_estoque_por_ficha();


 
-- Estorno de estoque ao CANCELAR um item_pedido

CREATE OR REPLACE FUNCTION estornar_estoque_item_cancelado()
RETURNS TRIGGER AS $$
DECLARE
    v_rec RECORD;
BEGIN
    -- Só processa quando o campo cancelado passa de FALSE para TRUE
    IF OLD.cancelado = FALSE AND NEW.cancelado = TRUE THEN
 
        FOR v_rec IN
            SELECT
                fti.id_ingrediente,
                (fti.quantidade * NEW.quantidade / NULLIF(ft.rendimento, 0)) AS qtd_estorno
            FROM  ficha_tecnica       ft
            JOIN  ficha_tecnica_item  fti ON fti.id_ficha = ft.id_ficha
            WHERE ft.id_produto = NEW.id_produto
        LOOP
            DECLARE
                v_id_est  INTEGER;
                v_rest    INTEGER;
            BEGIN
                SELECT m.id_restaurante INTO v_rest
                  FROM mesa m
                  JOIN pedido p ON p.id_mesa = m.id_mesa
                 WHERE p.id_pedido = NEW.id_pedido;
 
                SELECT id_estoque INTO v_id_est
                  FROM estoque
                 WHERE id_ingrediente = v_rec.id_ingrediente
                   AND id_restaurante = v_rest;
 
                IF v_id_est IS NOT NULL THEN
                    UPDATE estoque
                       SET quantidade_atual   = quantidade_atual + v_rec.qtd_estorno,
                           ultima_atualizacao = NOW()
                     WHERE id_estoque = v_id_est;
 
                    INSERT INTO movimentacao_estoque
                        (id_estoque, tipo_movimentacao, quantidade, responsavel, observacao)
                    VALUES
                        (v_id_est, 'entrada', v_rec.qtd_estorno, 'sistema',
                         FORMAT('Estorno — cancelamento item_pedido #%s', NEW.id_item_pedido));
                END IF;
            END;
        END LOOP;
    END IF;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_estornar_estoque_cancelamento
    AFTER UPDATE OF cancelado ON item_pedido
    FOR EACH ROW
    EXECUTE FUNCTION estornar_estoque_item_cancelado();
 
 

-- Atualiza timestamp atualizado_em automaticamente

CREATE OR REPLACE FUNCTION set_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_restaurante_atualizado_em
    BEFORE UPDATE ON restaurante
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
 
CREATE TRIGGER trg_pedido_atualizado_em
    BEFORE UPDATE ON pedido
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
 
CREATE TRIGGER trg_ficha_atualizado_em
    BEFORE UPDATE ON ficha_tecnica
    FOR EACH ROW EXECUTE FUNCTION set_atualizado_em();
 
 


-- Receita gerada por cada produto

CREATE OR REPLACE VIEW vendas_por_produto AS
SELECT
    p.id_produto,
    p.nome                                   AS produto,
    c.nome                                   AS categoria,
    COUNT(DISTINCT ip.id_pedido)             AS total_pedidos,
    SUM(ip.quantidade)                       AS unidades_vendidas,
    SUM(ip.subtotal)                         AS receita_total,
    ROUND(AVG(ip.preco_unitario), 2)         AS preco_medio
FROM item_pedido  ip
JOIN produto       p  ON p.id_produto  = ip.id_produto
JOIN categoria     c  ON c.id_categoria = p.id_categoria
JOIN pedido        pd ON pd.id_pedido  = ip.id_pedido
JOIN venda         v  ON v.id_pedido   = pd.id_pedido
WHERE ip.cancelado = FALSE
GROUP BY p.id_produto, p.nome, c.nome
ORDER BY receita_total DESC;
 
COMMENT ON VIEW vendas_por_produto IS 'Receita e volume de vendas agrupados por produto';
 

 
-- produtos_mais_vendidos
-- Top produtos por quantidade de unidades vendidas


CREATE OR REPLACE VIEW produtos_mais_vendidos AS
SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(ip.quantidade) DESC) AS ranking,
    p.id_produto,
    p.nome                                   AS produto,
    c.nome                                   AS categoria,
    SUM(ip.quantidade)                       AS unidades_vendidas,
    SUM(ip.subtotal)                         AS receita_total,
    COUNT(DISTINCT ip.id_pedido)             AS em_quantos_pedidos
FROM item_pedido  ip
JOIN produto       p  ON p.id_produto   = ip.id_produto
JOIN categoria     c  ON c.id_categoria = p.id_categoria
WHERE ip.cancelado = FALSE
GROUP BY p.id_produto, p.nome, c.nome
ORDER BY unidades_vendidas DESC;
 
COMMENT ON VIEW produtos_mais_vendidos IS 'Ranking de produtos por unidades vendidas';
 
 
-- estoque_baixo
-- Ingredientes com estoque abaixo do mínim

CREATE OR REPLACE VIEW estoque_baixo AS
SELECT
    e.id_estoque,
    r.nome                                   AS restaurante,
    i.nome                                   AS ingrediente,
    e.quantidade_atual,
    e.quantidade_minima,
    e.unidade_medida,
    ROUND(e.quantidade_minima - e.quantidade_atual, 4) AS deficit,
    e.ultima_atualizacao
FROM estoque      e
JOIN restaurante  r ON r.id_restaurante = e.id_restaurante
JOIN ingrediente  i ON i.id_ingrediente = e.id_ingrediente
WHERE e.quantidade_atual <= e.quantidade_minima
ORDER BY r.nome, deficit DESC;
 
COMMENT ON VIEW estoque_baixo IS 'Ingredientes com quantidade atual abaixo ou igual ao mínimo configurado';
 
 

-- Pedidos ainda em andamento por mesa e status

CREATE OR REPLACE VIEW resumo_pedidos_abertos AS
SELECT
    pd.id_pedido,
    pd.numero_pedido,
    r.nome                                   AS restaurante,
    m.numero                                 AS numero_mesa,
    m.localizacao,
    sp.nome                                  AS status,
    sp.cor                                   AS cor_status,
    pd.data_hora                             AS aberto_em,
    NOW() - pd.data_hora                     AS tempo_aberto,
    pd.valor_total,
    COUNT(ip.id_item_pedido)                 AS qtd_itens
FROM pedido       pd
JOIN mesa          m  ON m.id_mesa          = pd.id_mesa
JOIN restaurante   r  ON r.id_restaurante   = m.id_restaurante
JOIN status_pedido sp ON sp.id_status       = pd.id_status
LEFT JOIN item_pedido ip ON ip.id_pedido    = pd.id_pedido AND ip.cancelado = FALSE
WHERE sp.nome NOT IN ('fechado', 'cancelado')
GROUP BY pd.id_pedido, pd.numero_pedido, r.nome, m.numero, m.localizacao,
         sp.nome, sp.cor, pd.data_hora, pd.valor_total
ORDER BY pd.data_hora;
 
COMMENT ON VIEW resumo_pedidos_abertos IS 'Pedidos em andamento com tempo de espera';
 
 

-- faturamento_diario
-- Faturamento consolidado por dia

CREATE OR REPLACE VIEW faturamento_diario AS
SELECT
    DATE(v.data_hora)                        AS dia,
    r.nome                                   AS restaurante,
    COUNT(DISTINCT v.id_venda)               AS total_vendas,
    SUM(v.valor_total)                       AS subtotal_bruto,
    SUM(v.desconto)                          AS total_descontos,
    SUM(v.valor_final)                       AS faturamento_liquido
FROM venda        v
JOIN pedido        pd ON pd.id_pedido      = v.id_pedido
JOIN mesa          m  ON m.id_mesa         = pd.id_mesa
JOIN restaurante   r  ON r.id_restaurante  = m.id_restaurante
GROUP BY DATE(v.data_hora), r.nome
ORDER BY dia DESC, r.nome;
 
COMMENT ON VIEW faturamento_diario IS 'Faturamento bruto e líquido por dia e restaurante';
 
 

-- INSERTS DE EXEMPLO

INSERT INTO restaurante (nome, cnpj, telefone, endereco, email)
VALUES
    ('Cantina Bella Napoli',
     '12.345.678/0001-90',
     '(62) 99123-4567',
     'Rua das Flores, 123 – Setor Bueno, Goiânia/GO',
     'contato@bellanapoli.com.br'),
 
    ('Burger House Gourmet',
     '98.765.432/0001-10',
     '(62) 98765-4321',
     'Av. Jamel Cecílio, 456 – Jardim Goiás, Goiânia/GO',
     'contato@burgerhousegourmet.com.br');
 

INSERT INTO mesa (id_restaurante, numero, capacidade, status, localizacao)
VALUES
    (1, 1, 4,  'livre',  'Salão Principal'),
    (1, 2, 6,  'livre',  'Salão Principal'),
    (1, 3, 2,  'livre',  'Varanda'),
    (1, 4, 8,  'livre',  'Área VIP'),
    (2, 1, 4,  'livre',  'Térreo'),
    (2, 2, 4,  'livre',  'Térreo'),
    (2, 3, 6,  'livre',  'Mezanino');
 


INSERT INTO categoria (id_restaurante, nome, descricao, icone, ordem)
VALUES
    (1, 'Entradas',   'Petiscos e entradas',          'utensils',    1),
    (1, 'Massas',     'Massas artesanais italianas',  'bowl-food',   2),
    (1, 'Pizzas',     'Pizzas assadas em forno a lenha','pizza',     3),
    (1, 'Bebidas',    'Bebidas alcoólicas e não alcoólicas','glass-water', 4),
    (1, 'Sobremesas', 'Doces e sobremesas',            'cake',        5),
    (2, 'Burgers',    'Hambúrgueres artesanais',       'burger',      1),
    (2, 'Acompanhamentos','Fritas, onion rings e mais','french-fries',2),
    (2, 'Bebidas',    'Refrigerantes, sucos e shakes', 'glass-water', 3);
 

INSERT INTO produto (id_categoria, nome, descricao, preco, ativo, tempo_preparo, destaque)
VALUES
    -- Cantina Bella Napoli
    (1, 'Bruschetta Clássica',
        'Pão tostado com tomate, manjericão e azeite extravirgem',
        28.90, TRUE, 10, FALSE),
 
    (2, 'Tagliatelle ao Ragù',
        'Massa fresca com molho de carne desfiada e tomate San Marzano',
        62.90, TRUE, 25, TRUE),
 
    (2, 'Spaghetti Carbonara',
        'Massa com guanciale, pecorino, ovo e pimenta-do-reino',
        58.90, TRUE, 20, TRUE),
 
    (3, 'Pizza Margherita',
        'Molho de tomate, mussarela de búfala e manjericão fresco',
        55.90, TRUE, 30, FALSE),
 
    (4, 'Água Mineral 500ml', 'Água mineral sem gás', 6.00, TRUE, 1, FALSE),
 
    (5, 'Tiramisù',
        'Clássica sobremesa italiana com mascarpone e café',
        32.90, TRUE, 5, TRUE),
 
    -- Burger House Gourmet
    (6, 'Classic Smash Burger',
        'Blend 150g, queijo cheddar, alface, tomate e molho especial',
        32.90, TRUE, 15, TRUE),
 
    (6, 'BBQ Bacon Burger',
        'Blend 200g, queijo, bacon crocante, cebola caramelizada e molho BBQ',
        44.90, TRUE, 18, TRUE),
 
    (7, 'Batata Frita Rústica', 'Batata palito com casca e tempero especial', 18.90, TRUE, 12, FALSE),
 
    (8, 'Coca-Cola Lata 350ml', 'Refrigerante gelado', 8.00, TRUE, 1, FALSE);
 


INSERT INTO ingrediente (id_restaurante, nome, unidade_medida)
VALUES
    (1, 'Farinha de Trigo',     'kg'),
    (1, 'Tomate San Marzano',   'kg'),
    (1, 'Mussarela de Búfala',  'kg'),
    (1, 'Azeite Extravirgem',   'L'),
    (1, 'Pão de Forma',         'un'),
    (1, 'Manjericão Fresco',    'g'),
    (1, 'Carne Bovina Moída',   'kg'),
    (1, 'Ovo',                  'un'),
    (1, 'Pecorino Romano',      'kg'),
    (1, 'Guanciale',            'kg'),
    (1, 'Mascarpone',           'kg'),
    (1, 'Café Espresso',        'ml'),
 
    (2, 'Pão Brioche',          'un'),
    (2, 'Blend Bovino 80/20',   'kg'),
    (2, 'Queijo Cheddar',       'kg'),
    (2, 'Alface Americana',     'kg'),
    (2, 'Tomate',               'kg'),
    (2, 'Bacon Fatiado',        'kg'),
    (2, 'Batata Palito',        'kg');
 
 

-- Fichas Técnicas e Itens

 
-- Bruschetta Clássica (id_produto = 1)
INSERT INTO ficha_tecnica (id_produto, rendimento, unidade_rendimento, modo_preparo)
VALUES (1, 1, 'porcao',
        'Tostar o pão, cobrir com tomate picado, temperar com sal, azeite e manjericão.');
 
INSERT INTO ficha_tecnica_item (id_ficha, id_ingrediente, quantidade)
VALUES
    (1, 5, 2),     -- 2 fatias de Pão de Forma
    (1, 2, 0.08),  -- 80g de Tomate San Marzano
    (1, 4, 0.02),  -- 20ml de Azeite
    (1, 6, 3);     -- 3g de Manjericão
 
-- Spaghetti Carbonara (id_produto = 3)
INSERT INTO ficha_tecnica (id_produto, rendimento, unidade_rendimento, modo_preparo)
VALUES (3, 1, 'porcao',
        'Cozinhar a massa al dente, refogar o guanciale e misturar com ovos, pecorino e pimenta.');
 
INSERT INTO ficha_tecnica_item (id_ficha, id_ingrediente, quantidade)
VALUES
    (2, 1, 0.120),  -- 120g Farinha de Trigo (massa fresca)
    (2, 10, 0.060), -- 60g Guanciale
    (2, 8, 2),      -- 2 Ovos
    (2, 9, 0.040);  -- 40g Pecorino Romano
 
-- Classic Smash Burger (id_produto = 7)
INSERT INTO ficha_tecnica (id_produto, rendimento, unidade_rendimento, modo_preparo)
VALUES (7, 1, 'porcao',
        'Espalmar o blend na chapa quente, dourar os dois lados, montar o burger com os acompanhamentos.');
 
INSERT INTO ficha_tecnica_item (id_ficha, id_ingrediente, quantidade)
VALUES
    (3, 14, 1),     -- 1 Pão Brioche
    (3, 15, 0.150), -- 150g Blend Bovino
    (3, 16, 0.040), -- 40g Queijo Cheddar
    (3, 17, 0.020), -- 20g Alface
    (3, 18, 0.030); -- 30g Tomate
 
 

-- Estoque inicial (Cantina Bella Napoli)

INSERT INTO estoque (id_ingrediente, id_restaurante, quantidade_atual, quantidade_minima, unidade_medida, custo_unitario)
VALUES
    (1,  1, 25.000, 5.000,  'kg',   4.50),   -- Farinha de Trigo
    (2,  1,  8.000, 2.000,  'kg',  12.00),   -- Tomate San Marzano
    (3,  1,  3.000, 1.000,  'kg',  38.00),   -- Mussarela de Búfala
    (4,  1,  5.000, 1.000,  'L',   28.00),   -- Azeite Extravirgem
    (5,  1, 30.000, 10.000, 'un',   0.80),   -- Pão de Forma
    (6,  1,200.000, 50.000, 'g',    0.05),   -- Manjericão
    (7,  1, 10.000, 3.000,  'kg',  22.00),   -- Carne Bovina
    (8,  1, 24.000, 12.000, 'un',   0.90),   -- Ovo
    (9,  1,  2.000, 0.500,  'kg',  65.00),   -- Pecorino
    (10, 1,  1.500, 0.500,  'kg',  55.00),   -- Guanciale
    (11, 1,  4.000, 1.000,  'kg',  42.00),   -- Mascarpone
    (12, 1,500.000,100.000, 'ml',   0.08);   -- Café Espresso
 
-- Estoque Burger House
INSERT INTO estoque (id_ingrediente, id_restaurante, quantidade_atual, quantidade_minima, unidade_medida, custo_unitario)
VALUES
    (13, 2,  50.000, 20.000, 'un',   1.50),  -- Pão Brioche
    (14, 2,  15.000,  5.000, 'kg',  24.00),  -- Blend Bovino
    (15, 2,   5.000,  1.500, 'kg',  35.00),  -- Queijo Cheddar
    (16, 2,   8.000,  2.000, 'kg',   6.00),  -- Alface
    (17, 2,  10.000,  3.000, 'kg',   5.50),  -- Tomate
    (18, 2,   6.000,  2.000, 'kg',  28.00),  -- Bacon
    (19, 2,  30.000, 10.000, 'kg',   4.00);  -- Batata Palito
 
 

-- Status de pedido

INSERT INTO status_pedido (nome, descricao, cor, ordem)
VALUES
    ('aguardando',  'Pedido recebido, aguardando confirmação da cozinha', '#FFA500', 1),
    ('confirmado',  'Pedido confirmado pela cozinha',                     '#2196F3', 2),
    ('em_preparo',  'Pedido em preparação',                               '#9C27B0', 3),
    ('pronto',      'Pedido pronto para ser entregue',                    '#4CAF50', 4),
    ('entregue',    'Pedido entregue ao cliente na mesa',                 '#607D8B', 5),
    ('fechado',     'Pedido encerrado e pago',                            '#000000', 6),
    ('cancelado',   'Pedido cancelado',                                   '#F44336', 7);
 
 

-- Formas de pagamento

INSERT INTO forma_pagamento (nome, descricao, taxa, ativo)
VALUES
    ('Dinheiro',        'Pagamento em espécie',               0.0000, TRUE),
    ('Pix',             'Pagamento via Pix instantâneo',      0.0000, TRUE),
    ('Crédito Visa',    'Cartão de crédito Visa',             0.0299, TRUE),
    ('Crédito Master',  'Cartão de crédito Mastercard',       0.0299, TRUE),
    ('Débito',          'Cartão de débito',                   0.0150, TRUE),
    ('Vale Refeição',   'VR, Alelo, Sodexo e similares',      0.0500, TRUE);
 
 

-- Pedido completo de exemplo — Mesa 1, Cantina Bella Napoli

 
-- Pedido (numero_pedido será gerado pelo trigger)
INSERT INTO pedido (id_mesa, id_status, numero_pedido, observacoes)
VALUES (1, 1, '', 'Mesa aniversário — parabéns ao cliente!');
 
-- Itens do pedido
INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario, observacao)
VALUES
    (1, 1, 2, 28.90, 'Sem cebola'),          -- 2x Bruschetta
    (1, 3, 2, 58.90, NULL),                   -- 2x Carbonara
    (1, 5, 4,  6.00, NULL),                   -- 4x Água Mineral
    (1, 6, 2, 32.90, NULL);                   -- 2x Tiramisù
 
-- Avança status para "confirmado"
UPDATE pedido SET id_status = 2 WHERE id_pedido = 1;
 
-- Avança para "em_preparo"
UPDATE pedido SET id_status = 3 WHERE id_pedido = 1;
 
-- Avança para "pronto"
UPDATE pedido SET id_status = 4 WHERE id_pedido = 1;
 
-- Avança para "entregue"
UPDATE pedido SET id_status = 5 WHERE id_pedido = 1;
 
-- Fecha o pedido gerando a venda
INSERT INTO venda (id_pedido, valor_total, desconto, numero_nota)
VALUES (1,
        (SELECT valor_total FROM pedido WHERE id_pedido = 1),
        10.00,                         -- R$10 de desconto promocional
        'NF-2024-000001');
 
-- Atualiza status para "fechado"
UPDATE pedido SET id_status = 6 WHERE id_pedido = 1;
 
-- Registra pagamentos (exemplo: metade no Pix, metade no crédito)
INSERT INTO pagamento (id_venda, id_forma_pagamento, valor, status)
VALUES
    (1, 2, 161.30, 'aprovado'),   -- Pix
    (1, 3,  60.50, 'aprovado');   -- Crédito Visa
 
 

-- Segundo pedido de exemplo — Mesa 2, Burger House

INSERT INTO pedido (id_mesa, id_status, numero_pedido)
VALUES (5, 1, '');
 
INSERT INTO item_pedido (id_pedido, id_produto, quantidade, preco_unitario)
VALUES
    (2, 7, 2, 32.90),   -- 2x Classic Smash Burger
    (2, 8, 1, 44.90),   -- 1x BBQ Bacon Burger
    (2, 9, 3, 18.90),   -- 3x Batata Frita
    (2,10, 3,  8.00);   -- 3x Coca-Cola
 
UPDATE pedido SET id_status = 2 WHERE id_pedido = 2;
 
INSERT INTO venda (id_pedido, valor_total, desconto, numero_nota)
VALUES (2,
        (SELECT valor_total FROM pedido WHERE id_pedido = 2),
        0.00,
        'NF-2024-000002');
 
UPDATE pedido SET id_status = 6 WHERE id_pedido = 2;
 
INSERT INTO pagamento (id_venda, id_forma_pagamento, valor, status)
VALUES (2, 2, (SELECT valor_final FROM venda WHERE id_venda = 2), 'aprovado');
 