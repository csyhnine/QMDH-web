"""Reference building massing → inspiration/template retrieval (ref-intent-001 MVP)."""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.integrations.search.service import SearchHit, search_domain


@dataclass(frozen=True)
class RefIntentHit:
    domain: str
    id: int
    title: str
    snippet: str
    category: str
    tags: tuple[str, ...]
    score: float
    match_reason: str


@dataclass(frozen=True)
class RefIntentMatchResult:
    query_used: str
    reference_image: str
    hits: tuple[RefIntentHit, ...]
    empty_reason: str = ""


def _tokenize(text: str) -> list[str]:
    cleaned = (text or "").strip().lower()
    if not cleaned:
        return []
    parts = re.split(r"[\s,，。；;、/|+]+", cleaned)
    return [part for part in parts if len(part) >= 2][:24]


def _basename_hints(reference_image: str) -> list[str]:
    path = (reference_image or "").strip().split("/")[-1]
    stem = re.sub(r"\.[a-zA-Z0-9]{2,5}$", "", path)
    stem = re.sub(r"[-_]+", " ", stem).strip()
    return _tokenize(stem)


def _build_search_query(*, description: str, reference_image: str) -> str:
    tokens = _tokenize(description)
    tokens.extend(_basename_hints(reference_image))
    if not tokens:
        return description.strip()
    # Preserve user phrase first, then dedupe tokens.
    ordered: list[str] = []
    seen: set[str] = set()
    if description.strip():
        ordered.append(description.strip())
    for token in tokens:
        if token in seen:
            continue
        seen.add(token)
        ordered.append(token)
    return " ".join(ordered[:12])


def _to_hit(hit: SearchHit, *, match_reason: str) -> RefIntentHit:
    return RefIntentHit(
        domain=hit.domain,
        id=hit.id,
        title=hit.title,
        snippet=hit.snippet,
        category=hit.category,
        tags=hit.tags,
        score=hit.score,
        match_reason=match_reason,
    )


def match_reference_intent(
    db: Session,
    *,
    description: str = "",
    reference_image: str = "",
    limit: int = 12,
) -> RefIntentMatchResult:
    cleaned_description = (description or "").strip()
    cleaned_reference = (reference_image or "").strip()
    if not cleaned_description and not cleaned_reference:
        return RefIntentMatchResult(
            query_used="",
            reference_image="",
            hits=(),
            empty_reason="请提供参考建筑描述或 reference_image 路径。",
        )

    query_used = _build_search_query(description=cleaned_description, reference_image=cleaned_reference)
    per_domain = max(4, min(limit, 20))
    inspiration_hits = search_domain(db, domain="inspiration", query=query_used, limit=per_domain)
    template_hits = search_domain(db, domain="templates", query=query_used, limit=per_domain)

    merged: list[RefIntentHit] = []
    for hit in inspiration_hits:
        merged.append(_to_hit(hit, match_reason="inspiration_match"))
    for hit in template_hits:
        merged.append(_to_hit(hit, match_reason="template_match"))

    merged.sort(key=lambda item: (-item.score, item.domain, item.id))
    capped = merged[: max(1, min(limit, 24))]

    if not capped:
        return RefIntentMatchResult(
            query_used=query_used,
            reference_image=cleaned_reference,
            hits=(),
            empty_reason="未找到匹配的意向图或模板，可尝试补充体量/材质/场景描述。",
        )

    return RefIntentMatchResult(
        query_used=query_used,
        reference_image=cleaned_reference,
        hits=tuple(capped),
    )
