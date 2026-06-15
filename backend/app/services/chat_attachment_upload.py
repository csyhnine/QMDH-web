"""Upload helpers for chat attachments (images and documents)."""
from __future__ import annotations

import re
from base64 import b64decode
from datetime import datetime
from pathlib import Path
from random import randint

from fastapi import HTTPException, status

from app.core.config import settings
from app.services.media_storage import _normalize_relative_path, is_legacy_absolute_path, media_root_path

MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024
MAX_CHAT_FILE_BYTES = 5 * 1024 * 1024
CHAT_ATTACHMENT_PREFIXES = ("references/", "chat-attachments/")
_ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_ALLOWED_DOCUMENT_SUFFIXES = {".pdf", ".txt", ".md", ".json", ".csv", ".docx", ".xlsx"}

_IMAGE_DATA_URL_PATTERN = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,(.+)$", re.IGNORECASE)
_FILE_DATA_URL_PATTERN = re.compile(
    r"^data:(?:application/pdf|text/plain|text/markdown|application/json|text/csv|"
    r"application/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|"
    r"application/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|"
    r"application/octet-stream);base64,(.+)$",
    re.IGNORECASE,
)

_IMAGE_EXTENSIONS = {
    "png": "png",
    "jpeg": "jpeg",
    "jpg": "jpeg",
    "webp": "webp",
    "gif": "gif",
}
_FILE_EXTENSIONS = {".pdf", ".txt", ".md", ".json", ".csv", ".docx", ".xlsx"}


def _safe_stub(file_name: str, fallback: str) -> str:
    return "".join(char if char.isalnum() else "-" for char in file_name.lower()).strip("-") or fallback


def decode_chat_image_upload(file_name: str, data_url: str) -> tuple[str, bytes]:
    matched = _IMAGE_DATA_URL_PATTERN.match(data_url.strip())
    if not matched:
        raise HTTPException(status_code=400, detail="Chat image must be a base64 image data URL.")

    extension = _IMAGE_EXTENSIONS.get(matched.group(1).lower(), "")
    if not extension:
        extension = _extension_for_name(file_name, image=True)

    try:
        content = b64decode(matched.group(2), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Chat image payload is invalid.") from exc

    if len(content) > MAX_CHAT_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Chat image must be 10MB or smaller.",
        )
    return extension, content


def decode_chat_file_upload(file_name: str, data_url: str) -> tuple[str, bytes]:
    normalized_name = file_name.lower().strip()
    suffix = f".{normalized_name.rsplit('.', 1)[-1]}" if "." in normalized_name else ""
    if suffix not in _FILE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported chat document type.")

    matched = _FILE_DATA_URL_PATTERN.match(data_url.strip())
    if not matched:
        raise HTTPException(status_code=400, detail="Chat document must be a base64 data URL.")

    try:
        content = b64decode(matched.group(1), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Chat document payload is invalid.") from exc

    if len(content) > MAX_CHAT_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Chat document must be 5MB or smaller.",
        )
    return suffix.lstrip("."), content


def _extension_for_name(file_name: str, *, image: bool) -> str:
    normalized_name = file_name.lower().strip()
    if "." in normalized_name:
        suffix = normalized_name.rsplit(".", 1)[-1]
        if image and suffix in _IMAGE_EXTENSIONS:
            return _IMAGE_EXTENSIONS[suffix]
        if not image and f".{suffix}" in _FILE_EXTENSIONS:
            return suffix
    raise HTTPException(status_code=400, detail="Unsupported chat attachment file name.")


def build_chat_image_relative_path(file_name: str, extension: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_stub = _safe_stub(file_name, "chat-image")
    return f"references/{timestamp}-{safe_stub[:40]}-{randint(1000, 9999)}.{extension}"


def build_chat_file_relative_path(file_name: str, extension: str) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_stub = _safe_stub(file_name, "chat-file")
    return f"chat-attachments/{timestamp}-{safe_stub[:40]}-{randint(1000, 9999)}.{extension}"


def normalize_chat_attachment_storage_path(path: str) -> str:
    value = str(path or "").strip().replace("\\", "/")
    prefix = settings.media_url_prefix.rstrip("/")
    if value.startswith(prefix + "/"):
        value = value[len(prefix) + 1 :]
    normalized = _normalize_relative_path(value)
    if not normalized.startswith(CHAT_ATTACHMENT_PREFIXES):
        raise HTTPException(status_code=400, detail="Chat attachments must use uploaded chat files.")
    if ".." in normalized.split("/"):
        raise HTTPException(status_code=400, detail="Invalid chat attachment path.")
    return normalized


def read_chat_attachment_bytes(storage_path: str, *, allow_documents: bool = False) -> bytes:
    normalized = normalize_chat_attachment_storage_path(storage_path)
    if is_legacy_absolute_path(normalized):
        raise HTTPException(status_code=400, detail="Unsupported chat attachment path.")
    suffix = Path(normalized).suffix.lower()
    allowed_suffixes = set(_ALLOWED_IMAGE_SUFFIXES)
    if allow_documents:
        allowed_suffixes |= _ALLOWED_DOCUMENT_SUFFIXES
    if suffix not in allowed_suffixes:
        raise HTTPException(status_code=400, detail="Unsupported chat attachment type.")

    target = media_root_path() / Path(normalized)
    if not target.is_file():
        raise HTTPException(status_code=400, detail="Chat attachment file was not found.")
    return target.read_bytes()
