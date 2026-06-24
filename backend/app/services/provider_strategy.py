from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import urlparse


CHAT_CAPABILITY = "chat.completions"
CHAT_CAPABILITY_ALIAS = "chat"

OPENAI_CHAT_STRATEGY = "openai_chat"
OPENAI_IMAGES_STRATEGY = "openai_images"
OPENAI_IMAGE_EDITS_STRATEGY = "openai_image_edits"
CHAT_MODALITIES_IMAGE_STRATEGY = "chat_modalities_image"
CHAT_MODALITIES_IMAGE_EDIT_STRATEGY = "chat_modalities_image_edit"
CHAT_COMPLETIONS_IMAGE_STRATEGY = "chat_completions_image"
CHAT_COMPLETIONS_IMAGE_EDIT_STRATEGY = "chat_completions_image_edit"
DASHSCOPE_ASYNC_VIDEO_STRATEGY = "dashscope_async_video"
VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY = "volcengine_ark_video_tasks"
VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY = "volcengine_cv_jimeng_video"
HAODEYA_GROK_VIDEO_STRATEGY = "haodeya_grok_video"
BIGJPG_UPSCALE_STRATEGY = "bigjpg_upscale"

KNOWN_STRATEGIES = {
    OPENAI_CHAT_STRATEGY,
    OPENAI_IMAGES_STRATEGY,
    OPENAI_IMAGE_EDITS_STRATEGY,
    CHAT_MODALITIES_IMAGE_STRATEGY,
    CHAT_MODALITIES_IMAGE_EDIT_STRATEGY,
    CHAT_COMPLETIONS_IMAGE_STRATEGY,
    CHAT_COMPLETIONS_IMAGE_EDIT_STRATEGY,
    DASHSCOPE_ASYNC_VIDEO_STRATEGY,
    VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY,
    VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY,
    HAODEYA_GROK_VIDEO_STRATEGY,
    BIGJPG_UPSCALE_STRATEGY,
}

FORBIDDEN_BASE_URL_SUFFIXES = (
    "/chat/completions",
    "/images/generations",
    "/images/edits",
    "/models",
)

_CAPABILITY_ALIASES = {
    CHAT_CAPABILITY_ALIAS: CHAT_CAPABILITY,
    CHAT_CAPABILITY: CHAT_CAPABILITY,
    "image.generate": "image.generate",
    "image.edit": "image.edit",
    "image.upscale": "image.upscale",
    "video.generate": "video.generate",
}

_ALLOWED_STRATEGIES_BY_CAPABILITY = {
    CHAT_CAPABILITY: {OPENAI_CHAT_STRATEGY},
    "image.generate": {OPENAI_IMAGES_STRATEGY, CHAT_MODALITIES_IMAGE_STRATEGY, CHAT_COMPLETIONS_IMAGE_STRATEGY},
    "image.edit": {
        OPENAI_IMAGES_STRATEGY,
        OPENAI_IMAGE_EDITS_STRATEGY,
        CHAT_MODALITIES_IMAGE_EDIT_STRATEGY,
        CHAT_COMPLETIONS_IMAGE_EDIT_STRATEGY,
    },
    "image.upscale": {BIGJPG_UPSCALE_STRATEGY},
    "video.generate": {
        DASHSCOPE_ASYNC_VIDEO_STRATEGY,
        VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY,
        VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY,
        HAODEYA_GROK_VIDEO_STRATEGY,
    },
}


def normalize_capability_key(capability: str) -> str:
    normalized = str(capability or "").strip()
    return _CAPABILITY_ALIASES.get(normalized, normalized)


def normalize_provider_base_url(raw_value: str) -> str:
    value = str(raw_value or "").strip().rstrip("/")
    if not value:
        raise ValueError("Base URL is required")

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Base URL must be a valid http(s) API root such as https://example.com/v1")

    normalized_path = (parsed.path or "").rstrip("/").lower()
    if any(normalized_path.endswith(suffix) for suffix in FORBIDDEN_BASE_URL_SUFFIXES):
        raise ValueError(
            "Base URL must point to the API root (for example https://example.com/v1), not a specific endpoint."
        )
    return value


def normalize_strategies(raw_value: Mapping[str, Any] | None) -> dict[str, str]:
    if raw_value is None:
        return {}
    if not isinstance(raw_value, Mapping):
        raise ValueError("strategies must be a JSON object")

    normalized: dict[str, str] = {}
    for raw_key, raw_strategy in raw_value.items():
        key = normalize_capability_key(str(raw_key or "").strip())
        strategy = str(raw_strategy or "").strip()
        if not key or not strategy:
            continue
        allowed = _ALLOWED_STRATEGIES_BY_CAPABILITY.get(key)
        if allowed is not None and strategy not in allowed:
            raise ValueError(f"Unsupported strategy for {key}: {strategy}")
        normalized[key] = strategy
    return normalized


def profile_prefers_native_image_edits(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    return "gpt-image" in identity or "api.openai.com" in identity


def profile_prefers_chat_modalities_image(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    if "gemini" in identity and "image" in identity and "preview" in identity:
        return True
    return False


def profile_prefers_chat_completions_image(*, provider_name: str, model_name: str, base_url: str) -> bool:
    normalized_model = str(model_name or "").strip().lower()
    if not normalized_model or normalized_model.startswith("google/"):
        return False
    if normalized_model in {"gemini-3.1-flash-image", "gemini-3-flash-image"}:
        return True
    identity = f"{provider_name} {model_name} {base_url}".lower()
    return (
        "gemini" in identity
        and "flash" in identity
        and "image" in identity
        and "preview" not in identity
    )


def profile_prefers_dashscope_video(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    return "dashscope" in identity or "aliyuncs.com" in identity or "wan" in identity or "happyhorse" in identity


def profile_prefers_volcengine_ark_video(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    return "ark" in identity or "seedance" in identity or "volces.com/api/v3" in identity


def profile_prefers_volcengine_jimeng_video(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    return "jimeng" in identity or ("cv" in identity and "volc" in identity)


def profile_prefers_haodeya_grok_video(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    if "haodeya" in identity or "grok-imagine-video" in identity:
        return True
    return model_name.strip() in {
        "x-ai/grok-imagine-video-i2v",
        "x-ai/grok-imagine-video-i2v-10s",
        "x-ai/grok-imagine-video-ref",
        "x-ai/grok-imagine-video-ref-10s",
    }


def profile_prefers_bigjpg_upscale(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    return "bigjpg" in identity


def default_strategy_for_capability(
    *,
    capability: str,
    provider_name: str,
    model_name: str,
    base_url: str,
) -> str | None:
    normalized = normalize_capability_key(capability)
    if normalized == CHAT_CAPABILITY:
        return OPENAI_CHAT_STRATEGY
    if profile_prefers_chat_modalities_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        if normalized == "image.generate":
            return CHAT_MODALITIES_IMAGE_STRATEGY
        if normalized == "image.edit":
            return CHAT_MODALITIES_IMAGE_EDIT_STRATEGY
    if profile_prefers_chat_completions_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        if normalized == "image.generate":
            return CHAT_COMPLETIONS_IMAGE_STRATEGY
        if normalized == "image.edit":
            return CHAT_COMPLETIONS_IMAGE_EDIT_STRATEGY
    if normalized == "image.generate":
        return OPENAI_IMAGES_STRATEGY
    if normalized == "image.edit":
        if profile_prefers_native_image_edits(
            provider_name=provider_name,
            model_name=model_name,
            base_url=base_url,
        ):
            return OPENAI_IMAGE_EDITS_STRATEGY
        return OPENAI_IMAGES_STRATEGY
    if normalized == "image.upscale" and profile_prefers_bigjpg_upscale(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        return BIGJPG_UPSCALE_STRATEGY
    if normalized == "video.generate" and profile_prefers_dashscope_video(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        return DASHSCOPE_ASYNC_VIDEO_STRATEGY
    if normalized == "video.generate" and profile_prefers_volcengine_ark_video(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        return VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY
    if normalized == "video.generate" and profile_prefers_volcengine_jimeng_video(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        return VOLCENGINE_CV_JIMENG_VIDEO_STRATEGY
    if normalized == "video.generate" and profile_prefers_haodeya_grok_video(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        return HAODEYA_GROK_VIDEO_STRATEGY
    return None


def resolve_strategy_for_capability(
    *,
    capability: str,
    provider_name: str,
    model_name: str,
    base_url: str,
    strategies: Mapping[str, str] | None,
) -> str | None:
    normalized = normalize_capability_key(capability)
    explicit = normalize_strategies(strategies).get(normalized)
    if explicit:
        return explicit
    return default_strategy_for_capability(
        capability=normalized,
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    )
