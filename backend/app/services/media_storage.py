from __future__ import annotations

import logging
import threading
from base64 import b64decode
from html import escape
from mimetypes import guess_type
from pathlib import Path
from time import sleep
from typing import Any, Protocol
from urllib.parse import urlparse

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageBackend(Protocol):
    def write(self, relative_path: str, data: bytes, *, overwrite: bool = True) -> str:
        ...

    def read(self, relative_path: str) -> bytes:
        ...

    def exists(self, relative_path: str) -> bool:
        ...

    def url_for(self, relative_path: str) -> str:
        ...


def _normalize_relative_path(relative_path: str) -> str:
    normalized = str(relative_path).replace("\\", "/").strip()
    return normalized.lstrip("/")


def is_legacy_absolute_path(path: str) -> bool:
    value = str(path).strip()
    if not value:
        return False
    if value.startswith("/"):
        return True
    parsed = urlparse(value)
    return bool(parsed.scheme and "://" in value)


def coerce_relative_media_path(path: str) -> str:
    """Strip /media prefix from stored paths; reject http(s)/data URLs."""
    normalized = str(path or "").strip().replace("\\", "/")
    if not normalized:
        raise ValueError("Empty media path")
    if normalized.startswith(("http://", "https://", "data:")):
        raise ValueError(f"Not a relative media path: {normalized[:48]}")
    media_prefix = settings.media_url_prefix.rstrip("/")
    if normalized.startswith(media_prefix + "/"):
        normalized = normalized[len(media_prefix) + 1 :]
    return _normalize_relative_path(normalized)


class LocalStorage:
    def __init__(self, root: str, url_prefix: str) -> None:
        self._root = root
        self._url_prefix = url_prefix

    def root_path(self) -> Path:
        root = Path(self._root)
        if not root.is_absolute():
            root = Path.cwd() / root
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _resolved_file(self, relative_path: str) -> Path:
        normalized = _normalize_relative_path(relative_path)
        media_root = self.root_path().resolve()
        target = (media_root / Path(normalized)).resolve()
        if media_root not in target.parents and target != media_root:
            raise ValueError(f"Media path escapes storage root: {normalized}")
        return target

    def write(self, relative_path: str, data: bytes, *, overwrite: bool = True) -> str:
        normalized = _normalize_relative_path(relative_path)
        target = self._resolved_file(normalized)
        target.parent.mkdir(parents=True, exist_ok=True)
        if overwrite or not target.exists():
            target.write_bytes(data)
        return normalized

    def read(self, relative_path: str) -> bytes:
        target = self._resolved_file(relative_path)
        if not target.is_file():
            raise FileNotFoundError(f"Local media not found: {relative_path}")
        return target.read_bytes()

    def exists(self, relative_path: str) -> bool:
        try:
            return self._resolved_file(relative_path).is_file()
        except ValueError:
            return False

    def url_for(self, relative_path: str) -> str:
        if is_legacy_absolute_path(relative_path):
            return str(relative_path)
        normalized = _normalize_relative_path(relative_path)
        return f"{self._url_prefix.rstrip('/')}/{normalized}"


class OSSStorage:
    def __init__(
        self,
        *,
        endpoint: str,
        bucket_name: str,
        access_key_id: str,
        access_key_secret: str,
        cdn_base_url: str = "",
        timeout_seconds: float = 30.0,
        bucket: Any | None = None,
        sleep_func=sleep,
    ) -> None:
        self.endpoint = endpoint.strip()
        self.bucket_name = bucket_name.strip()
        self.access_key_id = access_key_id.strip()
        self.access_key_secret = access_key_secret.strip()
        self.cdn_base_url = cdn_base_url.strip().rstrip("/")
        self.timeout_seconds = float(timeout_seconds)
        self._bucket = bucket
        self._sleep = sleep_func

        missing = [
            name
            for name, value in (
                ("QMDH_OSS_ENDPOINT", self.endpoint),
                ("QMDH_OSS_BUCKET_NAME", self.bucket_name),
                ("QMDH_OSS_ACCESS_KEY_ID", self.access_key_id),
                ("QMDH_OSS_ACCESS_KEY_SECRET", self.access_key_secret),
            )
            if not value
        ]
        if missing:
            raise ValueError(f"Missing OSS configuration: {', '.join(missing)}")

    def _normalized_endpoint(self) -> str:
        if self.endpoint.startswith(("http://", "https://")):
            return self.endpoint.rstrip("/")
        return f"https://{self.endpoint.rstrip('/')}"

    def _build_bucket(self):
        try:
            import oss2
        except ImportError as exc:
            raise RuntimeError("QMDH_STORAGE_BACKEND=oss requires the 'oss2' package to be installed") from exc

        auth = oss2.Auth(self.access_key_id, self.access_key_secret)
        return oss2.Bucket(
            auth,
            self._normalized_endpoint(),
            self.bucket_name,
            connect_timeout=self.timeout_seconds,
        )

    def _get_bucket(self):
        if self._bucket is None:
            self._bucket = self._build_bucket()
        return self._bucket

    def _public_base_url(self) -> str:
        if self.cdn_base_url:
            return self.cdn_base_url

        parsed = urlparse(self._normalized_endpoint())
        host = parsed.netloc
        if not host.startswith(f"{self.bucket_name}."):
            host = f"{self.bucket_name}.{host}"
        base_path = parsed.path.rstrip("/")
        return f"{parsed.scheme}://{host}{base_path}"

    def _is_transient_error(self, exc: Exception) -> bool:
        status = getattr(exc, "status", None)
        if isinstance(status, int):
            if status in {408, 429} or status >= 500:
                return True
            if 400 <= status < 500:
                return False

        return exc.__class__.__name__ in {"RequestError", "ServerError", "OpenApiServerError"}

    def _content_type_for(self, relative_path: str) -> str:
        guessed, _ = guess_type(relative_path)
        return guessed or "application/octet-stream"

    def write(self, relative_path: str, data: bytes, *, overwrite: bool = True) -> str:
        del overwrite  # OSS objects are overwritten by key; callers retain a uniform interface.
        normalized = _normalize_relative_path(relative_path)
        bucket = self._get_bucket()
        headers = {"Content-Type": self._content_type_for(normalized)}
        backoffs = (1, 2, 4)

        for attempt in range(len(backoffs) + 1):
            try:
                bucket.put_object(normalized, data, headers=headers)
                return normalized
            except Exception as exc:
                if attempt >= len(backoffs) or not self._is_transient_error(exc):
                    raise RuntimeError(f"OSS upload failed for {normalized}: {exc}") from exc
                self._sleep(backoffs[attempt])

        raise RuntimeError(f"OSS upload failed for {normalized}")

    def read(self, relative_path: str) -> bytes:
        normalized = _normalize_relative_path(relative_path)
        bucket = self._get_bucket()
        try:
            result = bucket.get_object(normalized)
            return result.read()
        except Exception as exc:
            status = getattr(exc, "status", None)
            if status == 404 or exc.__class__.__name__ == "NoSuchKey":
                raise FileNotFoundError(f"OSS media not found: {normalized}") from exc
            raise RuntimeError(f"OSS download failed for {normalized}: {exc}") from exc

    def exists(self, relative_path: str) -> bool:
        normalized = _normalize_relative_path(relative_path)
        bucket = self._get_bucket()
        try:
            return bool(bucket.object_exists(normalized))
        except Exception as exc:
            raise RuntimeError(f"OSS exists check failed for {normalized}: {exc}") from exc

    def url_for(self, relative_path: str) -> str:
        if is_legacy_absolute_path(relative_path):
            return str(relative_path)
        normalized = _normalize_relative_path(relative_path)
        return f"{self._public_base_url().rstrip('/')}/{normalized}"


def get_storage_backend() -> StorageBackend:
    backend_name = (settings.storage_backend or "local").strip().lower()
    if backend_name == "local":
        return LocalStorage(settings.media_root, settings.media_url_prefix)
    if backend_name == "oss":
        return OSSStorage(
            endpoint=settings.oss_endpoint,
            bucket_name=settings.oss_bucket_name,
            access_key_id=settings.oss_access_key_id,
            access_key_secret=settings.oss_access_key_secret,
            cdn_base_url=settings.cdn_base_url,
            timeout_seconds=settings.oss_connect_timeout_seconds,
        )
    raise ValueError(f"Invalid QMDH_STORAGE_BACKEND value: {settings.storage_backend}")


def get_local_storage() -> LocalStorage:
    return LocalStorage(settings.media_root, settings.media_url_prefix)


def _oss_enabled() -> bool:
    return (settings.storage_backend or "local").strip().lower() == "oss"


def validate_storage_backend_configuration() -> None:
    get_storage_backend()


def media_root_path() -> Path:
    return get_local_storage().root_path()


def media_url_for(relative_path: str) -> str:
    """Browser-facing URL. Prefer same-origin /media for fast page loads."""
    if is_legacy_absolute_path(relative_path):
        return str(relative_path)
    return get_local_storage().url_for(relative_path)


def resolve_storage_path(path: str) -> str:
    return media_url_for(path)


def resolve_storage_payload(payload: Any) -> Any:
    if isinstance(payload, dict):
        resolved: dict[str, Any] = {}
        for key, value in payload.items():
            if key.endswith("storage_path") and isinstance(value, str):
                resolved[key] = resolve_storage_path(value)
            elif key.endswith("storage_paths") and isinstance(value, list):
                resolved[key] = [resolve_storage_path(str(item)) for item in value]
            else:
                resolved[key] = resolve_storage_payload(value)
        return resolved
    if isinstance(payload, list):
        return [resolve_storage_payload(item) for item in payload]
    return payload


def _mirror_to_oss(relative_path: str, content: bytes, *, overwrite: bool) -> None:
    try:
        get_storage_backend().write(relative_path, content, overwrite=overwrite)
    except Exception:
        logger.exception("Background OSS mirror failed for %s", relative_path)


def write_binary_asset(relative_path: str, content: bytes, *, overwrite: bool = True) -> str:
    """Write local first (fast API/UI). When OSS is on, mirror asynchronously."""
    normalized = get_local_storage().write(relative_path, content, overwrite=overwrite)
    if _oss_enabled():
        threading.Thread(
            target=_mirror_to_oss,
            args=(normalized, content),
            kwargs={"overwrite": overwrite},
            daemon=True,
            name=f"oss-mirror:{normalized[:48]}",
        ).start()
    return normalized


def read_binary_asset(relative_path: str) -> bytes:
    """Read media bytes. Prefer local mirror, then active backend (OSS)."""
    normalized = coerce_relative_media_path(relative_path)
    local = get_local_storage()
    if local.exists(normalized):
        return local.read(normalized)

    if _oss_enabled():
        return get_storage_backend().read(normalized)

    raise FileNotFoundError(f"Media not found: {normalized}")


def ensure_public_object_url(path: str) -> str:
    """Absolute URL for upstream providers. Uses OSS when configured; uploads on demand."""
    normalized = str(path or "").strip()
    if not normalized:
        return ""
    if normalized.startswith(("http://", "https://")):
        return normalized

    relative = coerce_relative_media_path(normalized)
    if not _oss_enabled():
        public_base = settings.public_media_base_url.strip().rstrip("/")
        local_url = get_local_storage().url_for(relative)
        if local_url.startswith("/"):
            base = public_base or settings.frontend_origin.strip().rstrip("/")
            return f"{base}{local_url}"
        return local_url

    oss = get_storage_backend()
    if not oss.exists(relative):
        oss.write(relative, read_binary_asset(relative), overwrite=True)
    return oss.url_for(relative)

def write_base64_asset(relative_path: str, data: str, *, overwrite: bool = True) -> str:
    return write_binary_asset(relative_path, b64decode(data), overwrite=overwrite)


def _palette(seed: str) -> tuple[int, int, int]:
    value = 0
    for char in seed:
        value = (value * 33 + ord(char)) % 360
    return value, (value + 34) % 360, (value + 118) % 360


def write_preview_svg(
    relative_path: str,
    *,
    title: str,
    eyebrow: str,
    detail: str,
    accent_seed: str,
    overwrite: bool = False,
) -> str:
    hue_a, hue_b, hue_c = _palette(accent_seed)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-label="{escape(title)}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl({hue_a} 72% 78%)"/>
      <stop offset="52%" stop-color="hsl({hue_b} 58% 52%)"/>
      <stop offset="100%" stop-color="hsl({hue_c} 34% 24%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="18%" cy="18%" r="48%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.72)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)"/>
  <rect width="1600" height="900" fill="url(#glow)"/>
  <g opacity="0.18">
    <circle cx="1360" cy="180" r="180" fill="white"/>
    <circle cx="1180" cy="680" r="260" fill="white"/>
    <path d="M0 780 C320 680 520 840 860 720 C1120 620 1300 540 1600 620 L1600 900 L0 900 Z" fill="rgba(16,20,24,0.42)"/>
  </g>
  <rect x="84" y="82" width="700" height="64" rx="20" fill="rgba(21,24,28,0.18)"/>
  <text x="116" y="123" fill="rgba(255,248,242,0.92)" font-size="26" font-family="IBM Plex Mono, monospace" letter-spacing="4">{escape(eyebrow.upper())}</text>
  <text x="112" y="694" fill="rgba(255,248,242,0.96)" font-size="86" font-family="Georgia, serif">{escape(title)}</text>
  <text x="116" y="762" fill="rgba(255,248,242,0.82)" font-size="30" font-family="IBM Plex Mono, monospace">{escape(detail[:120])}</text>
  <text x="116" y="820" fill="rgba(255,248,242,0.72)" font-size="24" font-family="IBM Plex Mono, monospace">QMDH simulated preview</text>
</svg>
"""
    return write_binary_asset(relative_path, svg.encode("utf-8"), overwrite=overwrite)
