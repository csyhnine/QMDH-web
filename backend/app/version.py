from __future__ import annotations

from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_VERSION = "1.1.0"


def read_version() -> str:
    version_file = _REPO_ROOT / "VERSION"
    if not version_file.is_file():
        return _DEFAULT_VERSION
    raw = version_file.read_text(encoding="utf-8").strip()
    if not raw:
        return _DEFAULT_VERSION
    return raw.splitlines()[0].strip()


__version__ = read_version()
