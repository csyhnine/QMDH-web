from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
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
from app.services.seedance_real_avatar import (
    SeedanceRealAvatarError,
    complete_real_avatar_registration,
    get_real_avatar_asset,
    start_real_avatar_verification,
    store_verify_callback,
)

router = APIRouter(prefix="/seedance", tags=["seedance-avatar"])


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
    kind: str = "private"


class SeedanceRealAvatarVerifyStartIn(BaseModel):
    provider_name: str = Field(default="", max_length=100)


class SeedanceRealAvatarVerifyStartOut(BaseModel):
    task_id: str
    h5_link: str
    byted_token: str = ""
    expires_at: Any = None
    status: str = ""
    callback_url: str = ""


class SeedanceRealAvatarRegisterIn(BaseModel):
    verify_task_id: str = Field(..., min_length=1, max_length=200)
    storage_path: str = Field(default="", max_length=1024)
    source_url: str = Field(default="", max_length=2048)
    name: str = Field(default="", max_length=150)
    provider_name: str = Field(default="", max_length=100)


@router.post("/private-avatar/register", response_model=SeedancePrivateAvatarAssetOut)
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
            description="QMDH Studio Seedance private-avatar manual register",
        )
    except SeedancePrivateAvatarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"虚拟人像入库失败：{exc}") from exc

    return SeedancePrivateAvatarAssetOut(
        asset_id=str(result.get("asset_id") or ""),
        asset_url=str(result.get("asset_url") or ""),
        group_id=str(result.get("group_id") or ""),
        status=str(result.get("status") or "processing"),
        source_url=str(result.get("source_url") or ""),
        kind="private",
    )


@router.get("/private-avatar/assets/{asset_id}", response_model=SeedancePrivateAvatarAssetOut)
def get_seedance_private_avatar_asset(
    asset_id: str,
    provider_name: str = "",
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SeedancePrivateAvatarAssetOut:
    del auth_user
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
        kind="private",
    )


@router.post("/real-avatar/verify-tasks", response_model=SeedanceRealAvatarVerifyStartOut)
def start_seedance_real_avatar_verify(
    payload: SeedanceRealAvatarVerifyStartIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SeedanceRealAvatarVerifyStartOut:
    try:
        profile = resolve_seedance_image_provider_profile(
            db, provider_name=payload.provider_name or None
        )
        biz_id = f"qmdh-{auth_user.user_id or auth_user.name or 'user'}"
        result = start_real_avatar_verification(profile, biz_id=biz_id)
    except SeedanceRealAvatarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"发起真人认证失败：{exc}") from exc

    return SeedanceRealAvatarVerifyStartOut(
        task_id=str(result.get("task_id") or ""),
        h5_link=str(result.get("h5_link") or ""),
        byted_token=str(result.get("byted_token") or ""),
        expires_at=result.get("expires_at"),
        status=str(result.get("status") or ""),
        callback_url=str(result.get("callback_url") or ""),
    )


@router.api_route("/real-avatar/callback", methods=["GET", "POST"])
async def seedance_real_avatar_callback(request: Request) -> dict[str, str]:
    """Upstream H5 posts resultCode/bytedToken (query or form/json)."""
    params = dict(request.query_params)
    body: dict[str, Any] = {}
    if request.method == "POST":
        content_type = (request.headers.get("content-type") or "").lower()
        try:
            if "application/json" in content_type:
                parsed = await request.json()
                if isinstance(parsed, dict):
                    body = parsed
            else:
                form = await request.form()
                body = {str(k): str(v) for k, v in form.items()}
        except Exception:  # noqa: BLE001
            body = {}

    merged = {**body, **params}
    task_id = str(
        merged.get("task_id")
        or merged.get("taskId")
        or merged.get("biz_id")
        or merged.get("bizId")
        or ""
    ).strip()
    result_code = str(merged.get("resultCode") or merged.get("result_code") or "").strip()
    byted_token = str(merged.get("bytedToken") or merged.get("byted_token") or "").strip()

    # Some callbacks only return tokens; keep whatever we can.
    if task_id and result_code:
        try:
            store_verify_callback(task_id, result_code=result_code, byted_token=byted_token)
        except Exception:  # noqa: BLE001 — never fail the upstream callback
            pass
    return {"ok": "1"}


@router.post("/real-avatar/register", response_model=SeedancePrivateAvatarAssetOut)
def register_seedance_real_avatar(
    payload: SeedanceRealAvatarRegisterIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SeedancePrivateAvatarAssetOut:
    del auth_user
    source = (payload.source_url or payload.storage_path or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="storage_path 或 source_url 必填")
    try:
        profile = resolve_seedance_image_provider_profile(
            db, provider_name=payload.provider_name or None
        )
        result = complete_real_avatar_registration(
            profile,
            task_id=payload.verify_task_id,
            source_path=source,
            name=payload.name or "studio-real-reference",
        )
    except SeedanceRealAvatarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"真人入库失败：{exc}") from exc

    return SeedancePrivateAvatarAssetOut(
        asset_id=str(result.get("asset_id") or ""),
        asset_url=str(result.get("asset_url") or ""),
        group_id=str(result.get("group_id") or ""),
        status=str(result.get("status") or "processing"),
        source_url=str(result.get("source_url") or ""),
        kind="real",
    )


@router.get("/real-avatar/assets/{asset_id}", response_model=SeedancePrivateAvatarAssetOut)
def get_seedance_real_avatar_asset(
    asset_id: str,
    provider_name: str = "",
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> SeedancePrivateAvatarAssetOut:
    del auth_user
    try:
        profile = resolve_seedance_image_provider_profile(db, provider_name=provider_name or None)
        result = get_real_avatar_asset(profile, asset_id)
    except SeedanceRealAvatarError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"查询真人素材失败：{exc}") from exc

    return SeedancePrivateAvatarAssetOut(
        asset_id=str(result.get("asset_id") or asset_id),
        asset_url=str(result.get("asset_url") or f"asset://{asset_id}"),
        group_id=str(result.get("group_id") or ""),
        status=str(result.get("status") or "processing"),
        source_url="",
        kind="real",
    )
