from __future__ import annotations

import mimetypes
from datetime import datetime
from random import randint
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from app.core.config import ImageProviderProfile, settings
from app.services.media_storage import is_legacy_absolute_path, media_url_for, write_binary_asset


def resolve_public_media_url(path: str) -> str:
    normalized = str(path or "").strip()
    if not normalized:
        return ""
    if normalized.startswith(("http://", "https://")):
        return normalized
    public_base = settings.public_media_base_url.strip().rstrip("/")
    if normalized.startswith("/"):
        base = public_base or settings.frontend_origin.strip().rstrip("/")
        return f"{base}{normalized}"
    if is_legacy_absolute_path(normalized):
        return normalized
    relative_url = media_url_for(normalized)
    if relative_url.startswith("/"):
        base = public_base or settings.frontend_origin.strip().rstrip("/")
        return f"{base}{relative_url}"
    return relative_url


def video_prompt(payload: dict) -> str:
    parts = [
        str(payload.get("prompt") or "").strip(),
        str(payload.get("motion_prompt") or "").strip(),
        str(payload.get("storyboard") or "").strip(),
        str(payload.get("prompt_supplement") or "").strip(),
    ]
    return "\n\n".join(part for part in parts if part)


def calculate_video_billing(*, profile: ImageProviderProfile, output_count: int) -> dict:
    unit_price = round(float(profile.unit_price or 0.0), 6)
    pricing_unit = (profile.pricing_unit or "per_video").strip() or "per_video"
    currency = (profile.pricing_currency or "CNY").strip().upper() or "CNY"
    if pricing_unit not in {"per_video", "per_request"}:
        pricing_unit = "per_video"
    billable_units = output_count if pricing_unit == "per_video" else 1
    cost = round(unit_price * billable_units, 4)
    return {
        "cost": cost,
        "currency": currency,
        "pricing_unit": pricing_unit,
        "unit_price": unit_price,
        "billable_units": billable_units,
        "source": "provider_profile",
    }


def persist_generated_video(
    *,
    provider_name: str,
    video_url: str,
    prompt: str,
    timeout_seconds: float,
    output_format: str,
) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_stub = "".join(char if char.isalnum() else "-" for char in prompt.lower())[:40].strip("-") or "video"
    video_bytes, content_type = download_generated_video(video_url, timeout_seconds=timeout_seconds)
    extension = extension_for_downloaded_video(video_url, content_type, output_format)
    relative_path = f"generated/{provider_name}/{timestamp}-{safe_stub}-{randint(1000, 9999)}.{extension}"
    return write_binary_asset(relative_path, video_bytes)


def persist_generated_video_bytes(
    *,
    provider_name: str,
    video_bytes: bytes,
    prompt: str,
    output_format: str,
) -> str:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_stub = "".join(char if char.isalnum() else "-" for char in prompt.lower())[:40].strip("-") or "video"
    extension = (output_format or "mp4").strip().lstrip(".") or "mp4"
    relative_path = f"generated/{provider_name}/{timestamp}-{safe_stub}-{randint(1000, 9999)}.{extension}"
    return write_binary_asset(relative_path, video_bytes)


def download_generated_video(video_url: str, *, timeout_seconds: float) -> tuple[bytes, str]:
    request = Request(video_url, headers={"User-Agent": "QMDH-web/1.0"})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = str(response.headers.get("Content-Type", "")).split(";", 1)[0].strip().lower()
            return response.read(), content_type
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Generated video download failed with HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise ValueError(f"Generated video download request failed: {exc.reason}") from exc


def extension_for_downloaded_video(video_url: str, content_type: str, output_format: str) -> str:
    if content_type:
        guessed = mimetypes.guess_extension(content_type)
        if guessed:
            return guessed.lstrip(".").replace("mpeg", "mpg")
    parsed = urlparse(video_url)
    suffix = parsed.path.rsplit(".", 1)[-1].lower() if "." in parsed.path else ""
    if suffix in {"mp4", "webm", "mov", "m4v"}:
        return suffix
    normalized = (output_format or "mp4").strip().lower()
    return normalized if normalized in {"mp4", "webm", "mov", "m4v"} else "mp4"


def extract_video_urls(payload: dict) -> list[str]:
    candidates: list[object] = []
    for source in _walk_dicts(payload):
        for key in ("video_url", "url", "output_url"):
            value = source.get(key)
            if isinstance(value, str) and _looks_like_video_url(value):
                candidates.append(value)
        for key in ("video_urls", "videos", "results", "content"):
            if isinstance(source.get(key), list):
                candidates.extend(source[key])

    normalized: list[str] = []
    for item in candidates:
        if isinstance(item, str) and _looks_like_video_url(item):
            normalized.append(item.strip())
            continue
        if isinstance(item, dict):
            for key in ("video_url", "url", "output_url"):
                value = str(item.get(key) or "").strip()
                if value and _looks_like_video_url(value):
                    normalized.append(value)
                    break
    return list(dict.fromkeys(normalized))


def _walk_dicts(value: object) -> list[dict]:
    found: list[dict] = []
    if isinstance(value, dict):
        found.append(value)
        for child in value.values():
            found.extend(_walk_dicts(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_walk_dicts(child))
    return found


def _looks_like_video_url(value: str) -> bool:
    normalized = str(value or "").strip().lower()
    if not normalized.startswith(("http://", "https://")):
        return False
    parsed = urlparse(normalized)
    return parsed.path.endswith((".mp4", ".webm", ".mov", ".m4v")) or "video" in parsed.path
