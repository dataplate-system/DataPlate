-- Item esgotado no cardapio: o atendente marca o produto como indisponivel
-- e o cliente, o PDV e o atendente deixam de conseguir pedi-lo.
-- Idempotente para permitir reaplicacao durante a inicializacao local.

ALTER TABLE produto ADD COLUMN IF NOT EXISTS esgotado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE produto ADD COLUMN IF NOT EXISTS esgotado_motivo VARCHAR(120);
ALTER TABLE produto ADD COLUMN IF NOT EXISTS esgotado_em TIMESTAMP;
ALTER TABLE produto ADD COLUMN IF NOT EXISTS esgotado_por BIGINT REFERENCES usuarios(id) ON DELETE SET NULL;
