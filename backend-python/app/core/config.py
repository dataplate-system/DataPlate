from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "data_plate"
    db_user: str = "postgres"
    db_password: str = "1234"

    jwt_secret: str = "DataPlateJwtSecretKeyForDevelopmentOnlyChangeMe123456789"
    jwt_refresh_secret: str | None = None
    jwt_expiration_ms: int = 86_400_000
    jwt_refresh_expiration_ms: int = 604_800_000

    allowed_origins: str = Field(
        default="http://localhost:5500,http://127.0.0.1:5500,"
        "http://localhost:8081,http://127.0.0.1:8081,http://localhost:5173,http://127.0.0.1:5173"
    )
    port: int = 8081

    model_config = SettingsConfigDict(
        env_file=(ROOT_DIR / ".env", Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def effective_refresh_secret(self) -> str:
        return self.jwt_refresh_secret or self.jwt_secret


@lru_cache
def get_settings() -> Settings:
    return Settings()
