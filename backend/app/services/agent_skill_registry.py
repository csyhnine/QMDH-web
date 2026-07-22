"""Official OpenClaw skill catalog: filesystem builtins + Admin DB entries."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import REPO_ROOT_DIR
from app.models import AgentSkillCatalogEntry, AgentSkillRelease


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


def list_filesystem_skills() -> list[dict[str, object]]:
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
        key = str(manifest.get("key") or path.name)
        runtime = str(manifest.get("runtime") or "openclaw").strip().lower() or "openclaw"
        if runtime not in {"openclaw", "chat", "both"}:
            runtime = "openclaw"
        manifests.append(
            {
                "id": None,
                "key": key,
                "name": str(manifest.get("name") or path.name),
                "version": str(manifest.get("version") or "0.1.0"),
                "description": str(manifest.get("description") or ""),
                "author": str(manifest.get("author") or ""),
                "path": str(path.relative_to(REPO_ROOT_DIR)).replace("\\", "/"),
                "inputs": list(manifest.get("inputs") or []),
                "outputs": list(manifest.get("outputs") or []),
                "source": "builtin",
                "runtime": runtime,
                "deletable": False,
                "is_active": True,
                "notes": "",
                "source_uri": "",
                "source_repo": "",
                "source_path": "",
                "file_count": 0,
                "has_scripts": False,
                "file_manifest": [],
                "content_hash": "",
                "has_skill_md": False,
            }
        )
    return manifests


def _entry_to_dict(row: AgentSkillCatalogEntry, *, source: str, deletable: bool) -> dict[str, object]:
    manifest = list(row.file_manifest or [])
    has_scripts = any(
        str(item.get("path") or "").replace("\\", "/").startswith("scripts/")
        or "/scripts/" in str(item.get("path") or "").replace("\\", "/")
        for item in manifest
    )
    path = f"catalog:{row.key}"
    if source == "builtin":
        path = row.notes or path
    elif row.source_repo:
        path = f"{row.source_repo}/{row.source_path}".rstrip("/")
    has_skill_md = bool((row.skill_md or "").strip())
    # Builtin OpenClaw wrappers stay openclaw; GitHub packs with SKILL.md can inject Chat prompt.
    if source == "builtin":
        runtime = "openclaw"
    elif has_skill_md:
        runtime = "chat"
    else:
        runtime = "openclaw"
    return {
        "id": row.id,
        "key": row.key,
        "name": row.name,
        "version": row.version,
        "description": row.description,
        "author": row.author,
        "path": path,
        "inputs": list(row.inputs_json or []),
        "outputs": list(row.outputs_json or []),
        "source": source,
        "runtime": runtime,
        "deletable": deletable,
        "notes": row.notes,
        "is_active": bool(row.is_active),
        "source_uri": row.source_uri or "",
        "source_repo": row.source_repo or "",
        "source_path": row.source_path or "",
        "file_count": len(manifest),
        "has_scripts": has_scripts,
        "file_manifest": manifest,
        "content_hash": row.content_hash or "",
        "has_skill_md": has_skill_md,
    }


def list_catalog_skills(db: Session, *, include_inactive: bool = True) -> list[dict[str, object]]:
    stmt = select(AgentSkillCatalogEntry).order_by(AgentSkillCatalogEntry.key.asc())
    if not include_inactive:
        stmt = stmt.where(AgentSkillCatalogEntry.is_active == True)  # noqa: E712
    rows = list(db.scalars(stmt).all())
    builtins = builtin_skill_keys()
    return [
        _entry_to_dict(
            row,
            source="builtin" if row.key in builtins else "custom",
            deletable=row.key not in builtins,
        )
        for row in rows
    ]


def list_official_skills(
    db: Session | None = None,
    *,
    include_inactive: bool = True,
    active_only: bool = False,
) -> list[dict[str, object]]:
    """Merge filesystem builtins with Admin catalog. Catalog row wins for same key (incl. is_active)."""
    by_key: dict[str, dict[str, object]] = {}
    for item in list_filesystem_skills():
        by_key[str(item["key"])] = item
    if db is not None:
        for item in list_catalog_skills(db, include_inactive=True):
            # Preserve builtin path when shadowing enable-state for filesystem skills.
            existing = by_key.get(str(item["key"]))
            if existing and existing.get("source") == "builtin":
                # Catalog shadow rows only own enable-state; labels stay on filesystem manifests.
                item = {
                    **item,
                    "source": "builtin",
                    "deletable": False,
                    "path": existing.get("path") or item.get("path"),
                    "name": existing.get("name") or item.get("name"),
                    "version": existing.get("version") or item.get("version"),
                    "description": existing.get("description") or item.get("description"),
                    "author": existing.get("author") or item.get("author"),
                    "inputs": existing.get("inputs") or item.get("inputs"),
                    "outputs": existing.get("outputs") or item.get("outputs"),
                    "runtime": existing.get("runtime") or item.get("runtime") or "openclaw",
                }
            by_key[str(item["key"])] = item

    rows = [by_key[key] for key in sorted(by_key.keys())]
    if active_only or not include_inactive:
        rows = [item for item in rows if bool(item.get("is_active", True))]
    return rows


def enabled_skill_keys(db: Session) -> list[str]:
    return [str(item["key"]) for item in list_official_skills(db, active_only=True)]


def builtin_skill_keys() -> set[str]:
    return {str(item["key"]) for item in list_filesystem_skills()}


def sync_enabled_skills_to_releases(db: Session) -> None:
    """Keep release.skill_keys aligned with currently enabled skills (model-config style)."""
    enabled = enabled_skill_keys(db)
    releases = list(db.scalars(select(AgentSkillRelease)).all())
    for release in releases:
        release.skill_keys = list(enabled)


def create_catalog_skill(
    db: Session,
    *,
    key: str,
    name: str,
    version: str = "0.1.0",
    description: str = "",
    author: str = "",
    inputs: list[str] | None = None,
    outputs: list[str] | None = None,
    notes: str = "",
    created_by_user_id: int | None = None,
    is_active: bool = True,
) -> AgentSkillCatalogEntry:
    cleaned_key = key.strip()
    if cleaned_key in builtin_skill_keys():
        raise ValueError(f"Skill key {cleaned_key!r} is reserved by a builtin filesystem skill.")
    existing = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == cleaned_key))
    if existing is not None:
        raise ValueError(f"Skill key {cleaned_key!r} already exists.")

    entry = AgentSkillCatalogEntry(
        key=cleaned_key,
        name=name.strip(),
        version=(version or "0.1.0").strip() or "0.1.0",
        description=(description or "").strip(),
        author=(author or "").strip(),
        inputs_json=[item.strip() for item in (inputs or []) if item.strip()],
        outputs_json=[item.strip() for item in (outputs or []) if item.strip()],
        notes=(notes or "").strip(),
        is_active=is_active,
        created_by_user_id=created_by_user_id,
    )
    db.add(entry)
    db.flush()
    sync_enabled_skills_to_releases(db)
    return entry


def set_skill_active(db: Session, *, skill_key: str, is_active: bool) -> dict[str, object]:
    cleaned_key = skill_key.strip()
    entry = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == cleaned_key))
    if entry is None:
        builtins = {item["key"]: item for item in list_filesystem_skills()}
        builtin = builtins.get(cleaned_key)
        if builtin is None:
            raise LookupError(f"Skill not found: {cleaned_key}")
        entry = AgentSkillCatalogEntry(
            key=cleaned_key,
            name=str(builtin["name"]),
            version=str(builtin["version"]),
            description=str(builtin["description"]),
            author=str(builtin.get("author") or ""),
            inputs_json=list(builtin.get("inputs") or []),
            outputs_json=list(builtin.get("outputs") or []),
            notes=str(builtin.get("path") or ""),
            is_active=is_active,
        )
        db.add(entry)
        db.flush()
    else:
        entry.is_active = is_active
        db.flush()

    sync_enabled_skills_to_releases(db)
    merged = {item["key"]: item for item in list_official_skills(db, include_inactive=True)}
    return merged[cleaned_key]


def delete_catalog_skill(db: Session, *, skill_key: str) -> AgentSkillCatalogEntry:
    cleaned_key = skill_key.strip()
    if cleaned_key in builtin_skill_keys():
        # Deleting a builtin shadow row = reset to filesystem default (enabled).
        entry = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == cleaned_key))
        if entry is None:
            raise LookupError(f"No admin override for builtin skill: {cleaned_key}")
        db.delete(entry)
        db.flush()
        sync_enabled_skills_to_releases(db)
        return entry

    entry = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == cleaned_key))
    if entry is None:
        raise LookupError(f"Custom skill not found: {cleaned_key}")

    db.delete(entry)
    db.flush()
    sync_enabled_skills_to_releases(db)
    return entry


def list_official_skills_filesystem_only() -> list[dict[str, object]]:
    return list_filesystem_skills()
