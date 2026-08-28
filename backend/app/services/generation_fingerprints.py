"""Fingerprint helpers for generation behavior analytics."""

from __future__ import annotations

import hashlib
import re

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_prompt_text(text: str) -> str:
    cleaned = str(text or "").strip().lower()
    cleaned = _WHITESPACE_RE.sub(" ", cleaned)
    return cleaned


def prompt_fingerprint(text: str) -> str:
    normalized = normalize_prompt_text(text)
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def ref_fingerprint(paths: list[str]) -> str:
    cleaned = sorted({str(path or "").strip() for path in paths if str(path or "").strip()})
    if not cleaned:
        return ""
    payload = "|".join(cleaned)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
