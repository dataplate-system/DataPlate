-- Perfil GERENTE, auditoria do historico de status e token de acesso do pedido.
-- Idempotente: pode ser executada mais de uma vez.

UPDATE usuarios
SET role = 'GERENTE'
WHERE cpf = '00000000001' AND role = 'ADMIN';

ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_usuarios_role;
ALTER TABLE usuarios
    ADD CONSTRAINT chk_usuarios_role
    CHECK (role IN ('ADMIN', 'GERENTE', 'FUNCIONARIO', 'CAIXA', 'COZINHA'));

ALTER TABLE pedido_status_historico
    ADD COLUMN IF NOT EXISTS id_usuario BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_psh_usuario ON pedido_status_historico (id_usuario) WHERE id_usuario IS NOT NULL;

ALTER TABLE pedido
    ADD COLUMN IF NOT EXISTS token_acesso UUID;

UPDATE pedido
SET token_acesso = gen_random_uuid()
WHERE token_acesso IS NULL;

ALTER TABLE pedido
    ALTER COLUMN token_acesso SET DEFAULT gen_random_uuid(),
    ALTER COLUMN token_acesso SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_token_acesso ON pedido (token_acesso);
