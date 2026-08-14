"""Normalize Studio image aspect ratios to upstream provider whitelists."""
from __future__ import annotations

import struct
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.services.media_storage import encode_public_http_url, read_binary_asset

SMART_RATIO_LABELS = frozenset({"智能", "auto", "automatic", "smart"})
SOURCE_ASPECT_RATIO_LABELS = frozenset(
    {
        "遵循原图",
        "遵循原图比例",
        "原图比例",
        "原图",
        "source",
        "match_source",
        "follow_source",
    }
)

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

_OPENAI_PIXEL_SIZE_BY_RATIO: dict[str, str] = {
    "1:1": "1024x1024",
    "16:9": "1536x1024",
    "4:3": "1536x1024",
    "3:2": "1536x1024",
    "2:3": "1024x1536",
    "9:16": "1024x1536",
}

_MAX_REFERENCE_PROBE_BYTES = 512 * 1024
_REFERENCE_FETCH_UA = (
    "Mozilla/5.0 (compatible; QMDH/1.0; +https://cityusbdisk.cn) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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


def openai_pixel_size_for_aspect_ratio(aspect_ratio: str) -> str:
    """DeepKey count sync SKUs require WIDTHxHEIGHT pixels (handbook §6)."""
    return _OPENAI_PIXEL_SIZE_BY_RATIO.get(aspect_ratio, "1024x1024")


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


def _fetch_reference_image_prefix(url: str) -> bytes | None:
    normalized = str(url or "").strip()
    if not normalized.startswith(("http://", "https://")):
        return None
    safe_url = encode_public_http_url(normalized)
    request = Request(
        safe_url,
        headers={"User-Agent": _REFERENCE_FETCH_UA},
        method="GET",
    )
    try:
        with urlopen(request, timeout=20) as response:
            return response.read(_MAX_REFERENCE_PROBE_BYTES)
    except (HTTPError, URLError, TimeoutError, ValueError, OSError):
        return None


def _reference_image_bytes(reference_image: str) -> bytes | None:
    normalized = reference_image.strip()
    if not normalized or normalized.startswith("data:image/"):
        return None
    if normalized.startswith(("http://", "https://")):
        return _fetch_reference_image_prefix(normalized)
    try:
        return read_binary_asset(normalized)
    except (FileNotFoundError, ValueError):
        return None


def dimensions_from_reference_images(reference_images: list[str]) -> tuple[int, int] | None:
    for reference_image in reference_images:
        image_bytes = _reference_image_bytes(reference_image)
        if image_bytes is None:
            continue
        dimensions = read_image_dimensions(image_bytes)
        if dimensions is not None:
            return dimensions
    return None


def _is_smart_ratio(value: str) -> bool:
    normalized = str(value or "").strip()
    return normalized in SMART_RATIO_LABELS


def _is_follow_source_ratio(value: str) -> bool:
    normalized = str(value or "").strip()
    return normalized in SOURCE_ASPECT_RATIO_LABELS


def is_follow_source_aspect_ratio(value: str) -> bool:
    return _is_follow_source_ratio(value)


def is_smart_aspect_ratio(value: str) -> bool:
    return _is_smart_ratio(value)


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

    if _is_follow_source_ratio(value):
        # Native-follow providers (Gemini chat, VIP+image_urls) omit size/aspect upstream.
        # Count sync infers pixels via resolve_size_aspect_for_reference instead.
        return fallback

    if _is_smart_ratio(value):
        # Smart match: model/platform picks ratio; do not lock to reference dimensions.
        return fallback

    if not value:
        return fallback

    if ":" in value:
        try:
            return nearest_aspect_ratio(_ratio_value(value), allowed)
        except ValueError:
            return fallback

    return fallback


def resolve_size_aspect_for_reference(
    raw_value: str,
    *,
    provider_name: str,
    model_name: str,
    base_url: str = "",
    reference_images: list[str] | None = None,
    follow_source: bool = False,
    default: str = "1:1",
) -> str:
    """Infer aspect ratio from reference dimensions for count sync only.

    VIP/Gemini native-follow paths omit size/aspect upstream instead of calling this.
    """
    refs = reference_images or []
    value = str(raw_value or "").strip()
    if follow_source and refs and (_is_follow_source_ratio(value) or not value):
        dimensions = dimensions_from_reference_images(refs)
        if dimensions is not None:
            width, height = dimensions
            allowed = allowed_image_aspect_ratios(
                provider_name=provider_name,
                model_name=model_name,
                base_url=base_url,
            )
            return nearest_aspect_ratio(width / height, allowed)
    return resolve_image_aspect_ratio(
        raw_value,
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
        reference_images=refs,
        default=default,
    )
