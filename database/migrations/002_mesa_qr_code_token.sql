ALTER TABLE mesa
    ADD COLUMN IF NOT EXISTS qr_code_token UUID;

UPDATE mesa
SET qr_code_token = gen_random_uuid()
WHERE qr_code_token IS NULL;

ALTER TABLE mesa
    ALTER COLUMN qr_code_token SET DEFAULT gen_random_uuid(),
    ALTER COLUMN qr_code_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mesa_qr_code_token ON mesa (qr_code_token);
