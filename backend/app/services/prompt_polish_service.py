"""LLM-powered prompt polishing for Studio generation composer."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.encryption import EncryptedValueDecodeError, EncryptionKeyUnavailableError, decrypt_value_or_raise
from app.models import PlatformSettings, ProviderProfile
from app.services.platform_settings_service import get_or_create_platform_settings
from app.services.task_executor import _extract_chat_message_content, _reference_image_to_model_url

CreationMode = Literal["generate", "edit", "video"]

CREATION_MODE_LABELS: dict[CreationMode, str] = {
    "generate": "文生图",
    "edit": "图生图",
    "video": "视频生成",
}

DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT = """你是清美道合设计工作台的提示词优化助手。用户会提供创作模式（文生图/图生图/视频）、原始提示词，以及可选的参考图。

你的任务：
1. 保留用户核心设计意图与关键约束，不要改变任务类型
2. 补充适合 AI 生图/改图/视频的专业描述：主体、场景、材质、光影、镜头、风格、氛围
3. 图生图/视频模式需与参考图内容呼应，不要编造与参考图明显冲突的元素
4. 使用简洁中文或中英混合的专业表述，避免废话、列表标题和 markdown
5. 只输出优化后的提示词正文，不要解释、不要引号包裹"""


class PromptPolishUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class PromptPolishResult:
    polished_prompt: str
    provider_name: str
    model_name: str


def resolve_prompt_polish_system_prompt(settings: PlatformSettings) -> str:
    configured = str(settings.prompt_polish_system_prompt or "").strip()
    return configured or DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT


def resolve_prompt_polish_provider(db: Session, settings: PlatformSettings) -> ProviderProfile:
    provider_id = settings.prompt_polish_provider_id
    if provider_id is not None:
        provider = db.get(ProviderProfile, provider_id)
        if provider and provider.enabled and "chat.completions" in (provider.capabilities or []):
            return provider
        raise PromptPolishUnavailableError("配置的提示词润色模型不可用，请联系管理员。")

    provider = db.scalars(
        select(ProviderProfile)
        .where(ProviderProfile.enabled == True)  # noqa: E712
        .order_by(ProviderProfile.id.asc())
    ).first()
    if provider is None or "chat.completions" not in (provider.capabilities or []):
        raise PromptPolishUnavailableError("未配置提示词润色模型，请联系管理员。")
    return provider


def _build_user_message(
    *,
    prompt: str,
    creation_mode: CreationMode,
    reference_images: list[str],
) -> list[dict]:
    mode_label = CREATION_MODE_LABELS.get(creation_mode, creation_mode)
    text = (
        f"创作模式：{mode_label}\n"
        f"用户原始提示词：\n{prompt.strip()}\n\n"
        "请输出优化后的提示词正文。"
    )
    content: list[dict] = [{"type": "text", "text": text}]
    for image_path in reference_images:
        normalized = str(image_path or "").strip()
        if not normalized:
            continue
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": _reference_image_to_model_url(normalized)},
            }
        )
    return content


def polish_prompt(
    db: Session,
    *,
    prompt: str,
    creation_mode: CreationMode,
    reference_images: list[str] | None = None,
) -> PromptPolishResult:
    cleaned_prompt = str(prompt or "").strip()
    if not cleaned_prompt:
        raise PromptPolishUnavailableError("请先输入提示词。")

    settings = get_or_create_platform_settings(db)
    if not settings.prompt_polish_enabled:
        raise PromptPolishUnavailableError("提示词润色功能未启用。")

    provider = resolve_prompt_polish_provider(db, settings)
    try:
        api_key = decrypt_value_or_raise(provider.api_key)
    except (EncryptionKeyUnavailableError, EncryptedValueDecodeError) as exc:
        raise PromptPolishUnavailableError("润色模型 API Key 不可用。") from exc

    system_prompt = resolve_prompt_polish_system_prompt(settings)
    images = [path for path in (reference_images or []) if str(path or "").strip()]
    request_body = {
        "model": provider.model_name,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": _build_user_message(prompt=cleaned_prompt, creation_mode=creation_mode, reference_images=images)},
        ],
        "max_tokens": 900,
        "temperature": 0.35,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    request = Request(
        url=f"{provider.base_url.rstrip('/')}/chat/completions",
        data=json.dumps(request_body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    timeout = max(float(provider.timeout_seconds or 120.0), 1.0)

    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise PromptPolishUnavailableError(f"润色模型返回 HTTP {exc.code}：{detail[:240]}") from exc
    except URLError as exc:
        raise PromptPolishUnavailableError(f"润色模型请求失败：{exc.reason}") from exc

    polished = _extract_chat_message_content(payload).strip()
    if not polished:
        raise PromptPolishUnavailableError("润色模型未返回有效内容。")

    return PromptPolishResult(
        polished_prompt=polished,
        provider_name=provider.provider_name,
        model_name=provider.model_name,
    )
