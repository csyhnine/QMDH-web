"""Helpers for chat message text and multimodal attachment payloads."""
from __future__ import annotations

from base64 import b64encode
from pathlib import Path

from fastapi import HTTPException

from app.models import ChatMessage
from app.services.chat_attachment_upload import read_chat_attachment_bytes
from app.services.chat_file_text import extract_attachment_text, format_file_attachment_context
from app.services.media_storage import media_url_for

MAX_CHAT_ATTACHMENTS = 4
_ALLOWED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
_ALLOWED_DOCUMENT_SUFFIXES = {".pdf", ".txt", ".md", ".json", ".csv"}


def normalize_chat_attachment_storage_path(path: str) -> str:
    from app.services.chat_attachment_upload import normalize_chat_attachment_storage_path as _normalize

    return _normalize(path)


def attachment_kind_for_path(storage_path: str, explicit_kind: str = "") -> str:
    kind = explicit_kind.strip().lower()
    if kind in {"image", "file"}:
        return kind
    suffix = Path(storage_path).suffix.lower()
    if suffix in _ALLOWED_IMAGE_SUFFIXES:
        return "image"
    if suffix in _ALLOWED_DOCUMENT_SUFFIXES:
        return "file"
    raise HTTPException(status_code=400, detail="Unsupported chat attachment type.")


def mime_type_for_path(path: str, fallback: str = "application/octet-stream") -> str:
    suffix = Path(path).suffix.lower()
    mapping = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".json": "application/json",
        ".csv": "text/csv",
    }
    return mapping.get(suffix, fallback)


def read_chat_attachment_bytes(storage_path: str, *, allow_documents: bool = False) -> bytes:
    from app.services.chat_attachment_upload import read_chat_attachment_bytes as _read

    return _read(storage_path, allow_documents=allow_documents)


def attachment_to_data_url(storage_path: str, *, mime_type: str = "") -> str:
    normalized = normalize_chat_attachment_storage_path(storage_path)
    content = read_chat_attachment_bytes(normalized)
    resolved_mime = mime_type.strip() or mime_type_for_path(normalized)
    encoded = b64encode(content).decode("ascii")
    return f"data:{resolved_mime};base64,{encoded}"


def serialize_chat_attachments(
    attachments: list[dict[str, str]] | None,
) -> list[dict[str, str]]:
    serialized: list[dict[str, str]] = []
    for item in attachments or []:
        storage_path = normalize_chat_attachment_storage_path(str(item.get("storage_path") or ""))
        file_name = str(item.get("file_name") or Path(storage_path).name).strip()[:255]
        mime_type = str(item.get("mime_type") or mime_type_for_path(storage_path)).strip()[:100]
        kind = attachment_kind_for_path(storage_path, str(item.get("kind") or ""))
        serialized.append(
            {
                "storage_path": storage_path,
                "file_name": file_name,
                "mime_type": mime_type,
                "kind": kind,
            }
        )
    return serialized[:MAX_CHAT_ATTACHMENTS]


def chat_attachment_out(item: dict[str, str]) -> dict[str, str]:
    storage_path = str(item.get("storage_path") or "").strip()
    return {
        "file_name": str(item.get("file_name") or Path(storage_path).name).strip(),
        "mime_type": str(item.get("mime_type") or mime_type_for_path(storage_path)).strip(),
        "url": media_url_for(storage_path),
        "storage_path": storage_path,
        "kind": attachment_kind_for_path(storage_path, str(item.get("kind") or "")),
    }


def build_provider_message_content(message: ChatMessage) -> str | list[dict[str, object]]:
    attachments = [item for item in (message.attachments_json or []) if isinstance(item, dict)]
    text = str(message.content or "").strip()

    if not attachments:
        return text

    image_items: list[dict[str, str]] = []
    file_sections: list[str] = []
    for item in attachments:
        storage_path = str(item.get("storage_path") or "").strip()
        if not storage_path:
            continue
        file_name = str(item.get("file_name") or Path(storage_path).name).strip()
        kind = attachment_kind_for_path(storage_path, str(item.get("kind") or ""))
        if kind == "image":
            image_items.append(item)
            continue
        extracted = extract_attachment_text(storage_path, file_name=file_name)
        file_sections.append(format_file_attachment_context(file_name, extracted))

    combined_text = text
    if file_sections:
        files_block = "\n\n---\n".join(file_sections)
        combined_text = f"{text}\n\n---\n{files_block}".strip() if text else files_block

    if not image_items:
        return combined_text

    parts: list[dict[str, object]] = []
    if combined_text:
        parts.append({"type": "text", "text": combined_text})

    for item in image_items:
        storage_path = str(item.get("storage_path") or "").strip()
        mime_type = str(item.get("mime_type") or mime_type_for_path(storage_path)).strip()
        parts.append(
            {
                "type": "image_url",
                "image_url": {"url": attachment_to_data_url(storage_path, mime_type=mime_type)},
            }
        )

    if len(parts) == 1 and parts[0].get("type") == "text":
        return str(parts[0]["text"])
    return parts


def build_provider_messages(messages: list[ChatMessage]) -> list[dict[str, object]]:
    return [
        {
            "role": message.role,
            "content": build_provider_message_content(message),
        }
        for message in messages
    ]
