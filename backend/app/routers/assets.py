from base64 import b64decode
from datetime import datetime
from random import randint
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import can_access_project, get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import Asset, AssetBookmark, Project, Task
from app.schemas import AssetOut, ReferenceUploadIn, ReferenceUploadOut
from app.services.media_storage import resolve_storage_path, write_binary_asset

router = APIRouter(prefix="/assets", tags=["assets"])

MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024


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

    out = AssetOut.model_validate(asset)
    out.storage_path = resolve_storage_path(asset.storage_path)
    out.is_bookmarked = is_bookmarked
    out.bookmark_count = len(asset.bookmarks)
    return out


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
            detail="Reference image must be 10MB or smaller",
        )
    return content


@router.get("", response_model=list[AssetOut])
def list_assets(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    bookmarked: bool | None = None,
) -> list[AssetOut]:
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


@router.post("/{asset_id}/share", response_model=AssetOut, status_code=status.HTTP_200_OK)
def share_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AssetOut:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    _ensure_asset_access(asset, auth_user=auth_user, db=db)
    asset.share_count += 1
    db.commit()
    db.refresh(asset)
    return _to_asset_out(db, asset, auth_user)


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
