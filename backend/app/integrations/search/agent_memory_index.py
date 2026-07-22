"""Optional Meilisearch index for agent memory (degrades when disabled)."""

from __future__ import annotations

import logging

from app.core.config import settings
from app.models import AgentMemoryEntry

logger = logging.getLogger(__name__)

AGENT_MEMORY_INDEX = "qmdh_agent_memory"


def _client():
    if not settings.meilisearch_enabled:
        return None
    try:
        import meilisearch

        return meilisearch.Client(settings.meilisearch_url, settings.meilisearch_api_key or None)
    except Exception:
        logger.debug("meilisearch client unavailable for agent memory", exc_info=True)
        return None


def ensure_agent_memory_index() -> None:
    client = _client()
    if client is None:
        return
    try:
        client.create_index(AGENT_MEMORY_INDEX, {"primaryKey": "id"})
    except Exception:
        pass
    try:
        index = client.index(AGENT_MEMORY_INDEX)
        index.update_filterable_attributes(["user_id", "memory_type", "is_paused", "conversation_id"])
        index.update_searchable_attributes(["content", "memory_type", "source_turn_ref"])
        index.update_sortable_attributes(["id"])
    except Exception:
        logger.debug("failed to configure agent memory index", exc_info=True)


def index_agent_memory_entry(entry: AgentMemoryEntry) -> None:
    client = _client()
    if client is None:
        return
    if entry.is_paused:
        delete_agent_memory_entry(entry.id)
        return
    try:
        ensure_agent_memory_index()
        client.index(AGENT_MEMORY_INDEX).add_documents(
            [
                {
                    "id": entry.id,
                    "user_id": entry.user_id,
                    "conversation_id": entry.conversation_id,
                    "memory_type": entry.memory_type,
                    "content": entry.content,
                    "source_turn_ref": entry.source_turn_ref,
                    "is_paused": entry.is_paused,
                }
            ]
        )
    except Exception:
        logger.debug("failed to index agent memory entry %s", entry.id, exc_info=True)


def delete_agent_memory_entry(memory_id: int) -> None:
    client = _client()
    if client is None:
        return
    try:
        client.index(AGENT_MEMORY_INDEX).delete_document(memory_id)
    except Exception:
        logger.debug("failed to delete agent memory doc %s", memory_id, exc_info=True)


def search_agent_memory_entry_ids(*, user_id: int, query: str, limit: int = 12) -> list[int]:
    client = _client()
    if client is None or not query.strip():
        return []
    try:
        result = client.index(AGENT_MEMORY_INDEX).search(
            query,
            {
                "filter": f"user_id = {user_id} AND is_paused = false",
                "limit": max(1, min(limit, 50)),
            },
        )
        hits = result.get("hits") or []
        ids: list[int] = []
        for hit in hits:
            raw = hit.get("id")
            if isinstance(raw, int):
                ids.append(raw)
            elif isinstance(raw, str) and raw.isdigit():
                ids.append(int(raw))
        return ids
    except Exception:
        logger.debug("agent memory meili search failed", exc_info=True)
        return []
