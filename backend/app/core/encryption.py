"""Encryption utilities for sensitive data like API keys."""
from __future__ import annotations

from base64 import urlsafe_b64decode, urlsafe_b64encode

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class EncryptionKeyUnavailableError(RuntimeError):
    """Raised when persistent secrets are used without a configured encryption key."""


class EncryptedValueDecodeError(RuntimeError):
    """Raised when a stored encrypted value can no longer be decrypted."""


def _get_encryption_key() -> bytes:
    """Get the configured encryption key from settings."""
    key = settings.encryption_key
    if not key:
        raise EncryptionKeyUnavailableError(
            "QMDH_ENCRYPTION_KEY is required to encrypt or decrypt provider API keys."
        )
    return key.encode() if isinstance(key, str) else key


_fernet: Fernet | None = None


def get_fernet() -> Fernet:
    """Get the Fernet instance for encryption/decryption."""
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_get_encryption_key())
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string and return the encrypted value."""
    if not plaintext:
        return ""
    fernet = get_fernet()
    encrypted = fernet.encrypt(plaintext.encode())
    return encrypted.decode()


def decrypt_value(encrypted: str) -> str:
    """Best-effort decryption for compatibility with legacy call sites."""
    if not encrypted:
        return ""
    try:
        return decrypt_value_or_raise(encrypted)
    except (EncryptionKeyUnavailableError, EncryptedValueDecodeError):
        return ""


def decrypt_value_or_raise(encrypted: str) -> str:
    """Decrypt an encrypted string and raise if the secret cannot be used."""
    if not encrypted:
        return ""
    fernet = get_fernet()
    try:
        decrypted = fernet.decrypt(encrypted.encode())
        return decrypted.decode()
    except InvalidToken:
        if is_encrypted(encrypted):
            raise EncryptedValueDecodeError(
                "Stored provider API key could not be decrypted with the current QMDH_ENCRYPTION_KEY."
            )
        return encrypted


def normalize_provider_api_key(raw: str) -> str:
    """Strip common paste artifacts such as `X-API-KEY:` prefixes from provider secrets."""
    value = (raw or "").strip()
    if not value:
        return ""

    lowered = value.lower()
    for prefix in (
        "x-api-key:",
        "api-key:",
        "apikey:",
        "authorization: bearer ",
        "bearer ",
    ):
        if lowered.startswith(prefix):
            return value[len(prefix) :].strip()
    return value


def is_encrypted(value: str) -> bool:
    """Check if a value appears to be encrypted (Fernet tokens have specific format)."""
    if not value:
        return False
    # Fernet tokens start with specific bytes when base64 encoded
    try:
        decoded = urlsafe_b64decode(value[:44] + "=" * (4 - len(value[:44]) % 4))
        return len(decoded) >= 32
    except Exception:
        return False
