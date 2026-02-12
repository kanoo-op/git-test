import base64

from cryptography.fernet import Fernet, InvalidToken

from ..config import settings

_fernet = None


def get_fernet():
    global _fernet
    if _fernet is None:
        key = settings.ENCRYPTION_KEY.encode()
        try:
            decoded = base64.urlsafe_b64decode(key)
            if len(decoded) != 32:
                raise ValueError(
                    f"ENCRYPTION_KEY must be a valid Fernet key (32 bytes, base64-encoded). "
                    f"Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                )
        except Exception as e:
            raise ValueError(
                f"Invalid ENCRYPTION_KEY format: {e}. "
                f"Generate a valid key with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            ) from e
        _fernet = Fernet(key)
    return _fernet


def encrypt(value: str | None) -> str | None:
    if not value:
        return value
    return get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not value:
        return value
    try:
        return get_fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return "[decryption failed]"


def encrypt_bytes(data: bytes) -> bytes:
    return get_fernet().encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    return get_fernet().decrypt(data)
