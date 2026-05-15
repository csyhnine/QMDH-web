from __future__ import annotations

from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import InspirationPost
from app.schemas import ExtractImagesIn, ExtractImagesOut, InspirationPostCreate, InspirationPostOut, InspirationPostUpdate
from app.services.inspiration_media import prepare_inspiration_image
from app.services.media_storage import resolve_storage_path

router = APIRouter(prefix="/inspiration", tags=["inspiration"])

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


def _to_out(post: InspirationPost) -> InspirationPostOut:
    return InspirationPostOut(
        id=post.id,
        title=post.title,
        description=post.description,
        image_path=resolve_storage_path(post.image_path) if post.image_path else "",
        category=post.category,
        tags=post.tags or [],
        source_type=post.source_type,
        source_name=post.source_name,
        source_url=post.source_url,
        prompt_text=post.prompt_text,
        model_name=post.model_name,
        like_count=post.like_count,
        view_count=post.view_count,
        user_name=post.user.display_name if post.user else None,
        created_at=post.created_at,
    )


@router.get("", response_model=list[InspirationPostOut])
def list_inspiration(
    category: str | None = None,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[InspirationPostOut]:
    query = select(InspirationPost).order_by(InspirationPost.created_at.desc())
    if category and category != "全部":
        query = query.where(InspirationPost.category == category)
    posts = db.scalars(query).all()
    return [_to_out(post) for post in posts]


@router.post("", response_model=InspirationPostOut, status_code=status.HTTP_201_CREATED)
def create_inspiration(
    payload: InspirationPostCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> InspirationPostOut:
    """Create an inspiration post. Users can share their generations, ops can import external references."""
    if payload.source_type == "external":
        require_ops_access(auth_user)

    managed_image_path = prepare_inspiration_image(
        payload.image_path,
        title=payload.title.strip(),
        source_url=payload.source_url.strip(),
        namespace="imports",
    )

    post = InspirationPost(
        title=payload.title.strip(),
        description=payload.description.strip(),
        image_path=managed_image_path,
        category=payload.category.strip() or "建筑",
        tags=[tag.strip() for tag in payload.tags if tag.strip()],
        source_type=payload.source_type,
        source_name=payload.source_name.strip(),
        source_url=payload.source_url.strip(),
        source_asset_id=payload.source_asset_id,
        prompt_text=payload.prompt_text,
        model_name=payload.model_name.strip(),
        user_id=auth_user.user_id,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return _to_out(post)


@router.post("/{post_id}/like", response_model=InspirationPostOut)
def like_inspiration(
    post_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> InspirationPostOut:
    post = db.get(InspirationPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.like_count += 1
    db.commit()
    db.refresh(post)
    return _to_out(post)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inspiration(
    post_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    require_ops_access(auth_user)
    post = db.get(InspirationPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post)
    db.commit()
    return Response(status_code=204)


@router.patch("/{post_id}", response_model=InspirationPostOut)
def update_inspiration(
    post_id: int,
    payload: InspirationPostUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> InspirationPostOut:
    """Update an inspiration post. Only ops+ can update."""
    require_ops_access(auth_user)
    post = db.get(InspirationPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "tags" and value is not None:
            value = [tag.strip() for tag in value if tag.strip()]
        elif field == "image_path" and value is not None:
            value = prepare_inspiration_image(
                str(value),
                title=update_data.get("title") or post.title,
                source_url=update_data.get("source_url") or post.source_url,
                namespace="imports",
            )
        setattr(post, field, value)

    db.commit()
    db.refresh(post)
    return _to_out(post)


@router.post("/extract-images", response_model=ExtractImagesOut)
async def extract_images_from_url(
    payload: ExtractImagesIn,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ExtractImagesOut:
    """Fetch a URL and extract all image URLs from the page. Ops+ only."""
    require_ops_access(auth_user)

    url = payload.url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="URL must start with http:// or https://")

    try:
        from bs4 import BeautifulSoup
    except ImportError:
        raise HTTPException(status_code=500, detail="beautifulsoup4 not installed")

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": _BROWSER_UA})
            resp.raise_for_status()
    except httpx.TimeoutException:
        raise HTTPException(status_code=422, detail="请求超时，无法访问该链接")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=422, detail=f"页面返回错误: {exc.response.status_code}")
    except Exception:
        raise HTTPException(status_code=422, detail="无法访问该链接")

    html = resp.text
    soup = BeautifulSoup(html, "html.parser")

    # Extract page title
    title_tag = soup.find("title")
    page_title = title_tag.get_text(strip=True) if title_tag else ""

    # Collect image URLs
    images: list[str] = []
    seen: set[str] = set()

    # og:image first (usually the best cover)
    for meta in soup.find_all("meta", attrs={"property": "og:image"}):
        content = (meta.get("content") or "").strip()
        if content and content not in seen:
            images.append(urljoin(url, content))
            seen.add(content)

    # img tags
    for img in soup.find_all("img"):
        # Skip small icons
        width = img.get("width", "")
        height = img.get("height", "")
        try:
            if width and int(str(width).replace("px", "")) < 100:
                continue
            if height and int(str(height).replace("px", "")) < 100:
                continue
        except (ValueError, TypeError):
            pass

        # Try data-src first (lazy loading), then src
        src = (img.get("data-src") or img.get("data-original") or img.get("src") or "").strip()
        if not src or src.startswith("data:"):
            continue

        abs_url = urljoin(url, src)
        if abs_url not in seen:
            images.append(abs_url)
            seen.add(abs_url)

    return ExtractImagesOut(images=images[:50], title=page_title)
