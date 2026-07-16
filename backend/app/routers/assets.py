from base64 import b64decode
from datetime import datetime
from random import randint
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import can_access_project, get_current_auth_user, get_optional_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import Asset, AssetBookmark, AssetType, InspirationPost, Project, ProviderCall, Task
from app.schemas import AssetOut, AssetShareIn, AssetShareOut, ReferenceUploadIn, ReferenceUploadOut
from app.services.media_storage import resolve_storage_path, write_binary_asset

router = APIRouter(prefix="/assets", tags=["assets"])

MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024


def _owned_task_ids(db: Session, auth_user: AuthUserProfile) -> set[int]:
    query = select(Task.id).join(Task.project).where(Task.deleted_at.is_(None))
    if auth_user.user_id is not None:
        query = query.where(Task.user_id == auth_user.user_id)
    else:
        query = query.where(Task.user.has(name=auth_user.name))
    if "*" not in auth_user.project_codes:
        query = query.where(Project.code.in_(auth_user.project_codes))
    return set(db.scalars(query).all())


def _can_access_asset(
    asset: Asset,
    *,
    auth_user: AuthUserProfile,
    owned_task_ids: set[int],
) -> bool:
    if asset.source_task_id is None:
        if asset.project is None:
            return False
        return can_access_project(auth_user, asset.project.code)
    if asset.source_task_id not in owned_task_ids:
        return False
    if asset.project is None:
        return True
    return can_access_project(auth_user, asset.project.code)


def _ensure_asset_access(
    asset: Asset,
    *,
    auth_user: AuthUserProfile,
    db: Session,
) -> None:
    owned_task_ids = _owned_task_ids(db, auth_user)
    if not _can_access_asset(asset, auth_user=auth_user, owned_task_ids=owned_task_ids):
        raise HTTPException(status_code=403, detail="Asset access denied")


def _to_asset_out(db: Session, asset: Asset, auth_user: AuthUserProfile) -> AssetOut:
    is_bookmarked = False
    if auth_user.user_id:
        is_bookmarked = db.scalar(
            select(AssetBookmark).where(
                AssetBookmark.user_id == auth_user.user_id,
                AssetBookmark.asset_id == asset.id,
            )
        ) is not None
    inspiration_post = db.scalar(
        select(InspirationPost).where(InspirationPost.source_asset_id == asset.id).order_by(InspirationPost.id.asc())
    )

    out = AssetOut.model_validate(asset)
    out.storage_path = resolve_storage_path(asset.storage_path)
    out.is_bookmarked = is_bookmarked
    out.bookmark_count = len(asset.bookmarks)
    out.inspiration_post_id = inspiration_post.id if inspiration_post else None
    out.is_shared_to_inspiration = inspiration_post is not None
    return out


def _get_existing_inspiration_post(db: Session, asset_id: int) -> InspirationPost | None:
    return db.scalar(
        select(InspirationPost).where(InspirationPost.source_asset_id == asset_id).order_by(InspirationPost.id.asc())
    )


def _derive_inspiration_title(asset: Asset, task: Task | None) -> str:
    for candidate in (asset.name, task.title if task else None):
        text = (candidate or "").strip()
        if text:
            return text[:200]
    return f"Studio share #{asset.id}"


def _derive_inspiration_description(asset: Asset, task: Task | None) -> str:
    prompt_text = (asset.prompt_text or "").strip()
    task_title = (task.title or "").strip() if task else ""
    if prompt_text and task_title and task_title != asset.name:
        return f"{task_title}\n\n{prompt_text}"
    if prompt_text:
        return prompt_text
    if task_title and task_title != asset.name:
        return task_title
    return ""


def _derive_inspiration_model_name(db: Session, asset: Asset, task: Task | None) -> str:
    if asset.source_task_id is not None:
        provider_call = db.scalar(
            select(ProviderCall).where(ProviderCall.task_id == asset.source_task_id).order_by(ProviderCall.id.desc())
        )
        if provider_call and provider_call.model_name.strip():
            return provider_call.model_name.strip()
    if task:
        response_model = task.result.get("response_model")
        if isinstance(response_model, str) and response_model.strip():
            return response_model.strip()
        if task.requested_provider.strip():
            return task.requested_provider.strip()
    return ""


def _extract_reference_images(task: Task | None) -> list[str]:
    if task is None:
        return []

    for payload in (task.result, task.payload):
        if not isinstance(payload, dict):
            continue
        for key in ("reference_image_storage_paths", "reference_images", "source_images"):
            raw_value = payload.get(key)
            if isinstance(raw_value, list):
                values = [str(item or "").strip() for item in raw_value]
                cleaned = [value for value in values if value]
                if cleaned:
                    return cleaned[:4]
        for key in ("reference_image_storage_path", "reference_image", "source_image", "image"):
            value = str(payload.get(key) or "").strip()
            if value:
                return [value]
    return []


def _derive_inspiration_source_image_path(task: Task | None) -> str:
    reference_images = _extract_reference_images(task)
    return reference_images[0] if reference_images else ""


def _extension_for_reference_upload(file_name: str, data_url: str) -> str:
    normalized_name = file_name.lower().strip()
    if "." in normalized_name:
        suffix = normalized_name.rsplit(".", 1)[-1]
        if suffix in {"png", "jpg", "jpeg", "webp"}:
            return "jpeg" if suffix == "jpg" else suffix

    if data_url.startswith("data:image/png"):
        return "png"
    if data_url.startswith("data:image/jpeg") or data_url.startswith("data:image/jpg"):
        return "jpeg"
    if data_url.startswith("data:image/webp"):
        return "webp"
    raise HTTPException(status_code=400, detail="Unsupported reference image format")


def _decode_reference_upload(data_url: str) -> bytes:
    matched = re.match(r"^data:image/[a-zA-Z0-9.+-]+;base64,(.+)$", data_url)
    if not matched:
        raise HTTPException(status_code=400, detail="Reference image must be a base64 data URL")

    try:
        content = b64decode(matched.group(1), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Reference image payload is invalid") from exc
    if len(content) > MAX_REFERENCE_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Reference image must be 20MB or smaller",
        )
    return content


@router.get("", response_model=list[AssetOut])
def list_assets(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
    bookmarked: bool | None = None,
) -> list[AssetOut]:
    if auth_user is None:
        return []
    assets = db.scalars(select(Asset).order_by(Asset.created_at.desc())).all()
    owned_task_ids = _owned_task_ids(db, auth_user)
    accessible = [
        asset
        for asset in assets
        if _can_access_asset(asset, auth_user=auth_user, owned_task_ids=owned_task_ids)
    ]

    # Get current user's bookmarked asset IDs
    user_id = auth_user.user_id
    bookmarked_ids: set[int] = set()
    if user_id:
        bookmarked_ids = set(
            db.scalars(
                select(AssetBookmark.asset_id).where(AssetBookmark.user_id == user_id)
            ).all()
        )

    results = []
    for asset in accessible:
        is_bookmarked = asset.id in bookmarked_ids
        if bookmarked is True and not is_bookmarked:
            continue
        if bookmarked is False and is_bookmarked:
            continue
        out = _to_asset_out(db, asset, auth_user)
        out.is_bookmarked = is_bookmarked
        results.append(out)
    return results


@router.post("/reference-upload", response_model=ReferenceUploadOut, status_code=status.HTTP_201_CREATED)
def upload_reference_image(
    payload: ReferenceUploadIn,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ReferenceUploadOut:
    extension = _extension_for_reference_upload(payload.file_name, payload.data_url)
    content = _decode_reference_upload(payload.data_url)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_stub = "".join(char if char.isalnum() else "-" for char in payload.file_name.lower()).strip("-") or "reference"
    relative_path = f"references/{timestamp}-{safe_stub[:40]}-{randint(1000, 9999)}.{extension}"
    storage_path = write_binary_asset(relative_path, content)
    return ReferenceUploadOut(file_name=payload.file_name, storage_path=resolve_storage_path(storage_path))


@router.post("/{asset_id}/like", response_model=AssetOut, status_code=status.HTTP_200_OK)
def like_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AssetOut:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    _ensure_asset_access(asset, auth_user=auth_user, db=db)
    asset.like_count += 1
    db.commit()
    db.refresh(asset)
    return _to_asset_out(db, asset, auth_user)


@router.post("/{asset_id}/share", response_model=AssetShareOut, status_code=status.HTTP_200_OK)
def share_asset(
    asset_id: int,
    payload: AssetShareIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AssetShareOut:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    _ensure_asset_access(asset, auth_user=auth_user, db=db)

    existing_post = _get_existing_inspiration_post(db, asset.id)
    if existing_post:
        return AssetShareOut(
            asset=_to_asset_out(db, asset, auth_user),
            inspiration_post_id=existing_post.id,
            already_shared=True,
        )

    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Share confirmation required")

    task = db.get(Task, asset.source_task_id) if asset.source_task_id is not None else None
    source_image_path = _derive_inspiration_source_image_path(task)
    media_type = "video" if asset.asset_type == AssetType.video else "image"
    post = InspirationPost(
        title=_derive_inspiration_title(asset, task),
        description=_derive_inspiration_description(asset, task),
        source_image_path=source_image_path,
        image_path=asset.storage_path,
        media_type=media_type,
        category="\u5efa\u7b51",
        tags=list(dict.fromkeys(tag.strip() for tag in (asset.tags or []) if tag.strip())),
        source_type="user",
        source_name=task.requested_provider.strip() if task and task.requested_provider else "",
        source_url="",
        source_asset_id=asset.id,
        prompt_text=asset.prompt_text,
        model_name=_derive_inspiration_model_name(db, asset, task),
        user_id=auth_user.user_id,
    )
    db.add(post)
    asset.share_count += 1
    db.commit()
    db.refresh(asset)
    db.refresh(post)
    return AssetShareOut(
        asset=_to_asset_out(db, asset, auth_user),
        inspiration_post_id=post.id,
        already_shared=False,
    )


@router.post("/{asset_id}/bookmark", response_model=AssetOut, status_code=status.HTTP_200_OK)
def toggle_bookmark(
    asset_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AssetOut:
    """Toggle bookmark for the current user. Returns updated asset with bookmark state."""
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    _ensure_asset_access(asset, auth_user=auth_user, db=db)

    user_id = auth_user.user_id
    if not user_id:
        raise HTTPException(status_code=400, detail="Bookmark requires a database user session")

    existing = db.scalar(
        select(AssetBookmark).where(
            AssetBookmark.user_id == user_id,
            AssetBookmark.asset_id == asset_id,
        )
    )
    if existing:
        db.delete(existing)
        is_bookmarked = False
    else:
        db.add(AssetBookmark(user_id=user_id, asset_id=asset_id))
        is_bookmarked = True

    db.commit()
    db.refresh(asset)
    out = _to_asset_out(db, asset, auth_user)
    out.is_bookmarked = is_bookmarked
    return out
