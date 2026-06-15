"""Normalize Studio image aspect ratios to upstream provider whitelists."""
from __future__ import annotations

import struct
from pathlib import Path

from app.core.config import settings
from app.services.media_storage import media_root_path

SMART_RATIO_LABELS = frozenset({"智能", "auto", "automatic", "smart"})

GEMINI_IMAGE_ASPECT_RATIOS: tuple[str, ...] = (
    "1:1",
    "1:4",
    "1:8",
    "2:3",
    "3:2",
    "3:4",
    "4:1",
    "4:3",
    "4:5",
    "5:4",
    "8:1",
    "9:16",
    "16:9",
    "21:9",
)

GPT_IMAGE_ASPECT_RATIOS: tuple[str, ...] = (
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
)


def _ratio_value(ratio: str) -> float:
    width_text, height_text = ratio.split(":", 1)
    width = float(width_text.strip())
    height = float(height_text.strip())
    if width <= 0 or height <= 0:
        raise ValueError("invalid ratio")
    return width / height


def nearest_aspect_ratio(target: float, allowed: tuple[str, ...]) -> str:
    return min(allowed, key=lambda ratio: abs(_ratio_value(ratio) - target))


def allowed_image_aspect_ratios(*, provider_name: str, model_name: str, base_url: str = "") -> tuple[str, ...]:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    if "gemini" in identity or "banana" in identity:
        return GEMINI_IMAGE_ASPECT_RATIOS
    return GPT_IMAGE_ASPECT_RATIOS


def _png_dimensions(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) < 24:
        return None
    width, height = struct.unpack(">II", data[16:24])
    if width <= 0 or height <= 0:
        return None
    return int(width), int(height)


def _jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\xff\xd8"):
        return None

    idx = 2
    while idx + 3 < len(data):
        if data[idx] != 0xFF:
            idx += 1
            continue
        marker = data[idx + 1]
        idx += 2
        if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
            if idx + 7 > len(data):
                return None
            height, width = struct.unpack(">HH", data[idx + 3 : idx + 7])
            if width <= 0 or height <= 0:
                return None
            return int(width), int(height)
        if marker in {0xD0, 0xD1, 0xD8, 0x01}:
            continue
        if idx + 2 > len(data):
            break
        segment_length = struct.unpack(">H", data[idx : idx + 2])[0]
        if segment_length < 2:
            break
        idx += segment_length
    return None


def read_image_dimensions(data: bytes) -> tuple[int, int] | None:
    return _png_dimensions(data) or _jpeg_dimensions(data)


def _reference_image_local_path(reference_image: str) -> Path | None:
    normalized = reference_image.strip()
    if not normalized or normalized.startswith(("http://", "https://", "data:image/")):
        return None

    media_prefix = settings.media_url_prefix.rstrip("/")
    if normalized.startswith(f"{media_prefix}/"):
        relative_path = normalized.removeprefix(f"{media_prefix}/")
    else:
        relative_path = normalized.lstrip("/")

    media_root = media_root_path().resolve()
    file_path = (media_root / Path(relative_path)).resolve()
    if media_root not in file_path.parents and file_path != media_root:
        return None
    if not file_path.exists() or not file_path.is_file():
        return None
    return file_path


def dimensions_from_reference_images(reference_images: list[str]) -> tuple[int, int] | None:
    for reference_image in reference_images:
        file_path = _reference_image_local_path(reference_image)
        if file_path is None:
            continue
        dimensions = read_image_dimensions(file_path.read_bytes())
        if dimensions is not None:
            return dimensions
    return None


def resolve_image_aspect_ratio(
    raw_value: str,
    *,
    provider_name: str,
    model_name: str,
    base_url: str = "",
    reference_images: list[str] | None = None,
    default: str = "1:1",
) -> str:
    allowed = allowed_image_aspect_ratios(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    )
    value = str(raw_value or "").strip()
    fallback = default if default in allowed else allowed[0]

    if value in allowed:
        return value

    smart_mode = not value or value in SMART_RATIO_LABELS
    if smart_mode:
        dimensions = dimensions_from_reference_images(reference_images or [])
        if dimensions is not None:
            width, height = dimensions
            return nearest_aspect_ratio(width / height, allowed)
        return fallback

    if ":" in value:
        try:
            return nearest_aspect_ratio(_ratio_value(value), allowed)
        except ValueError:
            return fallback

    return fallback
