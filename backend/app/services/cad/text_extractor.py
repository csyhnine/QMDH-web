"""Extract and bucket TEXT / MTEXT labels from CAD drawings."""

from __future__ import annotations

import re

_DIMENSION_RE = re.compile(
    r"^(\d+(\.\d+)?|\d+\s*[x×X]\s*\d+|\d+\s*[x×X]\s*\d+\s*[x×X]\s*\d+)$"
)
_RATIO_RE = re.compile(r"^\d+\s*:\s*\d+$")
_AXIS_RE = re.compile(r"^[A-Za-z]-?[A-Za-z0-9]?$")
_CHINESE_ROOM_RE = re.compile(r"^[\u4e00-\u9fff]{2,12}$")


def _clean_mtext(value: str) -> str:
    text = (value or "").replace("\\P", "\n")
    text = re.sub(r"\{[^;{}]*;([^}]*)\}", r"\1", text)
    text = re.sub(r"\\[A-Za-z][^;\\]*", "", text)
    return " ".join(text.split())


def normalize_label_text(raw: str) -> str:
    return _clean_mtext(raw).strip()


def bucket_text_label(text: str) -> str:
    cleaned = normalize_label_text(text)
    if not cleaned:
        return "misc"
    if _DIMENSION_RE.match(cleaned):
        return "dimensions"
    if _RATIO_RE.match(cleaned):
        return "misc"
    if cleaned.isdigit():
        return "dimensions"
    if "mm" in cleaned.lower() or "m²" in cleaned or "㎡" in cleaned:
        return "dimensions"
    if _AXIS_RE.match(cleaned) and len(cleaned) <= 3:
        return "misc"
    if _CHINESE_ROOM_RE.match(cleaned):
        return "room_labels"
    if re.search(r"[\u4e00-\u9fff]", cleaned) and len(cleaned) <= 20:
        return "room_labels"
    if re.search(r"[A-Za-z]", cleaned) and len(cleaned.split()) <= 6:
        return "room_labels"
    return "misc"


def build_semantics(room_labels: list[str]) -> dict[str, str]:
    unique = []
    seen: set[str] = set()
    for label in room_labels:
        cleaned = normalize_label_text(label)
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        unique.append(cleaned)
    summary_zh = "、".join(unique[:12]) if unique else ""
    if unique:
        prompt_en = (
            "interior architectural rendering of "
            + ", ".join(unique[:8])
            + ", clean modern commercial design, high detail, 8k"
        )
    else:
        prompt_en = ""
    return {
        "space_summary_zh": summary_zh,
        "suggested_prompt_en": prompt_en,
    }
