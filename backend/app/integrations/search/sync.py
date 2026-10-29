"""Optional Meilisearch index sync helpers."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.integrations.search.service import _meili_client
from app.services.search_index_generation_service import SearchIndexSyncError, rebuild_index


def _configure_inspiration_index(index):
    yield index.update_searchable_attributes(
        ["title", "description", "category", "tags", "source_name", "prompt_text", "snippet"]
    )
    yield index.update_filterable_attributes(["category", "tags"])


def _configure_templates_index(index):
    yield index.update_searchable_attributes(
        ["title", "prompt", "category", "subcategory", "tags", "snippet"]
    )
    yield index.update_filterable_attributes(["category", "subcategory", "tags"])


def sync_inspiration_index(db: Session) -> int:
    try:
        client = _meili_client()
    except Exception:
        raise SearchIndexSyncError("inspiration", "client_unavailable") from None
    return rebuild_index(db.get_bind(), "inspiration", client=client, configure=_configure_inspiration_index)


def sync_templates_index(db: Session) -> int:
    try:
        client = _meili_client()
    except Exception:
        raise SearchIndexSyncError("templates", "client_unavailable") from None
    return rebuild_index(db.get_bind(), "templates", client=client, configure=_configure_templates_index)
