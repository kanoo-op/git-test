from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postureview:postureview@db:5432/postureview"

    # JWT
    SECRET_KEY: str = "change-me-to-a-random-secret-key-at-least-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Initial Admin
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin1234"
    ADMIN_EMAIL: str = "admin@postureview.local"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost", "http://localhost:8080"]

    # Rate limiting
    LOGIN_RATE_LIMIT: str = "10/minute"
    DEFAULT_RATE_LIMIT: str = "60/minute"

    # Encryption
    ENCRYPTION_KEY: str = "change-me-generate-with-python-c-from-cryptography-fernet-import-Fernet-Fernet-generate-key"

    # Photo
    MAX_PHOTO_SIZE: int = 10 * 1024 * 1024  # 10MB

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
