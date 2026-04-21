from __future__ import annotations

from base64 import b64decode
from html import escape
from pathlib import Path

from app.core.config import settings


def media_root_path() -> Path:
    root = Path(settings.media_root)
    if not root.is_absolute():
        root = Path.cwd() / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def media_url_for(relative_path: str) -> str:
    normalized = relative_path.replace("\\", "/").lstrip("/")
    return f"{settings.media_url_prefix.rstrip('/')}/{normalized}"


def write_binary_asset(relative_path: str, content: bytes, *, overwrite: bool = True) -> str:
    target = media_root_path() / Path(relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if overwrite or not target.exists():
        target.write_bytes(content)
    return media_url_for(relative_path)


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
    target = media_root_path() / Path(relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)

    if overwrite or not target.exists():
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
        target.write_text(svg, encoding="utf-8")

    return media_url_for(relative_path)
