"""External reference page crawl + inspiration ingest (crawl-001 C2)."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.search.index_hooks import upsert_inspiration_post
from app.models import InspirationPost
from app.services.inspiration_media import prepare_inspiration_image
from app.services.reference_page_service import ReferencePageError, extract_reference_page
from app.services.url_safety import UnsafeUrlError, assert_public_http_url

DEFAULT_CRAWL_ALLOWED_DOMAINS: tuple[str, ...] = (
    "archdaily.com",
    "www.archdaily.com",
    "dezeen.com",
    "www.dezeen.com",
    "worldarchitects.com",
    "www.worldarchitects.com",
)


class CrawlIngestError(Exception):
    pass


class CrawlDomainNotAllowedError(CrawlIngestError):
    pass


@dataclass(frozen=True)
class CrawlImportResult:
    status: str  # created | duplicate | failed
    source_url: str
    inspiration_post_id: int | None = None
    title: str = ""
    image_path: str = ""
    message: str = ""


def get_crawl_allowed_domains() -> tuple[str, ...]:
    raw = (settings.crawl_allowed_domains or "").strip()
    if not raw:
        return DEFAULT_CRAWL_ALLOWED_DOMAINS
    domains = tuple(item.strip().lower().rstrip(".") for item in raw.split(",") if item.strip())
    return domains or DEFAULT_CRAWL_ALLOWED_DOMAINS


def _hostname_allowed(hostname: str, allowed_domains: tuple[str, ...]) -> bool:
    host = hostname.strip().lower().rstrip(".")
    if not host:
        return False
    for domain in allowed_domains:
        if host == domain or host.endswith(f".{domain}"):
            return True
    return False


def assert_crawl_domain_allowed(url: str) -> str:
    try:
        cleaned = assert_public_http_url(url)
    except UnsafeUrlError as exc:
        raise CrawlIngestError(str(exc)) from exc

    hostname = (urlparse(cleaned).hostname or "").strip()
    allowed = get_crawl_allowed_domains()
    if not _hostname_allowed(hostname, allowed):
        raise CrawlDomainNotAllowedError(
            f"域名未在抓取 allowlist 内：{hostname or 'unknown'}。"
            f"允许：{', '.join(allowed)}"
        )
    return cleaned


def normalize_source_url(url: str) -> str:
    cleaned = (url or "").strip()
    return cleaned.rstrip("/")


def find_inspiration_by_source_url(db: Session, source_url: str) -> InspirationPost | None:
    normalized = normalize_source_url(source_url)
    if not normalized:
        return None
    trailing = f"{normalized}/"
    return db.scalar(
        select(InspirationPost).where(
            or_(
                InspirationPost.source_url == normalized,
                InspirationPost.source_url == trailing,
            )
        )
    )


def import_reference_page_to_inspiration(
    db: Session,
    *,
    url: str,
    user_id: int | None,
    cover_image_url: str = "",
    category: str = "建筑",
    source_name: str = "",
) -> CrawlImportResult:
    try:
        cleaned_url = assert_crawl_domain_allowed(url)
        extracted = extract_reference_page(cleaned_url)
    except (CrawlIngestError, ReferencePageError) as exc:
        return CrawlImportResult(status="failed", source_url=url, message=str(exc))

    source_url = normalize_source_url(extracted.source_url)
    existing = find_inspiration_by_source_url(db, source_url)
    if existing is not None:
        return CrawlImportResult(
            status="duplicate",
            source_url=source_url,
            inspiration_post_id=existing.id,
            title=existing.title,
            message="该 source_url 已入库，跳过重复导入",
        )

    cover = (cover_image_url or "").strip()
    if not cover and extracted.images:
        cover = extracted.images[0]
    if not cover:
        return CrawlImportResult(
            status="failed",
            source_url=source_url,
            title=extracted.title,
            message="页面未找到可用封面图",
        )

    title = (extracted.title or source_url).strip()[:150] or "External Reference"
    try:
        managed_image_path = prepare_inspiration_image(
            cover,
            title=title,
            source_url=source_url,
            namespace="external",
        )
    except (UnsafeUrlError, ValueError) as exc:
        return CrawlImportResult(status="failed", source_url=source_url, title=title, message=str(exc))

    hostname = (urlparse(source_url).hostname or "").strip()
    post = InspirationPost(
        title=title,
        description=f"Imported from {source_url}",
        image_path=managed_image_path,
        category=(category or "建筑").strip() or "建筑",
        tags=["外网参考", "crawl"],
        source_type="external",
        source_name=(source_name or hostname or "external").strip(),
        source_url=source_url,
        user_id=user_id,
    )
    db.add(post)
    db.flush()
    upsert_inspiration_post(post)
    db.commit()
    db.refresh(post)

    return CrawlImportResult(
        status="created",
        source_url=source_url,
        inspiration_post_id=post.id,
        title=post.title,
        image_path=post.image_path,
        message="外网参考已入库",
    )


def import_reference_pages_batch(
    db: Session,
    *,
    urls: list[str],
    user_id: int | None,
) -> list[CrawlImportResult]:
    results: list[CrawlImportResult] = []
    for url in urls:
        cleaned = (url or "").strip()
        if not cleaned:
            continue
        results.append(import_reference_page_to_inspiration(db, url=cleaned, user_id=user_id))
    return results
