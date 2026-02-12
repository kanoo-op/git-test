import secrets
import warnings

from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import List

_INSECURE_SECRET_KEY = "change-me-to-a-random-secret-key-at-least-32-chars"
_INSECURE_ADMIN_PASSWORD = "admin1234"
_INSECURE_ENCRYPTION_KEY = "change-me-generate-with-python-c-from-cryptography-fernet-import-Fernet-Fernet-generate-key"


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postureview:postureview@db:5432/postureview"

    # JWT
    SECRET_KEY: str = _INSECURE_SECRET_KEY
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Initial Admin
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = _INSECURE_ADMIN_PASSWORD
    ADMIN_EMAIL: str = "admin@postureview.local"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost", "http://localhost:8080"]

    # Rate limiting
    LOGIN_RATE_LIMIT: str = "10/minute"
    DEFAULT_RATE_LIMIT: str = "60/minute"

    # Encryption
    ENCRYPTION_KEY: str = _INSECURE_ENCRYPTION_KEY

    # Photo
    MAX_PHOTO_SIZE: int = 10 * 1024 * 1024  # 10MB

    model_config = {"env_file": ".env", "extra": "ignore"}

    @model_validator(mode="after")
    def _warn_insecure_defaults(self):
        insecure = []
        if self.SECRET_KEY == _INSECURE_SECRET_KEY:
            insecure.append("SECRET_KEY")
        if self.ADMIN_PASSWORD == _INSECURE_ADMIN_PASSWORD:
            insecure.append("ADMIN_PASSWORD")
        if self.ENCRYPTION_KEY == _INSECURE_ENCRYPTION_KEY:
            insecure.append("ENCRYPTION_KEY")
        if insecure:
            warnings.warn(
                f"SECURITY WARNING: The following settings use insecure defaults "
                f"and MUST be overridden via environment variables or .env file: "
                f"{', '.join(insecure)}. "
                f"Generate a secure ENCRYPTION_KEY with: "
                f"python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"",
                stacklevel=2,
            )
        return self


settings = Settings()
