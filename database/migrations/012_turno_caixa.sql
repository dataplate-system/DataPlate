-- Controle de caixa por turno: abertura, fechamento e conferencia do dinheiro da gaveta.
-- Idempotente: pode ser executada mais de uma vez.

CREATE TABLE IF NOT EXISTS turno_caixa (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aberto_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    aberto_em TIMESTAMP NOT NULL DEFAULT now(),
    valor_inicial NUMERIC(10, 2) NOT NULL DEFAULT 0,
    fechado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    fechado_em TIMESTAMP,
    valor_contado NUMERIC(10, 2),
    -- Totais recebidos no turno, gravados no fechamento a partir de pedido.pago_em e pedido.forma_pagamento.
    total_pix NUMERIC(10, 2),
    total_debito NUMERIC(10, 2),
    total_credito NUMERIC(10, 2),
    total_dinheiro NUMERIC(10, 2),
    total_outros NUMERIC(10, 2),
    quantidade_vendas INTEGER,
    observacao VARCHAR(255),
    CONSTRAINT chk_turno_caixa_fechamento CHECK (fechado_em IS NULL OR valor_contado IS NOT NULL)
);

-- Somente um turno aberto por vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_turno_caixa_aberto ON turno_caixa ((fechado_em IS NULL)) WHERE fechado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_turno_caixa_abertura ON turno_caixa (aberto_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedido_pago_em ON pedido (pago_em) WHERE pago_em IS NOT NULL;
