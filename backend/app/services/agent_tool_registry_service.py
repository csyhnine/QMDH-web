"""Tool discovery helpers (Codex tool_search-inspired, scoped to allowlist)."""

from __future__ import annotations

from app.services.agent_policy_service import chat_tool_catalog_map


def rank_tools_for_query(*, allowlist: tuple[str, ...], query: str, limit: int = 6) -> list[dict[str, str]]:
    catalog = chat_tool_catalog_map()
    cleaned = (query or "").strip().lower()
    if not cleaned:
        return [dict(catalog[key]) for key in allowlist if key in catalog][:limit]

    tokens = [token for token in cleaned.replace("，", " ").replace(",", " ").split() if token]
    scored: list[tuple[int, str]] = []
    for key in allowlist:
        item = catalog.get(key)
        if not item:
            continue
        haystack = f"{item['label']} {item['description']} {key}".lower()
        score = sum(2 if token in item["label"].lower() else 1 for token in tokens if token in haystack)
        if score > 0:
            scored.append((score, key))

    scored.sort(key=lambda pair: (-pair[0], pair[1]))
    if not scored:
        return [dict(catalog[key]) for key in allowlist if key in catalog][:limit]
    return [dict(catalog[key]) for _, key in scored[:limit]]


def format_tool_hints(tools: list[dict[str, str]]) -> str:
    if not tools:
        return ""
    lines = [f"- {item['key']}: {item['label']} — {item['description']}" for item in tools]
    return "可用工具（按相关性排序）：\n" + "\n".join(lines)
