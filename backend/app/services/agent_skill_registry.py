from __future__ import annotations

from pathlib import Path

from app.core.config import REPO_ROOT_DIR


def _parse_manifest_lines(raw_text: str) -> dict[str, object]:
    data: dict[str, object] = {}
    current_list_key: str | None = None
    for raw_line in raw_text.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("- ") and current_list_key:
            current = data.setdefault(current_list_key, [])
            if isinstance(current, list):
                current.append(stripped[2:].strip())
            continue
        current_list_key = None
        if ":" not in line:
            continue
        key, raw_value = line.split(":", 1)
        key = key.strip()
        value = raw_value.strip()
        if not value:
            current_list_key = key
            data[key] = []
            continue
        if value.startswith(("\"", "'")) and value.endswith(("\"", "'")) and len(value) >= 2:
            value = value[1:-1]
        data[key] = value
    return data


def list_official_skills() -> list[dict[str, object]]:
    skills_root = REPO_ROOT_DIR / "skills"
    if not skills_root.exists():
        return []

    manifests: list[dict[str, object]] = []
    for path in sorted(skills_root.iterdir()):
        if not path.is_dir() or path.name.startswith("."):
            continue
        manifest_path = path / "manifest.yaml"
        if not manifest_path.exists():
            continue
        manifest = _parse_manifest_lines(manifest_path.read_text(encoding="utf-8"))
        manifests.append(
            {
                "key": str(manifest.get("key") or path.name),
                "name": str(manifest.get("name") or path.name),
                "version": str(manifest.get("version") or "0.1.0"),
                "description": str(manifest.get("description") or ""),
                "author": str(manifest.get("author") or ""),
                "path": str(path.relative_to(REPO_ROOT_DIR)).replace("\\", "/"),
                "inputs": list(manifest.get("inputs") or []),
                "outputs": list(manifest.get("outputs") or []),
            }
        )
    return manifests
