from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.services.seedance_private_avatar import (
    SeedancePrivateAvatarError,
    get_private_avatar_asset,
    register_private_avatar_from_source,
    resolve_seedance_image_provider_profile,
)

router = APIRouter(prefix="/seedance/private-avatar", tags=["seedance-private-avatar"])


class SeedancePrivateAvatarRegisterIn(BaseModel):
    storage_path: str = Field(default="", max_length=1024)
    source_url: str = Field(default="", max_length=2048)
    name: str = Field(default="", max_length=150)
    provider_name: str = Field(default="", max_length=100)


class SeedancePrivateAvatarAssetOut(BaseModel):
    asset_id: str
    asset_url: str
    group_id: str = ""
    status: str
    source_url: str = ""


@router.post("/register", response_model=SeedancePrivateAvatarAssetOut)
def register_seedance_private_avatar(
    payload: SeedancePrivateAvatarRegisterIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SeedancePrivateAvatarAssetOut:
    source = (payload.source_url or payload.storage_path or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="storage_path 或 source_url 必填")
    try:
        profile = resolve_seedance_image_provider_profile(
            db, provider_name=payload.provider_name or None
        )
        stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        user_part = auth_user.user_id or auth_user.name or "user"
        result = register_private_avatar_from_source(
            profile,
            source_path=source,
            name=payload.name or "studio-reference",
            group_name=f"qmdh-{user_part}-{stamp}",
            description="QMDH Studio Seedance private-avatar auto register",
        )
    except SeedancePrivateAvatarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surface upstream/config failures to Studio
        raise HTTPException(status_code=502, detail=f"虚拟人像入库失败：{exc}") from exc

    return SeedancePrivateAvatarAssetOut(
        asset_id=str(result.get("asset_id") or ""),
        asset_url=str(result.get("asset_url") or ""),
        group_id=str(result.get("group_id") or ""),
        status=str(result.get("status") or "processing"),
        source_url=str(result.get("source_url") or ""),
    )


@router.get("/assets/{asset_id}", response_model=SeedancePrivateAvatarAssetOut)
def get_seedance_private_avatar_asset(
    asset_id: str,
    provider_name: str = "",
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SeedancePrivateAvatarAssetOut:
    del auth_user  # auth required; no per-user asset ACL at upstream yet
    try:
        profile = resolve_seedance_image_provider_profile(db, provider_name=provider_name or None)
        result = get_private_avatar_asset(profile, asset_id)
    except SeedancePrivateAvatarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"查询虚拟人像失败：{exc}") from exc

    return SeedancePrivateAvatarAssetOut(
        asset_id=str(result.get("asset_id") or asset_id),
        asset_url=str(result.get("asset_url") or f"asset://{asset_id}"),
        group_id=str(result.get("group_id") or ""),
        status=str(result.get("status") or "processing"),
        source_url="",
    )
