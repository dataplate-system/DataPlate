CREATE TABLE IF NOT EXISTS integration_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ifood_token TEXT,
    ifood_restaurant_id VARCHAR(100),
    pix_key TEXT,
    pagseguro_token TEXT,
    google_maps_api_key TEXT,
    marketing_email VARCHAR(254),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS integration_audit (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    field VARCHAR(80) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_integration_audit_provider_changed_at
    ON integration_audit (provider, changed_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti_hash VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON refresh_tokens (user_id);
