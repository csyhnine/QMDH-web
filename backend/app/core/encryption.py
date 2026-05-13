"""Encryption utilities for sensitive data like API keys."""
from __future__ import annotations

import os
from base64 import urlsafe_b64decode, urlsafe_b64encode

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _get_encryption_key() -> bytes:
    """Get or generate the encryption key from settings."""
    key = settings.encryption_key
    if not key:
        # Generate a new key if not configured (development only)
        key = Fernet.generate_key().decode()
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
    """Decrypt an encrypted string and return the plaintext value."""
    if not encrypted:
        return ""
    fernet = get_fernet()
    try:
        decrypted = fernet.decrypt(encrypted.encode())
        return decrypted.decode()
    except InvalidToken:
        # Return empty string if decryption fails (legacy plaintext or invalid key)
        return ""


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
