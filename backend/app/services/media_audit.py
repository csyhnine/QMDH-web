"""Read-only, conservative generated-media inventory; never a deletion plan."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path, PurePosixPath
import re
from urllib.parse import unquote, urlsplit

from sqlalchemy import JSON, String, inspect, select, MetaData, Table


MEDIA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".mp4", ".webm", ".mov", ".mkv", ".bin"}
PATH_TOKEN = re.compile(r"(?:https?://[^\s<>\"']+|/?(?:media/)?generated/[^\s<>\"']+)")


def reference_paths(value):
    """Keep URL hosts deliberately: any generated-path reference protects the file."""
    if isinstance(value, dict):
        for key, item in value.items():
            yield from reference_paths(key)
            yield from reference_paths(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from reference_paths(item)
    elif isinstance(value, str):
        # Entire values handle paths containing spaces; tokens also handle Markdown.
        tokens = [value.strip(), *PATH_TOKEN.findall(value)]
        for token in [*tokens, *(token.rstrip(").,;]}") for token in tokens)]:
            path = unquote(urlsplit(token.replace("\\", "/")).path)
            if path.startswith("/media/"):
                path = path[len("/media/"):]
            path = path.lstrip("/")
            if path.startswith("media/"):
                path = path[len("media/"):]
            if (path.startswith("generated/") and ".." not in PurePosixPath(path).parts
                    and "\n" not in path and "\r" not in path
                    and PurePosixPath(path).suffix.lower() in MEDIA_EXTENSIONS):
                yield path


def scan_references(connection):
    """Reflect the actual schema, including archives and soft-deleted rows."""
    references = {}
    coverage = []
    metadata = MetaData()
    for name in sorted(inspect(connection).get_table_names()):
        table = Table(name, metadata, autoload_with=connection)
        columns = [column for column in table.columns if isinstance(column.type, (String, JSON))]
        if not columns:
            continue
        primary = list(table.primary_key.columns)
        selected = list(dict.fromkeys([*primary, *columns]))
        coverage.append({"table": name, "columns": [column.name for column in columns]})
        for row in connection.execution_options(yield_per=1000).execute(select(*selected)).mappings():
            # Row identity and column only: no prompt, content, key or URL in report.
            identity = {column.name: str(row[column.name]) for column in primary}
            for column in columns:
                value = row[column.name]
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except (ValueError, TypeError):
                        pass
                location = {"table": name, "row": identity, "column": column.name}
                for path in set(reference_paths(value)):
                    bucket = references.setdefault(path, [])
                    if location not in bucket:
                        bucket.append(location)
    return references, coverage


def audit_media(connection, media_root: Path, *, retention_days=30, now=None):
    if retention_days < 1:
        raise ValueError("retention_days must be positive")
    root = media_root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("media root must be a directory")
    generated = root / "generated"
    if generated.is_symlink() or not generated.is_dir() or not generated.resolve().is_relative_to(root):
        raise ValueError("generated must be an existing real directory")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must include a timezone")
    cutoff = now - timedelta(days=retention_days)
    references, coverage = scan_references(connection)
    files = []
    skipped = []

    def walk_error(error):
        raise error

    for directory, subdirs, names in os.walk(generated, followlinks=False, onerror=walk_error):
        for name in list(subdirs):
            path = Path(directory) / name
            if path.is_symlink() or path.resolve().is_relative_to(root) is False:
                skipped.append(path.relative_to(root).as_posix())
                subdirs.remove(name)
        for name in sorted(names):
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if path.is_symlink() or not path.resolve().is_relative_to(root):
                skipped.append(relative)
                continue
            if not path.is_file() or path.suffix.lower() not in MEDIA_EXTENSIONS:
                skipped.append(relative)
                continue
            stat = path.stat()
            modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc)
            locations = list(references.get(relative, []))
            # Storage creates typed image aliases for .bin upstream references.
            # Protect siblings sharing a stem in either direction.
            siblings = [str(PurePosixPath(relative).with_suffix(extension)) for extension in MEDIA_EXTENSIONS]
            for sibling in siblings:
                for location in references.get(sibling, []):
                    if location not in locations:
                        locations.append(location)
            status = "referenced" if locations else ("expired_unreferenced" if modified < cutoff else "recent")
            files.append({"path": relative, "bytes": stat.st_size, "mtime": modified.isoformat(), "status": status, "references": locations})
    files.sort(key=lambda item: item["path"])
    inventory = {item["path"] for item in files}
    # A missing reference is not necessarily broken: it may live in OSS or be a skipped type.
    missing = [{"path": path, "references": locations} for path, locations in sorted(references.items()) if path not in inventory]
    totals = {status: {"count": sum(item["status"] == status for item in files), "bytes": sum(item["bytes"] for item in files if item["status"] == status)} for status in ("referenced", "expired_unreferenced", "recent")}
    return {"version": 1, "read_only": True, "deletion_authorized": False, "generated_at": now.isoformat(), "retention_days": retention_days, "cutoff": cutoff.isoformat(), "summary": totals, "coverage": coverage, "files": files, "references_not_in_local_inventory": missing, "skipped": sorted(skipped), "limitations": ["Point-in-time preview; concurrent database/media changes require a fresh audit before any later action.", "Encrypted/opaque values and other storage roots are not audited. Candidates require manual review; this tool cannot delete."]}
