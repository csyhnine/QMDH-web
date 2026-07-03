"""Optional Meilisearch index for agent memory entries."""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import settings
from app.models import AgentMemoryEntry

logger = logging.getLogger(__name__)


def _meili_client():
    if not settings.meilisearch_enabled:
        return None
    try:
        import meilisearch
    except ImportError:
        return None
    return meilisearch.Client(settings.meilisearch_url, settings.meilisearch_api_key or None)


def _entry_document(entry: AgentMemoryEntry) -> dict[str, Any]:
    return {
        "id": entry.id,
        "user_id": entry.user_id,
        "persona_id": entry.persona_id,
        "conversation_id": entry.conversation_id,
        "memory_type": entry.memory_type,
        "content": entry.content,
        "source_turn_ref": entry.source_turn_ref or "",
        "created_at": entry.created_at.isoformat() if entry.created_at else "",
    }


def ensure_agent_memory_index() -> bool:
    client = _meili_client()
    if client is None:
        return False
    try:
        index = client.index(settings.meilisearch_agent_memory_index)
        index.update_filterable_attributes(["user_id", "persona_id", "conversation_id", "memory_type"])
        index.update_searchable_attributes(["content", "memory_type", "source_turn_ref"])
    except Exception:
        logger.warning("Meilisearch agent memory index setup skipped (service unreachable)", exc_info=True)
        return False
    return True


def index_agent_memory_entry(entry: AgentMemoryEntry) -> None:
    client = _meili_client()
    if client is None or entry.id is None:
        return
    try:
        index = client.index(settings.meilisearch_agent_memory_index)
        index.add_documents([_entry_document(entry)])
    except Exception:
        logger.exception("Failed to index agent memory entry %s", entry.id)


def search_agent_memory_entry_ids(
    *,
    user_id: int,
    query: str,
    persona_id: int | None = None,
    limit: int = 12,
) -> list[int]:
    client = _meili_client()
    if client is None:
        return []

    filters = [f"user_id = {user_id}"]
    if persona_id is not None:
        filters.append(f"(persona_id = {persona_id} OR persona_id IS NULL)")
    filter_expr = " AND ".join(filters)

    try:
        index = client.index(settings.meilisearch_agent_memory_index)
        result = index.search(
            query or "",
            {
                "limit": max(1, min(limit, 50)),
                "filter": filter_expr,
            },
        )
    except Exception:
        logger.exception("Meilisearch agent memory search failed")
        return []

    ids: list[int] = []
    for hit in result.get("hits") or []:
        raw_id = hit.get("id")
        if isinstance(raw_id, int):
            ids.append(raw_id)
        elif isinstance(raw_id, str) and raw_id.isdigit():
            ids.append(int(raw_id))
    return ids
