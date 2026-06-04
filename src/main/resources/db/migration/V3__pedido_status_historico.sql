CREATE TABLE IF NOT EXISTS pedido_status_historico (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pedido   BIGINT NOT NULL REFERENCES pedido(id_pedido) ON DELETE CASCADE,
    status      VARCHAR(30) NOT NULL,
    registrado_em TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_psh_pedido ON pedido_status_historico (id_pedido);
