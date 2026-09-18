"""LLM-powered prompt polishing for Studio generation composer."""



from __future__ import annotations



import json

import logging

import re

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



logger = logging.getLogger(__name__)



CreationMode = Literal["generate", "edit", "video"]



CREATION_MODE_LABELS: dict[CreationMode, str] = {

    "generate": "文生图",

    "edit": "图生图",

    "video": "视频生成",

}



DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_GENERATE = """你是清美道合设计工作台的提示词优化助手。当前为「文生图」模式：用户只有文字，没有参考图。



你的任务：

1. 保留用户核心设计意图与关键约束，不要改变任务类型

2. 适度补充适合 AI 文生图的专业描述：主体、场景、材质、光影、镜头、风格、氛围

3. 使用简洁中文或中英混合的专业表述，避免废话、列表标题和 markdown

4. 输出控制在 80–150 字（中文）以内，只输出优化后的提示词正文，不要解释、不要引号包裹"""



DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_EDIT = """你是清美道合设计工作台的提示词优化助手。当前为「图生图/改图」模式：用户已上传参考图，模型会以参考图为底做修改。



你的任务：

1. 严格保留用户要改什么，只优化表述清晰度，不要改变修改目标

2. 只描述相对参考图需要调整的部分（如颜色、材质、局部形态、删除/新增元素），禁止重写整张图的构图、主体、场景

3. 参考图中已有的主体、构图、环境不要重复描述，不要编造与参考图明显冲突的元素

4. 使用简洁中文或中英混合，避免废话、列表标题和 markdown

5. 输出控制在 60–120 字（中文）以内，且不超过用户原文长度的 1.5 倍；只输出优化后的提示词正文，不要解释、不要引号包裹"""



DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_VIDEO = """你是清美道合设计工作台的提示词优化助手。当前为「视频生成」模式，用户可能附带参考图。



你的任务：

1. 保留用户核心意图与关键约束，不要改变任务类型

2. 补充适合 AI 视频的专业描述：主体动作、镜头运动、节奏、场景、光影、风格、氛围

3. 若有参考图，描述需与参考图内容呼应，不要编造明显冲突的元素

4. 使用简洁中文或中英混合，避免静态画面堆砌、废话、列表标题和 markdown

5. 输出控制在 80–160 字（中文）以内，只输出优化后的提示词正文，不要解释、不要引号包裹"""



DEFAULT_PROMPT_POLISH_SYSTEM_PROMPTS: dict[CreationMode, str] = {

    "generate": DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_GENERATE,

    "edit": DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_EDIT,

    "video": DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_VIDEO,

}



# Backward-compatible alias (Admin 展示 / 旧引用)

DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT = DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_GENERATE



MODE_MAX_TOKENS: dict[CreationMode, int] = {

    "generate": 500,

    "edit": 280,

    "video": 420,

}



MODE_MAX_OUTPUT_CHARS: dict[CreationMode, int] = {

    "generate": 320,

    "edit": 200,

    "video": 360,

}



MODE_LENGTH_MULTIPLIER: dict[CreationMode, float | None] = {

    "generate": None,

    "edit": 1.8,

    "video": 2.0,

}





class PromptPolishUnavailableError(RuntimeError):

    pass





@dataclass(frozen=True)

class ReferenceImageResolution:

    urls: list[str]

    requested_count: int

    skipped_count: int



    @property

    def used_count(self) -> int:

        return len(self.urls)





@dataclass(frozen=True)

class PromptPolishResult:

    polished_prompt: str

    provider_name: str

    model_name: str

    reference_images_used: int = 0

    reference_image_warning: str | None = None





MODE_PROMPT_SETTING_ATTR: dict[CreationMode, str] = {
    "generate": "prompt_polish_system_prompt_generate",
    "edit": "prompt_polish_system_prompt_edit",
    "video": "prompt_polish_system_prompt_video",
}


def configured_prompt_polish_system_prompt(
    settings: PlatformSettings,
    creation_mode: CreationMode,
) -> str | None:
    attr = MODE_PROMPT_SETTING_ATTR.get(creation_mode, "prompt_polish_system_prompt_generate")
    configured = str(getattr(settings, attr, None) or "").strip()
    if configured:
        return configured

    legacy = str(settings.prompt_polish_system_prompt or "").strip()
    if legacy:
        return legacy
    return None


def resolve_prompt_polish_system_prompt(settings: PlatformSettings, creation_mode: CreationMode) -> str:
    configured = configured_prompt_polish_system_prompt(settings, creation_mode)
    if configured:
        return configured
    return DEFAULT_PROMPT_POLISH_SYSTEM_PROMPTS.get(creation_mode, DEFAULT_PROMPT_POLISH_SYSTEM_PROMPT_GENERATE)


def prompt_polish_builtin_prompts() -> dict[CreationMode, str]:
    return dict(DEFAULT_PROMPT_POLISH_SYSTEM_PROMPTS)





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





def _resolve_reference_image_urls_for_polish(reference_images: list[str]) -> ReferenceImageResolution:

    """Best-effort reference URLs for multimodal polish; local paths become data URLs."""

    urls: list[str] = []

    skipped = 0

    for image_path in reference_images:

        normalized = str(image_path or "").strip()

        if not normalized:

            continue

        if normalized.lower().startswith("asset://"):

            logger.info("Skipping asset:// reference for prompt polish: %s", normalized[:80])

            skipped += 1

            continue

        try:

            urls.append(_reference_image_to_model_url(normalized))

        except ValueError as exc:

            logger.warning("Skipping unreadable reference for prompt polish (%s): %s", normalized[:80], exc)

            skipped += 1

    requested = len([path for path in reference_images if str(path or "").strip()])

    return ReferenceImageResolution(urls=urls, requested_count=requested, skipped_count=skipped)





def _reference_image_warning(

    *,

    creation_mode: CreationMode,

    resolution: ReferenceImageResolution,

) -> str | None:

    if resolution.requested_count == 0:

        return None

    if resolution.used_count > 0:

        if resolution.skipped_count > 0:

            return f"有 {resolution.skipped_count} 张参考图未能参与润色（路径不可读或不支持）。"

        return None

    if creation_mode in {"edit", "video"}:

        return "参考图未能用于润色，结果可能偏离画面内容；请确认图片已上传完成或使用支持视觉的润色模型。"

    return None





def _trim_polished_output(text: str, *, creation_mode: CreationMode, original_prompt: str) -> str:

    cleaned = str(text or "").strip()

    if not cleaned:

        return cleaned



    max_chars = MODE_MAX_OUTPUT_CHARS.get(creation_mode, 320)

    multiplier = MODE_LENGTH_MULTIPLIER.get(creation_mode)

    if multiplier is not None:

        original_len = len(original_prompt.strip())

        if original_len > 0:

            max_chars = min(max_chars, max(int(original_len * multiplier), 40))



    if len(cleaned) <= max_chars:

        return cleaned



    truncated = cleaned[:max_chars]

    for separator in ("。", "！", "？", "；", ".", "!", "?", ";", "，", ","):

        index = truncated.rfind(separator)

        if index >= max(20, max_chars // 3):

            return truncated[: index + 1].strip()

    return truncated.rstrip("，,;； ") + "…"





def _build_user_message(

    *,

    prompt: str,

    creation_mode: CreationMode,

    reference_resolution: ReferenceImageResolution,

) -> list[dict]:

    mode_label = CREATION_MODE_LABELS.get(creation_mode, creation_mode)

    mode_hint = ""

    if creation_mode == "edit":

        mode_hint = "\n请仅描述相对参考图需要修改的部分，不要重写整张图的构图与主体。"

    elif creation_mode == "video" and reference_resolution.used_count > 0:

        mode_hint = "\n请结合参考图内容，突出动作与镜头运动描述。"



    text = (

        f"创作模式：{mode_label}\n"

        f"用户原始提示词：\n{prompt.strip()}\n\n"

        f"请输出优化后的提示词正文。{mode_hint}"

    )

    content: list[dict] = [{"type": "text", "text": text}]

    for image_url in reference_resolution.urls:

        content.append({"type": "image_url", "image_url": {"url": image_url}})

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



    system_prompt = resolve_prompt_polish_system_prompt(settings, creation_mode)

    images = [path for path in (reference_images or []) if str(path or "").strip()]

    reference_resolution = _resolve_reference_image_urls_for_polish(images)

    reference_warning = _reference_image_warning(creation_mode=creation_mode, resolution=reference_resolution)



    request_body = {

        "model": provider.model_name,

        "messages": [

            {"role": "system", "content": system_prompt},

            {

                "role": "user",

                "content": _build_user_message(

                    prompt=cleaned_prompt,

                    creation_mode=creation_mode,

                    reference_resolution=reference_resolution,

                ),

            },

        ],

        "max_tokens": MODE_MAX_TOKENS.get(creation_mode, 500),

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



    polished_raw = _extract_chat_message_content(payload).strip()

    polished_raw = re.sub(r"^[\"'「『]+|[\"'」』]+$", "", polished_raw).strip()

    if not polished_raw:

        raise PromptPolishUnavailableError("润色模型未返回有效内容。")



    polished = _trim_polished_output(polished_raw, creation_mode=creation_mode, original_prompt=cleaned_prompt)



    return PromptPolishResult(

        polished_prompt=polished,

        provider_name=provider.provider_name,

        model_name=provider.model_name,

        reference_images_used=reference_resolution.used_count,

        reference_image_warning=reference_warning,

    )

