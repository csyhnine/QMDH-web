"""Build Word documents from chat assistant replies."""
from __future__ import annotations

import io
import re
from datetime import datetime

_HEADING_PATTERN = re.compile(r"^(#{1,3})\s+(.+)$")
_BULLET_PATTERN = re.compile(r"^[-*]\s+(.+)$")
_ORDERED_PATTERN = re.compile(r"^\d+\.\s+(.+)$")


def _safe_export_file_name(value: str, *, fallback: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in {"-", "_", ".", " "} else "-" for char in value.strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .-_")
    if not cleaned:
        cleaned = fallback
    if not cleaned.lower().endswith(".docx"):
        cleaned = f"{cleaned}.docx"
    return cleaned[:120]


def _write_markdownish_lines(document, content: str) -> None:
    lines = content.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        heading_match = _HEADING_PATTERN.match(stripped)
        if heading_match:
            level = len(heading_match.group(1))
            style = "Heading 1" if level == 1 else "Heading 2" if level == 2 else "Heading 3"
            document.add_paragraph(heading_match.group(2).strip(), style=style)
            continue

        bullet_match = _BULLET_PATTERN.match(stripped)
        if bullet_match:
            document.add_paragraph(bullet_match.group(1).strip(), style="List Bullet")
            continue

        ordered_match = _ORDERED_PATTERN.match(stripped)
        if ordered_match:
            document.add_paragraph(ordered_match.group(1).strip(), style="List Number")
            continue

        document.add_paragraph(stripped)


def build_chat_word_document(content: str, *, title: str = "") -> bytes:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("Word export support is not installed on the server.") from exc

    document = Document()
    heading = title.strip() or "Chat 回复"
    document.add_paragraph(heading, style="Title")
    document.add_paragraph(datetime.now().strftime("%Y-%m-%d %H:%M"))
    document.add_paragraph("")
    _write_markdownish_lines(document, content.strip())

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def default_chat_word_file_name(*, conversation_title: str = "", message_id: int | None = None) -> str:
    stub = conversation_title.strip() or "chat-reply"
    if message_id is not None:
        stub = f"{stub}-{message_id}"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return _safe_export_file_name(f"{stub}-{timestamp}", fallback=f"chat-reply-{timestamp}.docx")
