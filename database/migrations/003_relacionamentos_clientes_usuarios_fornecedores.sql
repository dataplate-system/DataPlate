BEGIN;

ALTER TABLE pedido
    ADD COLUMN IF NOT EXISTS id_cliente BIGINT;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_pedido_cliente' AND conrelid = 'pedido'::regclass
    ) THEN
        ALTER TABLE pedido
            ADD CONSTRAINT fk_pedido_cliente
            FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE SET NULL;
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_pedido_cliente ON pedido (id_cliente) WHERE id_cliente IS NOT NULL;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS funcionario_id BIGINT;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_usuarios_funcionario' AND conrelid = 'usuarios'::regclass
    ) THEN
        ALTER TABLE usuarios
            ADD CONSTRAINT fk_usuarios_funcionario
            FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_funcionario_id ON usuarios (funcionario_id);

CREATE TABLE IF NOT EXISTS fornecedor_insumos (
    fornecedor_id BIGINT NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
    insumo_id BIGINT NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
    PRIMARY KEY (fornecedor_id, insumo_id)
);
CREATE INDEX IF NOT EXISTS idx_fornecedor_insumos_insumo ON fornecedor_insumos (insumo_id);

COMMIT;
