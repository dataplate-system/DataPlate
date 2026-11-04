-- Separa o pagamento do status do pedido e registra as movimentacoes de estoque.
-- Idempotente: pode ser executada mais de uma vez.

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS pago_em TIMESTAMP;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(30);

-- Pedidos antigos: ENTREGUE exige pagamento; balcao pago fica marcado nas observacoes.
-- O marcador so vale sem mesa, pois o cliente do QR Code pode escrever nas observacoes.
UPDATE pedido
SET pago_em = atualizado_em,
    forma_pagamento = UPPER(substring(observacoes from '(?i)(?:Pagamento:|Venda no caixa - pagamento:)\s*(PIX|DEBITO|CREDITO|DINHEIRO)'))
WHERE pago_em IS NULL
  AND id_status <> 5
  AND (
    id_status = 4
    OR (id_mesa IS NULL AND observacoes ~* '(?:Pagamento:|Venda no caixa - pagamento:)\s*(PIX|DEBITO|CREDITO|DINHEIRO)')
  );

CREATE TABLE IF NOT EXISTS estoque_movimento (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    id_pedido BIGINT REFERENCES pedido(id_pedido) ON DELETE SET NULL,
    tipo VARCHAR(20) NOT NULL,
    -- Negativo: saida do estoque. Positivo: entrada.
    quantidade NUMERIC(12, 3) NOT NULL,
    saldo_apos NUMERIC(12, 3) NOT NULL,
    id_usuario BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    motivo VARCHAR(255),
    criado_em TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT chk_estoque_movimento_tipo CHECK (tipo IN ('BAIXA_PEDIDO', 'AJUSTE_PEDIDO', 'AJUSTE_MANUAL'))
);

CREATE INDEX IF NOT EXISTS idx_estoque_movimento_data ON estoque_movimento (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_movimento_pedido ON estoque_movimento (id_pedido) WHERE id_pedido IS NOT NULL;
