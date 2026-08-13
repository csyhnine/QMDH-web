"""Haodeya Seedance 2 private-avatar (virtual character) registration helpers."""

from __future__ import annotations

import json
from time import sleep
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy.orm import Session

from app.core.config import ImageProviderProfile
from app.services.model_registry import get_image_provider_profile, get_image_provider_profiles
from app.services.provider_adapters.video_common import resolve_public_media_url

PRIVATE_AVATAR_GROUPS_PATH = "/videos/doubao-seedance-2-0/private-avatar/groups"
PRIVATE_AVATAR_ASSETS_PATH = "/videos/doubao-seedance-2-0/private-avatar/assets"

_ACTIVE = "active"
_FAILED = "failed"
_PROCESSING = "processing"


class SeedancePrivateAvatarError(ValueError):
    """Raised when private-avatar registration or polling fails."""


def is_asset_protocol_url(value: str) -> bool:
    return str(value or "").strip().lower().startswith("asset://")


def resolve_seedance_image_provider_profile(
    db: Session,
    *,
    provider_name: str | None = None,
) -> ImageProviderProfile:
    if provider_name and provider_name.strip():
        try:
            return get_image_provider_profile(provider_name.strip(), db)
        except KeyError as exc:
            raise SeedancePrivateAvatarError(f"未找到模型配置：{provider_name}") from exc

    for profile in get_image_provider_profiles(db).values():
        model = (profile.model_name or "").strip().lower()
        pname = (profile.provider_name or "").strip().lower()
        if model.startswith("seedance-2") or "haodeya_seedance" in pname or pname == "seedance-2":
            return profile
    raise SeedancePrivateAvatarError("未找到可用的 Seedance 2 模型配置，请先在 Admin 启用 Seedance 2。")


def _haodeya_headers(profile: ImageProviderProfile) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {profile.api_key}",
        "Content-Type": "application/json",
    }


def _api_root(profile: ImageProviderProfile) -> str:
    return profile.base_url.rstrip("/")


def _request_json(
    profile: ImageProviderProfile,
    *,
    method: str,
    path: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{_api_root(profile)}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(url=url, data=data, headers=_haodeya_headers(profile), method=method)
    try:
        with urlopen(request, timeout=min(float(profile.timeout_seconds or 60), 120.0)) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            detail = str(exc)
        raise SeedancePrivateAvatarError(
            f"虚拟人像上游 HTTP {exc.code}: {detail or exc.reason}"
        ) from exc
    except URLError as exc:
        raise SeedancePrivateAvatarError(f"虚拟人像上游网络错误：{exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise SeedancePrivateAvatarError("虚拟人像上游返回了无法解析的 JSON") from exc

    if not isinstance(payload, dict):
        raise SeedancePrivateAvatarError(f"虚拟人像上游返回异常：{payload!r}")
    return payload


def _unwrap_data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    if isinstance(data, dict):
        return data
    # Some gateways may flatten fields onto the root.
    return payload


def create_private_avatar_group(
    profile: ImageProviderProfile,
    *,
    name: str,
    description: str = "",
) -> dict[str, Any]:
    payload = _request_json(
        profile,
        method="POST",
        path=PRIVATE_AVATAR_GROUPS_PATH,
        body={"name": name, "description": description or ""},
    )
    data = _unwrap_data(payload)
    group_id = str(data.get("group_id") or "").strip()
    if not group_id:
        raise SeedancePrivateAvatarError(f"创建虚拟人像素材组失败：{payload}")
    return {"group_id": group_id, "raw": data}


def upload_private_avatar_asset(
    profile: ImageProviderProfile,
    *,
    group_id: str,
    source_url: str,
    name: str = "",
    description: str = "",
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "group_id": group_id,
        "asset_type": "image",
        "source_url": source_url,
    }
    if name.strip():
        body["name"] = name.strip()
    if description.strip():
        body["description"] = description.strip()
    payload = _request_json(
        profile,
        method="POST",
        path=PRIVATE_AVATAR_ASSETS_PATH,
        body=body,
    )
    data = _unwrap_data(payload)
    asset_id = str(data.get("asset_id") or "").strip()
    asset_url = str(data.get("asset_url") or "").strip()
    status = str(data.get("status") or _PROCESSING).strip().lower() or _PROCESSING
    if not asset_id:
        raise SeedancePrivateAvatarError(f"上传虚拟人像素材失败：{payload}")
    if not asset_url:
        asset_url = f"asset://{asset_id}"
    return {
        "asset_id": asset_id,
        "asset_url": asset_url,
        "group_id": str(data.get("group_id") or group_id).strip(),
        "status": status,
        "raw": data,
    }


def get_private_avatar_asset(profile: ImageProviderProfile, asset_id: str) -> dict[str, Any]:
    normalized_id = str(asset_id or "").strip()
    if not normalized_id:
        raise SeedancePrivateAvatarError("asset_id 不能为空")
    payload = _request_json(
        profile,
        method="GET",
        path=f"{PRIVATE_AVATAR_ASSETS_PATH}/{normalized_id}",
    )
    data = _unwrap_data(payload)
    status = str(data.get("status") or "").strip().lower() or _PROCESSING
    asset_url = str(data.get("asset_url") or "").strip() or f"asset://{normalized_id}"
    return {
        "asset_id": str(data.get("asset_id") or normalized_id).strip(),
        "asset_url": asset_url,
        "group_id": str(data.get("group_id") or "").strip(),
        "status": status,
        "raw": data,
    }


def register_private_avatar_from_source(
    profile: ImageProviderProfile,
    *,
    source_path: str,
    name: str = "",
    group_name: str = "",
    description: str = "",
) -> dict[str, Any]:
    """Create group + upload asset. Returns processing/active/failed snapshot (no long poll)."""
    normalized = str(source_path or "").strip()
    if not normalized:
        raise SeedancePrivateAvatarError("缺少参考图路径")
    if is_asset_protocol_url(normalized):
        return {
            "asset_id": normalized.removeprefix("asset://").removeprefix("ASSET://"),
            "asset_url": normalized if normalized.startswith("asset://") else f"asset://{normalized}",
            "group_id": "",
            "status": _ACTIVE,
            "source_url": "",
        }

    source_url = resolve_public_media_url(normalized)
    if not source_url.startswith("https://"):
        raise SeedancePrivateAvatarError(
            "虚拟人像入库需要公网 HTTPS 参考图 URL；当前无法解析为可访问地址。"
        )

    group = create_private_avatar_group(
        profile,
        name=group_name.strip() or f"qmdh-avatar-{name.strip() or 'ref'}",
        description=description or "QMDH Studio Seedance private-avatar",
    )
    uploaded = upload_private_avatar_asset(
        profile,
        group_id=group["group_id"],
        source_url=source_url,
        name=name or "studio-reference",
    )
    return {
        **uploaded,
        "source_url": source_url,
    }


def wait_private_avatar_active(
    profile: ImageProviderProfile,
    asset_id: str,
    *,
    timeout_seconds: float = 90.0,
    poll_interval_seconds: float = 3.0,
) -> dict[str, Any]:
    deadline = max(float(timeout_seconds), 5.0)
    elapsed = 0.0
    last: dict[str, Any] | None = None
    while elapsed <= deadline:
        last = get_private_avatar_asset(profile, asset_id)
        status = str(last.get("status") or "").lower()
        if status == _ACTIVE:
            return last
        if status == _FAILED:
            raise SeedancePrivateAvatarError(
                "虚拟人像审核未通过（failed）。请换一张明确为虚拟角色的图后重试；"
                "若仍失败请联系上游确认 private-avatar 审核规则。"
            )
        sleep(poll_interval_seconds)
        elapsed += poll_interval_seconds
    raise SeedancePrivateAvatarError(
        f"虚拟人像审核超时（仍为 {last.get('status') if last else 'unknown'}）。"
        "请稍后在 Studio 等待「已可用」再提交，或换图重试。"
    )


def ensure_seedance_reference_asset_url(
    profile: ImageProviderProfile,
    reference_path: str,
    *,
    poll: bool = True,
) -> str:
    """Resolve a Studio reference path to asset:// for Seedance image_with_roles."""
    normalized = str(reference_path or "").strip()
    if not normalized:
        raise SeedancePrivateAvatarError("缺少参考图")
    if is_asset_protocol_url(normalized):
        return normalized if normalized.startswith("asset://") else f"asset://{normalized.split('://', 1)[-1]}"

    registered = register_private_avatar_from_source(profile, source_path=normalized)
    status = str(registered.get("status") or "").lower()
    asset_url = str(registered.get("asset_url") or "").strip()
    asset_id = str(registered.get("asset_id") or "").strip()
    if status == _ACTIVE and asset_url:
        return asset_url
    if status == _FAILED:
        raise SeedancePrivateAvatarError("虚拟人像审核未通过，无法用于 Seedance 生成。")
    if not poll:
        raise SeedancePrivateAvatarError("虚拟人像仍在审核中，请等待「已可用」后再生成。")
    ready = wait_private_avatar_active(profile, asset_id)
    return str(ready.get("asset_url") or f"asset://{asset_id}")
