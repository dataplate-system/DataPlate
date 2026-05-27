ALTER TABLE IF EXISTS usuarios
    ADD COLUMN IF NOT EXISTS cpf VARCHAR(14);

DO $$
BEGIN
    IF to_regclass('public.usuarios') IS NOT NULL THEN
        UPDATE usuarios
        SET cpf = lpad(id::text, 11, '0')
        WHERE cpf IS NULL OR btrim(cpf) = '';

        ALTER TABLE usuarios
            ALTER COLUMN cpf SET NOT NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS uk_usuarios_cpf
            ON usuarios (cpf);
    END IF;
END $$;
