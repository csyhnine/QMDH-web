"""Optional Meilisearch index sync helpers."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.search.index_hooks import build_inspiration_document, build_template_document
from app.integrations.search.service import _meili_client
from app.models import InspirationPost, PromptTemplate


def _configure_inspiration_index(index) -> None:
    index.update_searchable_attributes(
        ["title", "description", "category", "tags", "source_name", "prompt_text", "snippet"]
    )
    index.update_filterable_attributes(["category", "tags"])


def _configure_templates_index(index) -> None:
    index.update_searchable_attributes(
        ["title", "prompt", "category", "subcategory", "tags", "snippet"]
    )
    index.update_filterable_attributes(["category", "subcategory", "tags"])


def sync_inspiration_index(db: Session) -> int:
    client = _meili_client()
    if client is None:
        return 0

    posts = db.scalars(select(InspirationPost).order_by(InspirationPost.id.asc())).all()
    documents = [build_inspiration_document(post) for post in posts]
    index = client.index(settings.meilisearch_inspiration_index)
    _configure_inspiration_index(index)
    index.update_documents(documents)
    return len(documents)


def sync_templates_index(db: Session) -> int:
    client = _meili_client()
    if client is None:
        return 0

    templates = db.scalars(
        select(PromptTemplate).where(PromptTemplate.scope == "shared").order_by(PromptTemplate.id.asc())
    ).all()
    documents = [build_template_document(template) for template in templates]
    index = client.index(settings.meilisearch_templates_index)
    _configure_templates_index(index)
    index.update_documents(documents)
    return len(documents)
