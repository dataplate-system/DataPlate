-- Chamados de servico feitos pelo cliente pelo QR Code da mesa.
-- Idempotente para permitir reaplicacao durante a inicializacao local.

CREATE TABLE IF NOT EXISTS chamado_mesa (
    id_chamado_mesa BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_mesa BIGINT NOT NULL REFERENCES mesa(id_mesa) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('ATENDENTE', 'CONTA', 'AGUA')),
    criado_em TIMESTAMP NOT NULL DEFAULT now(),
    atendido_em TIMESTAMP,
    atendido_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chamado_mesa_aberto_tipo
    ON chamado_mesa (id_mesa, tipo)
    WHERE atendido_em IS NULL;

CREATE INDEX IF NOT EXISTS idx_chamado_mesa_fila
    ON chamado_mesa (criado_em)
    WHERE atendido_em IS NULL;
