from base64 import b64decode
from datetime import datetime
from random import randint
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import can_access_project, ensure_project_access, get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import Asset
from app.schemas import AssetOut, ReferenceUploadIn, ReferenceUploadOut
from app.services.media_storage import write_binary_asset

router = APIRouter(prefix="/assets", tags=["assets"])


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
        return b64decode(matched.group(1), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Reference image payload is invalid") from exc


@router.get("", response_model=list[AssetOut])
def list_assets(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[Asset]:
    assets = db.scalars(select(Asset).order_by(Asset.created_at.desc())).all()
    return [
        asset
        for asset in assets
        if asset.project is None or can_access_project(auth_user, asset.project.code)
    ]


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
    return ReferenceUploadOut(file_name=payload.file_name, storage_path=storage_path)


@router.post("/{asset_id}/like", response_model=AssetOut, status_code=status.HTTP_200_OK)
def like_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.project:
        ensure_project_access(auth_user, asset.project.code)
    asset.like_count += 1
    db.commit()
    db.refresh(asset)
    return asset


@router.post("/{asset_id}/share", response_model=AssetOut, status_code=status.HTTP_200_OK)
def share_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Asset:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.project:
        ensure_project_access(auth_user, asset.project.code)
    asset.share_count += 1
    db.commit()
    db.refresh(asset)
    return asset
