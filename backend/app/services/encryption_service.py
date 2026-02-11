from cryptography.fernet import Fernet

from ..config import settings

_fernet = None


def get_fernet():
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.ENCRYPTION_KEY.encode())
    return _fernet


def encrypt(value: str | None) -> str | None:
    if not value:
        return value
    return get_fernet().encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not value:
        return value
    return get_fernet().decrypt(value.encode()).decode()


def encrypt_bytes(data: bytes) -> bytes:
    return get_fernet().encrypt(data)


def decrypt_bytes(data: bytes) -> bytes:
    return get_fernet().decrypt(data)
