from app.integrations.search.index_hooks import (
    build_inspiration_document,
    build_template_document,
    delete_inspiration_post,
    delete_shared_template,
    upsert_inspiration_post,
    upsert_shared_template,
)
from app.integrations.search.service import SearchHit, check_meilisearch_health, get_search_engine_name, search_domain
from app.integrations.search.sync import sync_inspiration_index, sync_templates_index

__all__ = [
    "SearchHit",
    "build_inspiration_document",
    "build_template_document",
    "check_meilisearch_health",
    "delete_inspiration_post",
    "delete_shared_template",
    "get_search_engine_name",
    "search_domain",
    "sync_inspiration_index",
    "sync_templates_index",
    "upsert_inspiration_post",
    "upsert_shared_template",
]
