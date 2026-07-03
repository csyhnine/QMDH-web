"""Incremental Meilisearch index updates for inspiration and shared templates."""

from __future__ import annotations

from app.core.config import settings
from app.integrations.search.service import _meili_client
from app.models import InspirationPost, PromptTemplate


def build_inspiration_document(post: InspirationPost) -> dict:
    return {
        "id": post.id,
        "title": post.title,
        "description": post.description or "",
        "category": post.category or "",
        "tags": post.tags or [],
        "source_name": post.source_name or "",
        "source_url": post.source_url or "",
        "prompt_text": post.prompt_text or "",
        "snippet": (post.description or post.prompt_text or post.source_name or "")[:240],
    }


def build_template_document(template: PromptTemplate) -> dict:
    return {
        "id": template.id,
        "title": template.title,
        "prompt": template.prompt,
        "category": template.category or "",
        "subcategory": template.subcategory or "",
        "tags": [template.subcategory] if template.subcategory else [],
        "snippet": (template.prompt or "")[:240],
    }


def upsert_inspiration_post(post: InspirationPost) -> bool:
    client = _meili_client()
    if client is None:
        return False
    index = client.index(settings.meilisearch_inspiration_index)
    index.update_documents([build_inspiration_document(post)])
    return True


def delete_inspiration_post(post_id: int) -> bool:
    client = _meili_client()
    if client is None:
        return False
    index = client.index(settings.meilisearch_inspiration_index)
    index.delete_document(post_id)
    return True


def upsert_shared_template(template: PromptTemplate) -> bool:
    if template.scope != "shared":
        return False
    client = _meili_client()
    if client is None:
        return False
    index = client.index(settings.meilisearch_templates_index)
    index.update_documents([build_template_document(template)])
    return True


def delete_shared_template(template_id: int) -> bool:
    client = _meili_client()
    if client is None:
        return False
    index = client.index(settings.meilisearch_templates_index)
    index.delete_document(template_id)
    return True
