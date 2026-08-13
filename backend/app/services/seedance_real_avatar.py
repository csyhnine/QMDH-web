"""Haodeya Seedance 2 real-avatar (real person) registration helpers."""

from __future__ import annotations

import json
from time import sleep
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from redis import Redis

from app.core.config import ImageProviderProfile, settings
from app.services.provider_adapters.video_common import resolve_public_media_url
from app.services.seedance_private_avatar import (
    SeedancePrivateAvatarError,
    is_asset_protocol_url,
)

REAL_AVATAR_VERIFY_TASKS_PATH = "/videos/doubao-seedance-2-0/real-avatar/verify-tasks"
REAL_AVATAR_VERIFY_RESULTS_PATH = "/videos/doubao-seedance-2-0/real-avatar/verify-results"
REAL_AVATAR_ASSETS_PATH = "/videos/doubao-seedance-2-0/real-avatar/assets"

_ACTIVE = "active"
_FAILED = "failed"
_REDIS_KEY_PREFIX = "qmdh:seedance:real-avatar:verify:"


class SeedanceRealAvatarError(SeedancePrivateAvatarError):
    """Raised when real-avatar verification or registration fails."""


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
    query: str = "",
) -> dict[str, Any]:
    url = f"{_api_root(profile)}{path}{query}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(url=url, data=data, headers=_haodeya_headers(profile), method=method)
    try:
        with urlopen(request, timeout=profile.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            detail = str(exc.reason)
        raise SeedanceRealAvatarError(f"真人人像上游 HTTP {exc.code}: {detail or exc.reason}") from exc
    except URLError as exc:
        raise SeedanceRealAvatarError(f"真人人像上游网络错误：{exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise SeedanceRealAvatarError("真人人像上游返回了无法解析的 JSON") from exc

    if not isinstance(payload, dict):
        raise SeedanceRealAvatarError(f"真人人像上游返回异常：{payload!r}")
    if payload.get("success") is False:
        raise SeedanceRealAvatarError(str(payload.get("message") or payload))
    return payload


def _data(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def public_api_base_url() -> str:
    base = (settings.public_media_base_url or settings.frontend_origin or "").strip().rstrip("/")
    if not base:
        raise SeedanceRealAvatarError("未配置 public_media_base_url / frontend_origin，无法生成真人认证回调地址")
    return f"{base}{settings.api_prefix}"


def real_avatar_callback_url() -> str:
    return f"{public_api_base_url()}/seedance/real-avatar/callback"


def _redis() -> Redis:
    return Redis.from_url(settings.redis_url, decode_responses=True)


def store_verify_callback(task_id: str, *, result_code: str, byted_token: str = "") -> None:
    key = f"{_REDIS_KEY_PREFIX}{task_id.strip()}"
    payload = json.dumps(
        {
            "task_id": task_id.strip(),
            "result_code": str(result_code or "").strip(),
            "byted_token": str(byted_token or "").strip(),
        },
        ensure_ascii=False,
    )
    _redis().setex(key, 60 * 60 * 6, payload)


def load_verify_callback(task_id: str) -> dict[str, str] | None:
    raw = _redis().get(f"{_REDIS_KEY_PREFIX}{task_id.strip()}")
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def create_real_avatar_verify_task(
    profile: ImageProviderProfile,
    *,
    biz_id: str,
    locale: str = "zh",
    callback_url: str | None = None,
) -> dict[str, Any]:
    payload = _request_json(
        profile,
        method="POST",
        path=REAL_AVATAR_VERIFY_TASKS_PATH,
        body={
            "callback_url": (callback_url or real_avatar_callback_url()).strip(),
            "locale": locale or "zh",
            "biz_id": biz_id.strip() or "qmdh-user",
        },
    )
    data = _data(payload)
    task_id = str(data.get("task_id") or "").strip()
    if not task_id:
        raise SeedanceRealAvatarError(f"创建真人认证任务失败：{payload}")
    return {
        "task_id": task_id,
        "status": str(data.get("status") or "").strip(),
        "callback_url": str(data.get("callback_url") or "").strip(),
        "raw": data,
    }


def get_real_avatar_verify_task(profile: ImageProviderProfile, task_id: str) -> dict[str, Any]:
    payload = _request_json(
        profile,
        method="GET",
        path=f"{REAL_AVATAR_VERIFY_TASKS_PATH}/{task_id.strip()}",
    )
    data = _data(payload)
    return {
        "task_id": str(data.get("task_id") or task_id).strip(),
        "status": str(data.get("status") or "").strip(),
        "h5_link": str(data.get("h5_link") or "").strip(),
        "byted_token": str(data.get("byted_token") or "").strip(),
        "expires_at": data.get("expires_at"),
        "raw": data,
    }


def get_real_avatar_verify_result(
    profile: ImageProviderProfile,
    *,
    task_id: str,
    result_code: str = "10000",
    byted_token: str = "",
) -> dict[str, Any]:
    params = [f"task_id={task_id.strip()}"]
    if result_code.strip():
        params.append(f"result_code={result_code.strip()}")
    if byted_token.strip():
        params.append(f"byted_token={byted_token.strip()}")
    payload = _request_json(
        profile,
        method="GET",
        path=REAL_AVATAR_VERIFY_RESULTS_PATH,
        query="?" + "&".join(params),
    )
    data = _data(payload)
    return {
        "task_id": str(data.get("task_id") or task_id).strip(),
        "byted_token": str(data.get("byted_token") or byted_token).strip(),
        "result_code": str(data.get("result_code") or result_code).strip(),
        "verify_status": str(data.get("verify_status") or "").strip().lower(),
        "group_id": str(data.get("group_id") or "").strip(),
        "raw": data,
    }


def upload_real_avatar_asset(
    profile: ImageProviderProfile,
    *,
    group_id: str,
    source_url: str,
    name: str = "",
) -> dict[str, Any]:
    payload = _request_json(
        profile,
        method="POST",
        path=REAL_AVATAR_ASSETS_PATH,
        body={
            "group_id": group_id.strip(),
            "asset_type": "image",
            "source_url": source_url.strip(),
            "name": (name or "studio-real-reference").strip(),
        },
    )
    data = _data(payload)
    asset_id = str(data.get("asset_id") or "").strip()
    if not asset_id:
        raise SeedanceRealAvatarError(f"上传真人素材失败：{payload}")
    asset_url = str(data.get("asset_url") or "").strip() or f"asset://{asset_id}"
    return {
        "asset_id": asset_id,
        "asset_url": asset_url,
        "group_id": str(data.get("group_id") or group_id).strip(),
        "status": str(data.get("status") or _PROCESSING).strip().lower() or _PROCESSING,
        "source_url": source_url,
        "raw": data,
    }


def get_real_avatar_asset(profile: ImageProviderProfile, asset_id: str) -> dict[str, Any]:
    payload = _request_json(
        profile,
        method="GET",
        path=f"{REAL_AVATAR_ASSETS_PATH}/{asset_id.strip()}",
    )
    data = _data(payload)
    status = str(data.get("status") or _PROCESSING).strip().lower() or _PROCESSING
    asset_url = str(data.get("asset_url") or "").strip() or f"asset://{asset_id}"
    return {
        "asset_id": str(data.get("asset_id") or asset_id).strip(),
        "asset_url": asset_url,
        "group_id": str(data.get("group_id") or "").strip(),
        "status": status,
        "raw": data,
    }


def start_real_avatar_verification(
    profile: ImageProviderProfile,
    *,
    biz_id: str,
) -> dict[str, Any]:
    created = create_real_avatar_verify_task(profile, biz_id=biz_id)
    detail = get_real_avatar_verify_task(profile, created["task_id"])
    if not detail.get("h5_link"):
        raise SeedanceRealAvatarError("未拿到真人认证 H5 链接，请稍后重试。")
    return {
        "task_id": detail["task_id"],
        "h5_link": detail["h5_link"],
        "byted_token": detail.get("byted_token") or "",
        "expires_at": detail.get("expires_at"),
        "status": detail.get("status") or created.get("status") or "",
        "callback_url": created.get("callback_url") or real_avatar_callback_url(),
    }


def complete_real_avatar_registration(
    profile: ImageProviderProfile,
    *,
    task_id: str,
    source_path: str,
    name: str = "",
) -> dict[str, Any]:
    """After H5 verify: resolve group_id, upload image asset."""
    normalized = str(source_path or "").strip()
    if not normalized:
        raise SeedanceRealAvatarError("缺少参考图路径")
    if is_asset_protocol_url(normalized):
        return {
            "asset_id": normalized.removeprefix("asset://").removeprefix("ASSET://"),
            "asset_url": normalized if normalized.lower().startswith("asset://") else f"asset://{normalized}",
            "group_id": "",
            "status": _ACTIVE,
            "source_url": "",
            "verify_task_id": task_id,
        }

    cached = load_verify_callback(task_id) or {}
    result_code = str(cached.get("result_code") or "10000").strip() or "10000"
    byted_token = str(cached.get("byted_token") or "").strip()
    result = get_real_avatar_verify_result(
        profile,
        task_id=task_id,
        result_code=result_code,
        byted_token=byted_token,
    )
    if result.get("verify_status") not in {"verified", "success", "passed"} and not result.get("group_id"):
        raise SeedanceRealAvatarError(
            "真人认证尚未通过。请先在 H5 页面完成认证，再点「认证完成，继续入库」。"
        )
    group_id = result.get("group_id") or ""
    if not group_id:
        raise SeedanceRealAvatarError("认证结果缺少 group_id，无法上传真人素材。")

    source_url = resolve_public_media_url(normalized)
    if not source_url.startswith("https://"):
        raise SeedanceRealAvatarError("真人入库需要公网 HTTPS 参考图 URL。")

    uploaded = upload_real_avatar_asset(
        profile,
        group_id=group_id,
        source_url=source_url,
        name=name or "studio-real-reference",
    )
    return {**uploaded, "verify_task_id": task_id}


def wait_real_avatar_active(
    profile: ImageProviderProfile,
    asset_id: str,
    *,
    timeout_seconds: float = 90,
    poll_interval_seconds: float = 3,
) -> dict[str, Any]:
    from time import monotonic

    started = monotonic()
    last: dict[str, Any] | None = None
    while monotonic() - started < timeout_seconds:
        last = get_real_avatar_asset(profile, asset_id)
        status = str(last.get("status") or "").lower()
        if status == _ACTIVE:
            return last
        if status == _FAILED:
            raise SeedanceRealAvatarError("真人素材审核未通过，请确认素材与认证人物一致后重试。")
        sleep(poll_interval_seconds)
    raise SeedanceRealAvatarError(
        f"真人素材审核超时（仍为 {last.get('status') if last else 'unknown'}）。"
    )
