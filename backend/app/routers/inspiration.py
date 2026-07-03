from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, has_content_ops_access, require_content_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.integrations.search.index_hooks import delete_inspiration_post, upsert_inspiration_post
from app.models import InspirationPost
from app.schemas import ExtractImagesIn, ExtractImagesOut, InspirationPostCreate, InspirationPostOut, InspirationPostUpdate
from app.services.inspiration_media import prepare_inspiration_image
from app.services.media_storage import resolve_storage_path
from app.services.reference_page_service import ReferencePageError, extract_reference_page

router = APIRouter(prefix="/inspiration", tags=["inspiration"])

def _can_edit_post(auth_user: AuthUserProfile, post: InspirationPost) -> bool:
    if has_content_ops_access(auth_user.role):
        return True
    if auth_user.user_id is None or post.user_id is None:
        return False
    return auth_user.user_id == post.user_id


def _to_out(post: InspirationPost) -> InspirationPostOut:
    return InspirationPostOut(
        id=post.id,
        title=post.title,
        description=post.description,
        source_image_path=resolve_storage_path(post.source_image_path) if post.source_image_path else "",
        image_path=resolve_storage_path(post.image_path) if post.image_path else "",
        media_type=(post.media_type or "image").strip() or "image",
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
    """Create an inspiration post. Designers can contribute references; admins retain full library control."""
    if payload.source_type not in {"external", "user"}:
        require_content_ops_access(auth_user)

    managed_image_path = prepare_inspiration_image(
        payload.image_path,
        title=payload.title.strip(),
        source_url=payload.source_url.strip(),
        namespace="imports",
    )
    managed_source_image_path = (
        prepare_inspiration_image(
            payload.source_image_path,
            title=f"{payload.title.strip()} source",
            source_url=payload.source_url.strip(),
            namespace="imports",
        )
        if payload.source_image_path.strip()
        else ""
    )

    post = InspirationPost(
        title=payload.title.strip(),
        description=payload.description.strip(),
        source_image_path=managed_source_image_path,
        image_path=managed_image_path,
        media_type=(payload.media_type or "image").strip() or "image",
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
    upsert_inspiration_post(post)
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
    require_content_ops_access(auth_user)
    post = db.get(InspirationPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post)
    db.commit()
    delete_inspiration_post(post_id)
    return Response(status_code=204)


@router.patch("/{post_id}", response_model=InspirationPostOut)
def update_inspiration(
    post_id: int,
    payload: InspirationPostUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> InspirationPostOut:
    """Update an inspiration post. Admins can edit all posts; designers can edit their own uploads."""
    post = db.get(InspirationPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if not _can_edit_post(auth_user, post):
        raise HTTPException(status_code=403, detail="Post update denied")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "tags" and value is not None:
            value = [tag.strip() for tag in value if tag.strip()]
        elif field == "source_image_path" and value is not None:
            value = prepare_inspiration_image(
                str(value),
                title=f"{update_data.get('title') or post.title} source",
                source_url=update_data.get("source_url") or post.source_url,
                namespace="imports",
            ) if str(value).strip() else ""
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
    upsert_inspiration_post(post)
    return _to_out(post)


@router.post("/extract-images", response_model=ExtractImagesOut)
async def extract_images_from_url(
    payload: ExtractImagesIn,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ExtractImagesOut:
    """Fetch a URL and extract candidate images for inspiration import."""
    del auth_user
    try:
        extracted = extract_reference_page(payload.url)
    except ReferencePageError as exc:
        detail = str(exc)
        status_code = 400 if "http" in detail.lower() or "url" in detail.lower() else 422
        raise HTTPException(status_code=status_code, detail=detail) from exc
    return ExtractImagesOut(images=list(extracted.images), title=extracted.title)
