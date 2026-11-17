-- Registro da avaliacao do cliente por pedido.
-- Idempotente: pode ser executada mais de uma vez.

CREATE TABLE IF NOT EXISTS pedido_avaliacao (
    id_pedido_avaliacao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pedido BIGINT NOT NULL UNIQUE REFERENCES pedido(id_pedido) ON DELETE CASCADE,
    nota SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario VARCHAR(300),
    avaliado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_avaliacao_data ON pedido_avaliacao (avaliado_em DESC);
