from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user, has_admin_access, require_ops_access
from app.core.config import AuthUserProfile, settings
from app.core.encryption import (
    EncryptedValueDecodeError,
    EncryptionKeyUnavailableError,
    decrypt_value_or_raise,
    encrypt_value,
    normalize_provider_api_key,
)
from app.database import get_db
from app.models import ProviderPricingRule, ProviderProfile
from app.schemas import (
    DiscoveredModel,
    ProviderBulkImportIn,
    ProviderBulkImportOut,
    ProviderCapability,
    ProviderDiscoverIn,
    ProviderDiscoverOut,
    ProviderPricingRuleCreate,
    ProviderPricingRuleOut,
    ProviderPricingRuleUpdate,
    ProviderProfileCreate,
    ProviderProfileProbeOut,
    ProviderProfileOut,
    ProviderProfileUpdate,
)
from app.services.model_registry import list_provider_capabilities
from app.services.provider_strategy import (
    CHAT_CAPABILITY,
    CHAT_COMPLETIONS_IMAGE_EDIT_STRATEGY,
    CHAT_COMPLETIONS_IMAGE_STRATEGY,
    CHAT_MODALITIES_IMAGE_EDIT_STRATEGY,
    CHAT_MODALITIES_IMAGE_STRATEGY,
    DASHSCOPE_ASYNC_VIDEO_STRATEGY,
    HAODEYA_GROK_VIDEO_STRATEGY,
    OPENAI_CHAT_STRATEGY,
    OPENAI_IMAGE_EDITS_STRATEGY,
    OPENAI_IMAGES_STRATEGY,
    HAODEYA_ASYNC_IMAGE_STRATEGY,
    VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY,
    VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY,
    normalize_provider_base_url,
    normalize_strategies,
    resolve_strategy_for_capability,
)

router = APIRouter(prefix="/providers", tags=["providers"])

_PROBE_IMAGE_DATA_URL = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="
)
_DASHSCOPE_VIDEO_PROBE_ENDPOINT = "/services/aigc/video-generation/video-synthesis"
_ARK_VIDEO_PROBE_ENDPOINT = "/contents/generations/tasks"
_HAODEYA_GROK_VIDEO_PROBE_ENDPOINT = "/videos"


@router.get("", response_model=list[ProviderCapability])
def get_providers(db: Session = Depends(get_db)) -> list[ProviderCapability]:
    return [
        ProviderCapability(
            provider_name=item.provider_name,
            display_name=item.display_name,
            model_name=item.model_name,
            capabilities=item.capabilities,
            configurable=item.configurable,
            outbound=item.outbound,
            adapter_kind=item.adapter_kind,
        )
        for item in list_provider_capabilities(db, include_static=False)
    ]


def _mask_api_key(api_key: str) -> str:
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "*" * len(api_key)
    return f"{api_key[:4]}...{api_key[-4:]}"


def _require_provider_admin(auth_user: AuthUserProfile) -> None:
    if not has_admin_access(auth_user.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Provider profile admin access required")


def _require_encryption_key_configured(action: str) -> None:
    if settings.encryption_key.strip():
        return
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"QMDH_ENCRYPTION_KEY is not configured, so provider API keys cannot be {action}.",
    )


def _to_profile_out(profile: ProviderProfile) -> ProviderProfileOut:
    decrypted_key = ""
    has_stored_key = bool(profile.api_key)

    try:
        decrypted_key = normalize_provider_api_key(decrypt_value_or_raise(profile.api_key))
    except (EncryptionKeyUnavailableError, EncryptedValueDecodeError):
        decrypted_key = ""

    masked_api_key = _mask_api_key(decrypted_key)
    if has_stored_key and not decrypted_key:
        masked_api_key = "[需重新录入]"

    return ProviderProfileOut(
        id=profile.id,
        provider_name=profile.provider_name,
        display_name=(profile.display_name or profile.model_name or profile.provider_name).strip(),
        base_url=profile.base_url,
        model_name=profile.model_name,
        adapter_kind=profile.adapter_kind,
        capabilities=profile.capabilities or ["image.generate"],
        strategies=normalize_strategies(profile.strategies or {}),
        adapter_config=profile.adapter_config or {},
        quality=profile.quality,
        output_format=profile.output_format,
        timeout_seconds=profile.timeout_seconds,
        pricing_currency=profile.pricing_currency or "CNY",
        pricing_unit=profile.pricing_unit or "per_image",
        unit_price=float(profile.unit_price or 0.0),
        enabled=profile.enabled,
        reference_mode=profile.reference_mode,
        reference_caption_model=profile.reference_caption_model,
        has_api_key=has_stored_key,
        masked_api_key=masked_api_key,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _to_pricing_rule_out(rule: ProviderPricingRule) -> ProviderPricingRuleOut:
    return ProviderPricingRuleOut(
        id=rule.id,
        provider_profile_id=rule.provider_profile_id,
        capability=rule.capability,
        metric=rule.metric,
        unit_size=float(rule.unit_size or 1_000_000.0),
        unit_price=float(rule.unit_price or 0.0),
        currency=(rule.currency or "USD").upper(),
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _build_probe_request(profile: ProviderProfile, api_key: str) -> tuple[str, str, dict[str, object], str]:
    base_url = profile.base_url.rstrip("/")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    probe_capability = next(
        (
            capability
            for capability in (CHAT_CAPABILITY, "image.generate", "image.edit", "video.generate")
            if capability in (profile.capabilities or [])
        ),
        None,
    )
    strategy = (
        resolve_strategy_for_capability(
            capability=probe_capability,
            provider_name=profile.provider_name,
            model_name=profile.model_name,
            base_url=profile.base_url,
            strategies=profile.strategies or {},
        )
        if probe_capability
        else None
    )

    if strategy == OPENAI_CHAT_STRATEGY:
        return (
            "POST",
            f"{base_url}/chat/completions",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "messages": [{"role": "user", "content": "ping"}],
                    "stream": False,
                    "max_tokens": 1,
                },
            },
            "Chat 接口可用，当前模型已通过最小请求校验。",
        )

    if strategy == HAODEYA_ASYNC_IMAGE_STRATEGY:
        return (
            "POST",
            f"{base_url}/images/generations",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "prompt": "ping",
                    "size": "1:1",
                    "resolution": "1k",
                    "quality": profile.quality or "high",
                    "response_format": "url",
                    "n": 1,
                },
            },
            "Haodeya 异步生图接口可用，当前模型已通过最小请求校验。",
        )

    if strategy == OPENAI_IMAGES_STRATEGY:
        return (
            "POST",
            f"{base_url}/images/generations",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "prompt": "ping",
                    "size": "1024x1024",
                    "quality": profile.quality or "medium",
                    "output_format": profile.output_format or "png",
                },
            },
            "图片生成接口可用，当前模型已通过最小请求校验。",
        )

    if strategy == OPENAI_IMAGE_EDITS_STRATEGY:
        return (
            "POST",
            f"{base_url}/images/edits",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "prompt": "ping",
                    "images": [{"image_url": _PROBE_IMAGE_DATA_URL}],
                    "size": "1024x1024",
                    "quality": profile.quality or "medium",
                    "output_format": profile.output_format or "png",
                },
            },
            "图片编辑接口可用，当前模型已通过最小请求校验。",
        )

    if strategy == CHAT_MODALITIES_IMAGE_STRATEGY:
        return (
            "POST",
            f"{base_url}/chat/completions",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "messages": [{"role": "user", "content": "ping"}],
                    "modalities": ["image", "text"],
                    "image_config": {"aspect_ratio": "1:1"},
                    "stream": False,
                },
            },
            "多模态生图接口可用，当前模型已通过最小请求校验。",
        )

    if strategy == CHAT_MODALITIES_IMAGE_EDIT_STRATEGY:
        return (
            "POST",
            f"{base_url}/chat/completions",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "ping"},
                                {"type": "image_url", "image_url": {"url": _PROBE_IMAGE_DATA_URL}},
                            ],
                        }
                    ],
                    "modalities": ["image", "text"],
                    "image_config": {"aspect_ratio": "1:1"},
                    "stream": False,
                },
            },
            "多模态图片编辑接口可用，当前模型已通过最小请求校验。",
        )

    if strategy == CHAT_COMPLETIONS_IMAGE_STRATEGY:
        return (
            "POST",
            f"{base_url}/chat/completions",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 256,
                    "stream": False,
                },
            },
            "CPA 风格 chat 生图接口可用，当前模型已通过最小请求校验。",
        )

    if strategy == CHAT_COMPLETIONS_IMAGE_EDIT_STRATEGY:
        return (
            "POST",
            f"{base_url}/chat/completions",
            {
                "headers": headers,
                "json": {
                    "model": profile.model_name,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "ping"},
                                {"type": "image_url", "image_url": {"url": _PROBE_IMAGE_DATA_URL}},
                            ],
                        }
                    ],
                    "max_tokens": 256,
                    "stream": False,
                },
            },
            "CPA 风格 chat 图片编辑接口可用，当前模型已通过最小请求校验。",
        )

    return (
        "GET",
        f"{base_url}/models",
        {"headers": headers},
        "模型服务已连通，当前 API Key 可读取模型列表。",
    )


def _probe_strategy_for_profile(profile: ProviderProfile) -> str | None:
    probe_capability = next(
        (
            capability
            for capability in (CHAT_CAPABILITY, "image.generate", "image.edit", "video.generate")
            if capability in (profile.capabilities or [])
        ),
        None,
    )
    if not probe_capability:
        return None
    return resolve_strategy_for_capability(
        capability=probe_capability,
        provider_name=profile.provider_name,
        model_name=profile.model_name,
        base_url=profile.base_url,
        strategies=profile.strategies or {},
    )


@router.get("/profiles", response_model=list[ProviderProfileOut])
def list_provider_profiles(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ProviderProfileOut]:
    require_ops_access(auth_user)
    profiles = db.scalars(select(ProviderProfile).order_by(ProviderProfile.provider_name)).all()
    return [_to_profile_out(profile) for profile in profiles]


@router.get("/pricing-rules", response_model=list[ProviderPricingRuleOut])
def list_provider_pricing_rules(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ProviderPricingRuleOut]:
    require_ops_access(auth_user)
    rules = db.scalars(
        select(ProviderPricingRule).order_by(
            ProviderPricingRule.provider_profile_id.asc(),
            ProviderPricingRule.capability.asc(),
            ProviderPricingRule.metric.asc(),
            ProviderPricingRule.id.asc(),
        )
    ).all()
    return [_to_pricing_rule_out(rule) for rule in rules]


@router.post("/profiles/{profile_id}/probe", response_model=ProviderProfileProbeOut)
async def probe_provider_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderProfileProbeOut:
    require_ops_access(auth_user)
    profile = db.get(ProviderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    checked_at = datetime.now(timezone.utc)

    try:
        api_key = decrypt_value_or_raise(profile.api_key)
    except EncryptionKeyUnavailableError:
        return ProviderProfileProbeOut(
            ok=False,
            status="invalid_key",
            detail="QMDH_ENCRYPTION_KEY 未配置，无法解密当前保存的 API Key。",
            checked_url=None,
            checked_at=checked_at,
        )
    except EncryptedValueDecodeError:
        return ProviderProfileProbeOut(
            ok=False,
            status="invalid_key",
            detail="当前保存的 API Key 无法被现有 QMDH_ENCRYPTION_KEY 解密，请重新录入。",
            checked_url=None,
            checked_at=checked_at,
        )

    if not api_key.strip():
        return ProviderProfileProbeOut(
            ok=False,
            status="missing_key",
            detail="当前模型没有可用的 API Key，请先在后台重新录入。",
            checked_url=None,
            checked_at=checked_at,
        )

    strategy = _probe_strategy_for_profile(profile)
    if strategy in {
        DASHSCOPE_ASYNC_VIDEO_STRATEGY,
        VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY,
        VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY,
        HAODEYA_GROK_VIDEO_STRATEGY,
    }:
        if strategy == DASHSCOPE_ASYNC_VIDEO_STRATEGY:
            checked_url = f"{profile.base_url.rstrip('/')}{_DASHSCOPE_VIDEO_PROBE_ENDPOINT}"
            provider_label = "DashScope"
        elif strategy == VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY:
            checked_url = f"{profile.base_url.rstrip('/')}{_ARK_VIDEO_PROBE_ENDPOINT}"
            provider_label = "Volcengine Ark"
        elif strategy == HAODEYA_GROK_VIDEO_STRATEGY:
            checked_url = f"{profile.base_url.rstrip('/')}{_HAODEYA_GROK_VIDEO_PROBE_ENDPOINT}"
            provider_label = "Grok 视频"
        else:
            config = profile.adapter_config or {}
            action = str(config.get("submit_action") or "CVSync2AsyncSubmitTask")
            version = str(config.get("version") or "2022-08-31")
            checked_url = f"{profile.base_url.rstrip('/')}?Action={action}&Version={version}"
            provider_label = "Volcengine Jimeng"
        return ProviderProfileProbeOut(
            ok=True,
            status="configured",
            detail=(
                f"已识别 {provider_label} 异步视频配置。探测不会创建真实视频任务；"
                "请通过受控的 video-generate 任务进行 live smoke。"
            ),
            checked_url=checked_url,
            checked_at=checked_at,
        )

    if profile.adapter_kind != "openai_compatible":
        return ProviderProfileProbeOut(
            ok=False,
            status="unsupported",
            detail=f"当前只支持校验 openai_compatible 适配器，{profile.adapter_kind} 请先人工联调。",
            checked_url=None,
            checked_at=checked_at,
        )

    method, checked_url, request_kwargs, success_detail = _build_probe_request(profile, api_key)

    try:
        async with httpx.AsyncClient(timeout=max(float(profile.timeout_seconds or 15.0), 1.0)) as client:
            response = await client.request(method, checked_url, **request_kwargs)
    except httpx.TimeoutException:
        return ProviderProfileProbeOut(
            ok=False,
            status="timeout",
            detail="上游模型服务校验超时。",
            checked_url=checked_url,
            checked_at=checked_at,
        )
    except httpx.RequestError as exc:
        return ProviderProfileProbeOut(
            ok=False,
            status="connection_error",
            detail=f"无法连接上游模型服务：{exc}",
            checked_url=checked_url,
            checked_at=checked_at,
        )

    if response.status_code in {401, 403}:
        return ProviderProfileProbeOut(
            ok=False,
            status="auth_error",
            detail="上游拒绝了当前 API Key，请检查 token 是否失效、录错或权限不足。",
            checked_url=checked_url,
            checked_at=checked_at,
        )

    if not response.is_success:
        return ProviderProfileProbeOut(
            ok=False,
            status="upstream_error",
            detail=f"上游返回 {response.status_code}: {response.text[:200]}",
            checked_url=checked_url,
            checked_at=checked_at,
        )

    return ProviderProfileProbeOut(
        ok=True,
        status="ok",
        detail=success_detail,
        checked_url=checked_url,
        checked_at=checked_at,
    )


@router.post("/profiles", response_model=ProviderProfileOut, status_code=status.HTTP_201_CREATED)
def create_provider_profile(
    payload: ProviderProfileCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderProfileOut:
    _require_provider_admin(auth_user)
    _require_encryption_key_configured("saved")

    existing = db.scalar(select(ProviderProfile).where(ProviderProfile.provider_name == payload.provider_name))
    if existing:
        raise HTTPException(status_code=409, detail="Provider profile already exists")

    try:
        normalized_base_url = normalize_provider_base_url(payload.base_url)
        normalized_strategies = normalize_strategies(payload.strategies)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    profile = ProviderProfile(
        provider_name=payload.provider_name.strip(),
        display_name=(payload.display_name or payload.model_name).strip(),
        api_key=encrypt_value(normalize_provider_api_key(payload.api_key)),
        api_secret=encrypt_value(normalize_provider_api_key(payload.api_secret)) if payload.api_secret.strip() else "",
        base_url=normalized_base_url,
        model_name=payload.model_name.strip(),
        adapter_kind=payload.adapter_kind.strip() or "openai_compatible",
        capabilities=[value.strip() for value in payload.capabilities if value.strip()] or ["image.generate"],
        strategies=normalized_strategies,
        adapter_config=payload.adapter_config or {},
        quality=payload.quality.strip() or "medium",
        output_format=payload.output_format.strip() or "png",
        timeout_seconds=payload.timeout_seconds,
        pricing_currency=payload.pricing_currency.strip().upper() or "CNY",
        pricing_unit=payload.pricing_unit.strip() or "per_image",
        unit_price=payload.unit_price,
        enabled=payload.enabled,
        reference_mode=payload.reference_mode.strip() or "disabled",
        reference_caption_model=(payload.reference_caption_model or "").strip() or None,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    write_audit_log(
        db,
        event_type=AuditEventType.PROVIDER_CREATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="provider",
        target_id=profile.id,
        target_name=profile.provider_name,
        details={"model_name": profile.model_name, "base_url": profile.base_url},
    )
    db.commit()

    return _to_profile_out(profile)


@router.patch("/profiles/{profile_id}", response_model=ProviderProfileOut)
def update_provider_profile(
    profile_id: int,
    payload: ProviderProfileUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderProfileOut:
    _require_provider_admin(auth_user)
    profile = db.get(ProviderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    updates = payload.model_dump(exclude_unset=True)
    if "api_key" in updates:
        api_key = normalize_provider_api_key(updates.pop("api_key") or "")
        if api_key:
            _require_encryption_key_configured("updated")
            profile.api_key = encrypt_value(api_key)
    if "api_secret" in updates:
        api_secret = normalize_provider_api_key(updates.pop("api_secret") or "")
        if api_secret:
            _require_encryption_key_configured("updated")
            profile.api_secret = encrypt_value(api_secret)
    if "base_url" in updates:
        try:
            updates["base_url"] = normalize_provider_base_url(updates["base_url"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    if "strategies" in updates:
        try:
            updates["strategies"] = normalize_strategies(updates["strategies"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        if field == "pricing_currency" and isinstance(value, str):
            value = value.upper() or "CNY"
        if field == "pricing_unit" and isinstance(value, str):
            value = value or "per_image"
        if field == "display_name" and isinstance(value, str):
            value = value or profile.model_name or profile.provider_name
        if field == "capabilities" and isinstance(value, list):
            value = [item.strip() for item in value if item.strip()] or ["image.generate"]
        if field == "reference_caption_model" and value == "":
            value = None
        setattr(profile, field, value)

    if not (profile.display_name or "").strip():
        profile.display_name = profile.model_name or profile.provider_name

    db.commit()
    db.refresh(profile)

    write_audit_log(
        db,
        event_type=AuditEventType.PROVIDER_UPDATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="provider",
        target_id=profile.id,
        target_name=profile.provider_name,
        details={"updated_fields": list(updates.keys())},
    )
    db.commit()

    return _to_profile_out(profile)


@router.post("/pricing-rules", response_model=ProviderPricingRuleOut, status_code=status.HTTP_201_CREATED)
def create_provider_pricing_rule(
    payload: ProviderPricingRuleCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderPricingRuleOut:
    _require_provider_admin(auth_user)
    profile = db.get(ProviderProfile, payload.provider_profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    rule = ProviderPricingRule(
        provider_profile_id=payload.provider_profile_id,
        capability=payload.capability.strip(),
        metric=payload.metric.strip(),
        unit_size=float(payload.unit_size or 1_000_000.0),
        unit_price=float(payload.unit_price or 0.0),
        currency=payload.currency.strip().upper() or "USD",
        is_active=payload.is_active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    write_audit_log(
        db,
        event_type=AuditEventType.PROVIDER_PRICING_RULE_CREATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="provider_pricing_rule",
        target_id=rule.id,
        target_name=profile.provider_name,
        details={"capability": rule.capability, "metric": rule.metric},
    )
    db.commit()
    return _to_pricing_rule_out(rule)


@router.patch("/pricing-rules/{rule_id}", response_model=ProviderPricingRuleOut)
def update_provider_pricing_rule(
    rule_id: int,
    payload: ProviderPricingRuleUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderPricingRuleOut:
    _require_provider_admin(auth_user)
    rule = db.get(ProviderPricingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Provider pricing rule not found")

    updates = payload.model_dump(exclude_unset=True)
    if "provider_profile_id" in updates and updates["provider_profile_id"] is not None:
        profile = db.get(ProviderProfile, updates["provider_profile_id"])
        if not profile:
            raise HTTPException(status_code=404, detail="Provider profile not found")
    for field, value in updates.items():
        if isinstance(value, str):
            value = value.strip()
        if field == "currency" and isinstance(value, str):
            value = value.upper() or "USD"
        setattr(rule, field, value)

    db.commit()
    db.refresh(rule)
    write_audit_log(
        db,
        event_type=AuditEventType.PROVIDER_PRICING_RULE_UPDATED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="provider_pricing_rule",
        target_id=rule.id,
        target_name=str(rule.provider_profile_id),
        details={"updated_fields": list(updates.keys())},
    )
    db.commit()
    return _to_pricing_rule_out(rule)


@router.delete("/pricing-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider_pricing_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    _require_provider_admin(auth_user)
    rule = db.get(ProviderPricingRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Provider pricing rule not found")

    write_audit_log(
        db,
        event_type=AuditEventType.PROVIDER_PRICING_RULE_DELETED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="provider_pricing_rule",
        target_id=rule.id,
        target_name=str(rule.provider_profile_id),
        details={"capability": rule.capability, "metric": rule.metric},
    )
    db.delete(rule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    _require_provider_admin(auth_user)
    profile = db.get(ProviderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Provider profile not found")

    provider_name = profile.provider_name
    provider_id = profile.id

    write_audit_log(
        db,
        event_type=AuditEventType.PROVIDER_DELETED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="provider",
        target_id=provider_id,
        target_name=provider_name,
    )
    db.delete(profile)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/discover", response_model=ProviderDiscoverOut)
async def discover_provider_models(
    payload: ProviderDiscoverIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderDiscoverOut:
    _require_provider_admin(auth_user)

    try:
        base_url = normalize_provider_base_url(payload.base_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    headers = {"Authorization": f"Bearer {payload.api_key}"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{base_url}/models", headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Upstream model discovery timed out.")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach {base_url}: {exc}")

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="The supplied API key was rejected by the upstream provider.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"Upstream returned {response.status_code}: {response.text[:200]}")

    try:
        data = response.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Upstream returned a non-JSON response.")

    raw_models: list[dict] = []
    if isinstance(data, dict) and "data" in data:
        raw_models = data["data"] if isinstance(data["data"], list) else []
    elif isinstance(data, list):
        raw_models = data

    existing_names = set(
        db.scalars(select(ProviderProfile.model_name).where(ProviderProfile.base_url == base_url)).all()
    )

    models = [
        DiscoveredModel(
            model_id=str(item.get("id") or item.get("model_id") or ""),
            owned_by=str(item.get("owned_by") or ""),
            already_exists=str(item.get("id") or item.get("model_id") or "") in existing_names,
        )
        for item in raw_models
        if item.get("id") or item.get("model_id")
    ]

    return ProviderDiscoverOut(base_url=base_url, models=models)


@router.post("/bulk-import", response_model=ProviderBulkImportOut, status_code=status.HTTP_201_CREATED)
def bulk_import_provider_profiles(
    payload: ProviderBulkImportIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ProviderBulkImportOut:
    _require_provider_admin(auth_user)
    _require_encryption_key_configured("saved")

    try:
        base_url = normalize_provider_base_url(payload.base_url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    created: list[str] = []
    skipped: list[str] = []

    for item in payload.models:
        existing = db.scalar(select(ProviderProfile).where(ProviderProfile.provider_name == item.provider_name))
        if existing:
            skipped.append(item.provider_name)
            continue

        reference_mode = item.reference_mode
        if not reference_mode or reference_mode == "disabled":
            reference_mode = "caption_prompt" if "modelscope.cn" in base_url else "disabled"
        try:
            normalized_strategies = normalize_strategies(item.strategies)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        profile = ProviderProfile(
            provider_name=item.provider_name,
            display_name=(item.display_name or item.model_id).strip() or item.model_id,
            api_key=encrypt_value(payload.api_key),
            base_url=base_url,
            model_name=item.model_id,
            adapter_kind=item.adapter_kind,
            capabilities=item.capabilities or ["image.generate"],
            strategies=normalized_strategies,
            quality="medium",
            output_format="png",
            timeout_seconds=300.0,
            pricing_currency="CNY",
            pricing_unit="per_image",
            unit_price=0.0,
            enabled=True,
            reference_mode=reference_mode,
            reference_caption_model=None,
        )
        db.add(profile)
        created.append(item.provider_name)

    db.commit()
    return ProviderBulkImportOut(created=created, skipped=skipped)
