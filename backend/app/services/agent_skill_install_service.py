"""Install Agent Skills from GitHub URLs or `npx skills add ...` command strings.

Never shell-executes npx — only parses the string and fetches over HTTPS.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AgentSkillCatalogEntry
from app.services.agent_skill_registry import (
    builtin_skill_keys,
    list_official_skills,
    sync_enabled_skills_to_releases,
)

logger = logging.getLogger(__name__)

MAX_BUNDLE_BYTES = 2 * 1024 * 1024
MAX_FILE_BYTES = 256 * 1024
GITHUB_API = "https://api.github.com"
RAW_GITHUB = "https://raw.githubusercontent.com"

_NPX_RE = re.compile(
    r"^\s*(?:npx\s+(?:skills(?:@[\w.-]+)?)\s+add)\s+(.+?)\s*$",
    re.IGNORECASE,
)
_SKILL_FLAG_RE = re.compile(r"(?:--skill|-s)\s+([A-Za-z0-9_.\-]+)", re.IGNORECASE)
_OWNER_REPO_RE = re.compile(r"^([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+)(?:/(.+))?$")


@dataclass(frozen=True)
class ParsedSkillSource:
    owner: str
    repo: str
    ref: str
    skill_name: str | None
    path_hint: str | None
    raw: str


@dataclass(frozen=True)
class SkillCandidate:
    key: str
    path: str
    name: str
    description: str
    file_count: int
    has_scripts: bool


class SkillInstallError(ValueError):
    """User-facing install failure."""


def parse_skill_install_source(raw: str) -> ParsedSkillSource:
    text = (raw or "").strip()
    if not text:
        raise SkillInstallError("请粘贴 GitHub 链接或 npx skills add 命令")

    skill_name: str | None = None
    flag = _SKILL_FLAG_RE.search(text)
    if flag:
        skill_name = flag.group(1).strip()
        text = (_SKILL_FLAG_RE.sub("", text)).strip()

    npx_match = _NPX_RE.match(text)
    if npx_match:
        text = npx_match.group(1).strip().strip("'\"")

    # Drop leftover flags
    text = re.sub(r"\s+--\w+(?:=[^\s]+)?", "", text).strip()
    text = text.strip("'\"")

    if text.startswith(("http://", "https://")):
        return _parse_github_url(text, skill_name=skill_name, raw=raw)

    owner_repo = _OWNER_REPO_RE.match(text)
    if owner_repo:
        owner, repo, rest = owner_repo.group(1), owner_repo.group(2), owner_repo.group(3)
        path_hint = None
        inferred_skill = skill_name
        if rest:
            parts = [p for p in rest.split("/") if p]
            if parts and parts[0] in {"tree", "blob"}:
                # owner/repo/tree/ref/path...
                if len(parts) >= 2:
                    ref = parts[1]
                    path_parts = parts[2:]
                    path_hint = "/".join(path_parts) if path_parts else None
                    if path_parts and inferred_skill is None:
                        inferred_skill = path_parts[-1]
                    return ParsedSkillSource(
                        owner=owner,
                        repo=repo,
                        ref=ref,
                        skill_name=inferred_skill,
                        path_hint=path_hint,
                        raw=raw.strip(),
                    )
            else:
                path_hint = "/".join(parts)
                if inferred_skill is None:
                    inferred_skill = parts[-1]
        return ParsedSkillSource(
            owner=owner,
            repo=repo,
            ref="HEAD",
            skill_name=inferred_skill,
            path_hint=path_hint,
            raw=raw.strip(),
        )

    raise SkillInstallError("无法解析安装源，请使用 GitHub URL、owner/repo 或 npx skills add 命令")


def _parse_github_url(url: str, *, skill_name: str | None, raw: str) -> ParsedSkillSource:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host not in {"github.com", "www.github.com", "raw.githubusercontent.com"}:
        raise SkillInstallError("仅支持从 github.com 安装 Skill")

    parts = [p for p in parsed.path.split("/") if p]
    if host == "raw.githubusercontent.com":
        if len(parts) < 4:
            raise SkillInstallError("raw.githubusercontent.com URL 格式无效")
        owner, repo, ref = parts[0], parts[1], parts[2]
        path_parts = parts[3:]
        path_hint = "/".join(path_parts[:-1]) if path_parts and path_parts[-1].lower() == "skill.md" else "/".join(path_parts)
        inferred = skill_name
        if path_hint and inferred is None:
            inferred = path_hint.rstrip("/").split("/")[-1] or None
        return ParsedSkillSource(owner=owner, repo=repo, ref=ref, skill_name=inferred, path_hint=path_hint or None, raw=raw.strip())

    if len(parts) < 2:
        raise SkillInstallError("GitHub URL 缺少 owner/repo")
    owner, repo = parts[0], parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]

    ref = "HEAD"
    path_hint: str | None = None
    inferred = skill_name
    if len(parts) >= 4 and parts[2] in {"tree", "blob"}:
        ref = parts[3]
        path_parts = parts[4:]
        if path_parts:
            if path_parts[-1].lower() == "skill.md":
                path_parts = path_parts[:-1]
            path_hint = "/".join(path_parts) if path_parts else None
            if path_hint and inferred is None:
                inferred = path_hint.split("/")[-1]
    return ParsedSkillSource(owner=owner, repo=repo, ref=ref, skill_name=inferred, path_hint=path_hint, raw=raw.strip())


def _github_headers() -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "User-Agent": "QMDH-Skill-Installer",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _resolve_ref(client: httpx.Client, owner: str, repo: str, ref: str) -> str:
    if ref != "HEAD":
        return ref
    resp = client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=_github_headers())
    if resp.status_code >= 400:
        raise SkillInstallError(f"无法访问仓库 {owner}/{repo}（HTTP {resp.status_code}）")
    data = resp.json()
    return str(data.get("default_branch") or "main")


def _list_tree_paths(client: httpx.Client, owner: str, repo: str, ref: str) -> list[str]:
    resp = client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{ref}",
        params={"recursive": "1"},
        headers=_github_headers(),
    )
    if resp.status_code >= 400:
        raise SkillInstallError(f"无法读取仓库目录树（HTTP {resp.status_code}）")
    payload = resp.json()
    if payload.get("truncated"):
        logger.warning("GitHub tree truncated for %s/%s@%s", owner, repo, ref)
    paths: list[str] = []
    for item in payload.get("tree") or []:
        if item.get("type") != "blob":
            continue
        path = str(item.get("path") or "").replace("\\", "/")
        if path:
            paths.append(path)
    return paths


def discover_skill_dirs(paths: list[str]) -> list[str]:
    """Return skill root dirs (relative) that contain SKILL.md."""
    roots: list[str] = []
    for path in paths:
        normalized = path.replace("\\", "/")
        if normalized.lower().endswith("/skill.md") or normalized.lower() == "skill.md":
            root = normalized[: -len("SKILL.md")].rstrip("/") if "/" in normalized else ""
            # Preserve exact casing from path minus filename
            parent = normalized.rsplit("/", 1)[0] if "/" in normalized else ""
            roots.append(parent)
    # Prefer deeper / more specific; unique preserve order
    unique: list[str] = []
    seen: set[str] = set()
    for root in sorted(roots, key=lambda r: (r.count("/"), r)):
        key = root.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(root)
    return unique


def _skill_key_from_path(skill_dir: str) -> str:
    if not skill_dir:
        return "skill"
    return skill_dir.rstrip("/").split("/")[-1]


def _paths_under(skill_dir: str, all_paths: list[str]) -> list[str]:
    prefix = f"{skill_dir}/" if skill_dir else ""
    if not skill_dir:
        # Only top-level skill.md package: files that don't leave the root skill folder
        # When SKILL.md is at repo root, take all files not in other skill dirs — keep simple: all files.
        return list(all_paths)
    return [p for p in all_paths if p == skill_dir or p.startswith(prefix)]


def _looks_binary(data: bytes) -> bool:
    if b"\x00" in data[:8000]:
        return True
    try:
        data.decode("utf-8")
        return False
    except UnicodeDecodeError:
        return True


def parse_skill_md_frontmatter(skill_md: str) -> dict[str, str]:
    text = skill_md.lstrip("\ufeff")
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    block = text[3:end].strip()
    meta: dict[str, str] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip().strip("\"'")
        if key in {"name", "description", "version", "author"}:
            meta[key] = value
    return meta


def _fetch_raw_file(client: httpx.Client, owner: str, repo: str, ref: str, path: str) -> bytes:
    url = f"{RAW_GITHUB}/{owner}/{repo}/{ref}/{path}"
    resp = client.get(url, headers={"User-Agent": "QMDH-Skill-Installer"}, follow_redirects=True)
    if resp.status_code >= 400:
        raise SkillInstallError(f"无法下载文件 {path}（HTTP {resp.status_code}）")
    return resp.content


def fetch_skill_bundle(
    client: httpx.Client,
    *,
    owner: str,
    repo: str,
    ref: str,
    skill_dir: str,
    all_paths: list[str],
) -> tuple[str, dict[str, dict[str, Any]], list[dict[str, Any]], str]:
    """Return skill_md, files_json, file_manifest, content_hash."""
    file_paths = _paths_under(skill_dir, all_paths)
    skill_md_path = f"{skill_dir}/SKILL.md" if skill_dir else "SKILL.md"
    # Case-insensitive find
    actual_skill_md = next(
        (p for p in file_paths if p.lower().endswith("/skill.md") or p.lower() == "skill.md"),
        None,
    )
    if actual_skill_md is None:
        raise SkillInstallError(f"目录 {skill_dir or '/'} 缺少 SKILL.md")

    files_json: dict[str, dict[str, Any]] = {}
    manifest: list[dict[str, Any]] = []
    total = 0
    hasher = hashlib.sha256()

    for path in sorted(file_paths):
        if path.endswith("/"):
            continue
        rel = path[len(skill_dir) + 1 :] if skill_dir and path.startswith(skill_dir + "/") else path
        if not rel or rel == skill_dir:
            continue
        try:
            raw = _fetch_raw_file(client, owner, repo, ref, path)
        except SkillInstallError:
            logger.warning("skip missing file %s", path)
            continue

        size = len(raw)
        total += size
        if total > MAX_BUNDLE_BYTES:
            raise SkillInstallError(f"Skill 包超过 {MAX_BUNDLE_BYTES // 1024}KB 上限")
        hasher.update(rel.encode("utf-8"))
        hasher.update(b"\0")
        hasher.update(raw)

        if size > MAX_FILE_BYTES or _looks_binary(raw):
            entry = {"kind": "binary_skipped", "size": size}
            files_json[rel] = entry
            manifest.append({"path": rel, "size": size, "kind": "binary_skipped"})
            continue

        content = raw.decode("utf-8")
        files_json[rel] = {"kind": "text", "content": content, "size": size}
        manifest.append({"path": rel, "size": size, "kind": "text"})

    skill_rel = actual_skill_md[len(skill_dir) + 1 :] if skill_dir else actual_skill_md
    skill_entry = files_json.get(skill_rel) or files_json.get("SKILL.md")
    if not skill_entry or skill_entry.get("kind") != "text":
        # try any skill.md key
        skill_entry = next((v for k, v in files_json.items() if k.lower() == "skill.md" and v.get("kind") == "text"), None)
    if not skill_entry:
        raise SkillInstallError("SKILL.md 无法作为文本读取（可能过大或为二进制）")
    skill_md = str(skill_entry["content"])
    return skill_md, files_json, manifest, hasher.hexdigest()


def _candidate_from_dir(
    client: httpx.Client,
    *,
    owner: str,
    repo: str,
    ref: str,
    skill_dir: str,
    all_paths: list[str],
) -> SkillCandidate:
    file_paths = _paths_under(skill_dir, all_paths)
    key = _skill_key_from_path(skill_dir)
    has_scripts = any("/scripts/" in p.replace("\\", "/") or p.replace("\\", "/").startswith("scripts/") for p in file_paths)
    name = key
    description = ""
    skill_md_path = next((p for p in file_paths if p.split("/")[-1].lower() == "skill.md"), None)
    if skill_md_path:
        try:
            raw = _fetch_raw_file(client, owner, repo, ref, skill_md_path)
            if len(raw) <= MAX_FILE_BYTES and not _looks_binary(raw):
                meta = parse_skill_md_frontmatter(raw.decode("utf-8"))
                name = meta.get("name") or name
                description = meta.get("description") or ""
        except SkillInstallError:
            pass
    return SkillCandidate(
        key=key,
        path=skill_dir or ".",
        name=name,
        description=description,
        file_count=len(file_paths),
        has_scripts=has_scripts,
    )


def _pick_skill_dir(parsed: ParsedSkillSource, skill_dirs: list[str]) -> str | None:
    if parsed.path_hint:
        hint = parsed.path_hint.strip("/")
        for d in skill_dirs:
            if d == hint or d.endswith("/" + hint) or hint.endswith("/" + d):
                return d
        # path hint may already be the skill dir even if tree discovery missed casing
        return hint
    if parsed.skill_name:
        name = parsed.skill_name.lower()
        matches = [d for d in skill_dirs if _skill_key_from_path(d).lower() == name]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            # prefer skills/ prefix
            preferred = [d for d in matches if "skills/" in d.lower() or d.lower().startswith("skills/")]
            return preferred[0] if preferred else matches[0]
        return None
    if len(skill_dirs) == 1:
        return skill_dirs[0]
    return None


def install_skill_from_source(
    db: Session,
    *,
    source: str,
    skill_key: str | None = None,
    overwrite: bool = False,
    created_by_user_id: int | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Install or return candidates.

    Returns either:
      {"status": "needs_selection", "candidates": [...]}
      {"status": "installed", "entry": AgentSkillCatalogEntry, "item": dict}
    """
    parsed = parse_skill_install_source(source)
    own_client = client is None
    http = client or httpx.Client(timeout=30.0, follow_redirects=True)
    try:
        ref = _resolve_ref(http, parsed.owner, parsed.repo, parsed.ref)
        all_paths = _list_tree_paths(http, parsed.owner, parsed.repo, ref)
        skill_dirs = discover_skill_dirs(all_paths)
        if not skill_dirs:
            raise SkillInstallError("仓库中未找到含 SKILL.md 的 Skill 目录")

        target_dir: str | None = None
        if skill_key:
            matches = [d for d in skill_dirs if _skill_key_from_path(d).lower() == skill_key.lower()]
            if not matches and any(d == skill_key or d.endswith("/" + skill_key) for d in skill_dirs):
                matches = [d for d in skill_dirs if d == skill_key or d.endswith("/" + skill_key)]
            if len(matches) == 1:
                target_dir = matches[0]
            elif not matches:
                raise SkillInstallError(f"未找到 skill: {skill_key}")
            else:
                target_dir = matches[0]
        else:
            target_dir = _pick_skill_dir(parsed, skill_dirs)

        if target_dir is None:
            candidates = [
                _candidate_from_dir(http, owner=parsed.owner, repo=parsed.repo, ref=ref, skill_dir=d, all_paths=all_paths)
                for d in skill_dirs
            ]
            return {
                "status": "needs_selection",
                "candidates": [
                    {
                        "key": c.key,
                        "path": c.path,
                        "name": c.name,
                        "description": c.description,
                        "file_count": c.file_count,
                        "has_scripts": c.has_scripts,
                    }
                    for c in candidates
                ],
            }

        skill_md, files_json, manifest, content_hash = fetch_skill_bundle(
            http,
            owner=parsed.owner,
            repo=parsed.repo,
            ref=ref,
            skill_dir=target_dir,
            all_paths=all_paths,
        )
        meta = parse_skill_md_frontmatter(skill_md)
        key = (skill_key or _skill_key_from_path(target_dir)).strip()
        if not re.fullmatch(r"[a-zA-Z0-9_.\-]+", key):
            raise SkillInstallError(f"非法 skill key: {key}")
        if key in builtin_skill_keys():
            raise SkillInstallError(f"Skill key {key!r} 与内置技能冲突")

        existing = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == key))
        if existing is not None and not overwrite:
            raise SkillInstallError(f"Skill {key!r} 已存在，请勾选覆盖或先停用删除")

        name = (meta.get("name") or key).strip()[:150]
        description = (meta.get("description") or "").strip()
        version = (meta.get("version") or "0.1.0").strip()[:50] or "0.1.0"
        author = (meta.get("author") or f"{parsed.owner}/{parsed.repo}").strip()[:120]
        has_scripts = any(
            str(item.get("path") or "").replace("\\", "/").startswith("scripts/")
            or "/scripts/" in str(item.get("path") or "").replace("\\", "/")
            for item in manifest
        )
        notes = f"installed from {parsed.owner}/{parsed.repo}; scripts={'yes' if has_scripts else 'no'} (not executed)"

        if existing is None:
            entry = AgentSkillCatalogEntry(
                key=key,
                name=name,
                version=version,
                description=description,
                author=author,
                notes=notes,
                source_uri=parsed.raw,
                source_repo=f"{parsed.owner}/{parsed.repo}",
                source_path=target_dir or ".",
                skill_md=skill_md,
                files_json=files_json,
                file_manifest=manifest,
                content_hash=content_hash,
                is_active=True,
                created_by_user_id=created_by_user_id,
            )
            db.add(entry)
        else:
            entry = existing
            entry.name = name
            entry.version = version
            entry.description = description
            entry.author = author
            entry.notes = notes
            entry.source_uri = parsed.raw
            entry.source_repo = f"{parsed.owner}/{parsed.repo}"
            entry.source_path = target_dir or "."
            entry.skill_md = skill_md
            entry.files_json = files_json
            entry.file_manifest = manifest
            entry.content_hash = content_hash
            entry.is_active = True

        db.flush()
        sync_enabled_skills_to_releases(db)
        item = next(i for i in list_official_skills(db, include_inactive=True) if i["key"] == key)
        return {"status": "installed", "entry": entry, "item": item}
    finally:
        if own_client:
            http.close()


def read_enabled_skill_resource(db: Session, *, skill_key: str, relative_path: str) -> dict[str, Any]:
    cleaned_key = (skill_key or "").strip()
    rel = (relative_path or "").strip().replace("\\", "/").lstrip("/")
    if not cleaned_key or not rel:
        return {"ok": False, "error": "skill_key and relative_path are required"}
    if ".." in rel.split("/"):
        return {"ok": False, "error": "invalid path"}

    entry = db.scalar(
        select(AgentSkillCatalogEntry).where(
            AgentSkillCatalogEntry.key == cleaned_key,
            AgentSkillCatalogEntry.is_active == True,  # noqa: E712
        )
    )
    if entry is None:
        return {"ok": False, "error": f"enabled skill not found: {cleaned_key}"}

    files = dict(entry.files_json or {})
    file_entry = files.get(rel)
    if file_entry is None:
        # case-insensitive
        file_entry = next((v for k, v in files.items() if k.lower() == rel.lower()), None)
        if file_entry is not None:
            rel = next(k for k in files if k.lower() == rel.lower())
    if file_entry is None:
        available = sorted(files.keys())[:40]
        return {"ok": False, "error": f"file not found: {rel}", "available": available}
    if file_entry.get("kind") != "text":
        return {"ok": False, "error": f"file is not readable text: {rel}", "kind": file_entry.get("kind")}
    return {
        "ok": True,
        "skill_key": cleaned_key,
        "path": rel,
        "content": str(file_entry.get("content") or ""),
        "size": int(file_entry.get("size") or 0),
    }


def build_enabled_skills_prompt_section(db: Session, *, max_chars: int = 12_000) -> str:
    rows = (
        db.scalars(
            select(AgentSkillCatalogEntry)
            .where(
                AgentSkillCatalogEntry.is_active == True,  # noqa: E712
                AgentSkillCatalogEntry.skill_md != "",
            )
            .order_by(AgentSkillCatalogEntry.updated_at.desc(), AgentSkillCatalogEntry.id.desc())
        ).all()
    )
    if not rows:
        return ""

    lines: list[str] = [
        "已启用的院内 Skill（Agent Skills 包）。scripts/ 不可在服务端执行；"
        "需要附属文件时调用 read_skill_resource(skill_key, relative_path)。",
        "",
        "## Skill 目录",
    ]
    for row in rows:
        desc = (row.description or "").strip().replace("\n", " ")
        lines.append(f"- {row.key}: {row.name} — {desc}")
        manifest = list(row.file_manifest or [])
        if manifest:
            paths = ", ".join(str(item.get("path")) for item in manifest[:12] if item.get("path"))
            lines.append(f"  文件: {paths}")

    body_parts: list[str] = ["\n".join(lines), ""]
    used = sum(len(p) for p in body_parts)
    for row in rows:
        chunk = f"### Skill `{row.key}`\n\n{row.skill_md.strip()}\n"
        if used + len(chunk) > max_chars:
            body_parts.append(f"（其余 Skill 正文因长度上限未全部注入，可用 read_skill_resource 读取 `SKILL.md`。）\n")
            break
        body_parts.append(chunk)
        used += len(chunk)
    return "\n".join(body_parts).strip()


def get_skill_file_content(db: Session, *, skill_key: str, relative_path: str) -> dict[str, Any]:
    """Admin preview — active or inactive."""
    cleaned_key = skill_key.strip()
    rel = relative_path.strip().replace("\\", "/").lstrip("/")
    entry = db.scalar(select(AgentSkillCatalogEntry).where(AgentSkillCatalogEntry.key == cleaned_key))
    if entry is None:
        raise LookupError(f"Skill not found: {cleaned_key}")
    files = dict(entry.files_json or {})
    file_entry = files.get(rel) or next((v for k, v in files.items() if k.lower() == rel.lower()), None)
    if file_entry is None:
        raise LookupError(f"File not found: {rel}")
    return {
        "skill_key": cleaned_key,
        "path": rel,
        "kind": file_entry.get("kind"),
        "size": int(file_entry.get("size") or 0),
        "content": file_entry.get("content") if file_entry.get("kind") == "text" else None,
    }
