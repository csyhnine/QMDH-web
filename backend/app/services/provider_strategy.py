from __future__ import annotations

import re
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
HAODEYA_ASYNC_IMAGE_STRATEGY = "haodeya_async_image"
HAODEYA_SYNC_IMAGE_STRATEGY = "haodeya_sync_image"
BIGJPG_UPSCALE_STRATEGY = "bigjpg_upscale"
COMFYUI_STRATEGY = "comfyui"

KNOWN_STRATEGIES = {
    COMFYUI_STRATEGY,
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
    HAODEYA_ASYNC_IMAGE_STRATEGY,
    HAODEYA_SYNC_IMAGE_STRATEGY,
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
    "image.generate": {
        COMFYUI_STRATEGY,
        OPENAI_IMAGES_STRATEGY,
        CHAT_MODALITIES_IMAGE_STRATEGY,
        CHAT_COMPLETIONS_IMAGE_STRATEGY,
        HAODEYA_ASYNC_IMAGE_STRATEGY,
        HAODEYA_SYNC_IMAGE_STRATEGY,
    },
    "image.edit": {
        OPENAI_IMAGES_STRATEGY,
        OPENAI_IMAGE_EDITS_STRATEGY,
        CHAT_MODALITIES_IMAGE_EDIT_STRATEGY,
        CHAT_COMPLETIONS_IMAGE_EDIT_STRATEGY,
        HAODEYA_ASYNC_IMAGE_STRATEGY,
        HAODEYA_SYNC_IMAGE_STRATEGY,
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
    # VIP async / DeepKey sync SKUs use short /images/generations bodies — never chat modalities.
    if profile_prefers_haodeya_async_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ) or profile_prefers_haodeya_sync_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        return False
    if "gemini" in identity and "image" in identity and "preview" in identity:
        return True
    # Plain gpt-image on Haodeya (non-vip / non-count) historically used chat modalities.
    if "haodeya" in identity and "gpt-image" in identity:
        return True
    return False


def profile_prefers_chat_completions_image(*, provider_name: str, model_name: str, base_url: str) -> bool:
    normalized_model = str(model_name or "").strip().lower()
    if normalized_model.endswith("-2k"):
        normalized_model = normalized_model[:-3]
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
    # Haodeya gateway HappyHorse / Wan video must not be hijacked to Aliyun DashScope.
    if "haodeya" in identity:
        return False
    return "dashscope" in identity or "aliyuncs.com" in identity or "wan" in identity or "happyhorse" in identity


def profile_prefers_volcengine_ark_video(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    # Seedance 2 ToAPI on Haodeya uses POST /v1/videos (haodeya_grok_video), not Ark tasks.
    if "haodeya" in identity:
        return False
    normalized_model = str(model_name or "").strip().lower()
    if normalized_model.startswith("seedance-2"):
        return False
    return "ark" in identity or "seedance" in identity or "volces.com/api/v3" in identity


def profile_prefers_volcengine_jimeng_video(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    return "jimeng" in identity or ("cv" in identity and "volc" in identity)


def profile_prefers_haodeya_grok_video(*, provider_name: str, model_name: str, base_url: str) -> bool:
    identity = f"{provider_name} {model_name} {base_url}".lower()
    normalized_model = str(model_name or "").strip().lower()
    if "happyhorse" in identity and "haodeya" in identity:
        return True
    if normalized_model.startswith("happyhorse-1.1-"):
        return True
    # Seedance 2 ToAPI SKUs / unified placeholder on Haodeya.
    if normalized_model.startswith("seedance-2"):
        return True
    if "seedance" in identity and "haodeya" in identity:
        return True
    if "haodeya_seedance" in identity:
        return True
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


def _sync_image_identity(
    *,
    provider_name: str,
    model_name: str,
    base_url: str = "",
    adapter_config: Mapping[str, Any] | None = None,
) -> str:
    flavor = ""
    if isinstance(adapter_config, Mapping):
        flavor = str(adapter_config.get("provider_flavor") or "").strip().lower()
    return f"{provider_name} {model_name} {base_url} {flavor}".lower()


def profile_is_legacy_gpt_image_count(
    *,
    provider_name: str,
    model_name: str,
    base_url: str = "",
    adapter_config: Mapping[str, Any] | None = None,
) -> bool:
    """Deprecated upstream SKU — sync generations + multipart /images/edits for i2i."""
    identity = _sync_image_identity(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
        adapter_config=adapter_config,
    )
    return "gpt-image-2-count" in identity or "gpt-image-count" in identity


def profile_is_haodeya_gpt_sunburst(
    *,
    provider_name: str,
    model_name: str,
    base_url: str = "",
    adapter_config: Mapping[str, Any] | None = None,
) -> bool:
    identity = _sync_image_identity(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
        adapter_config=adapter_config,
    )
    flavor = ""
    if isinstance(adapter_config, Mapping):
        flavor = str(adapter_config.get("provider_flavor") or "").strip().lower()
    return (
        "gpt-image-2.5-sunburst" in identity
        or flavor in {"gpt_image_25_sunburst", "haodeya_gpt_sunburst", "sunburst"}
    )


def profile_is_haodeya_gpt_sync_20(
    *,
    provider_name: str,
    model_name: str,
    base_url: str = "",
    adapter_config: Mapping[str, Any] | None = None,
) -> bool:
    if profile_is_legacy_gpt_image_count(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
        adapter_config=adapter_config,
    ):
        return False
    if profile_is_haodeya_gpt_sunburst(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
        adapter_config=adapter_config,
    ):
        return False
    identity = _sync_image_identity(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
        adapter_config=adapter_config,
    )
    flavor = ""
    if isinstance(adapter_config, Mapping):
        flavor = str(adapter_config.get("provider_flavor") or "").strip().lower()
    if flavor in {"gpt_image_20_sync", "haodeya_gpt_20_sync"}:
        return True
    return bool(re.search(r"gpt-image-2-(?:1k|2k|4k)\b", identity))


def profile_prefers_haodeya_async_image(*, provider_name: str, model_name: str, base_url: str) -> bool:
    """ToAPI VIP only — async `/images/generations` + poll (handbook §5).

    GPT sync (2.0 / 2.5 / legacy count) → `haodeya_sync_image`.
    Gemini CPA stays on chat strategies. Wan2.7 stays on openai_images / edits.
    """
    identity = f"{provider_name} {model_name} {base_url}".lower()
    if "wan2.7" in identity or "wan2_7" in identity:
        return False
    if profile_prefers_haodeya_sync_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        return False
    return (
        "gpt-image-2-vip" in identity
        or "gpt-image-vip" in identity
        or "haodeya_async_image" in identity
    )


def profile_prefers_haodeya_sync_image(
    *,
    provider_name: str,
    model_name: str,
    base_url: str = "",
    adapter_config: Mapping[str, Any] | None = None,
) -> bool:
    """GPT sync SKUs — `/images/generations` short body, pixel size, no poll."""
    identity = f"{provider_name} {model_name} {base_url}".lower()
    if "wan2.7" in identity or "wan2_7" in identity:
        return False
    return (
        profile_is_legacy_gpt_image_count(
            provider_name=provider_name,
            model_name=model_name,
            base_url=base_url,
            adapter_config=adapter_config,
        )
        or profile_is_haodeya_gpt_sync_20(
            provider_name=provider_name,
            model_name=model_name,
            base_url=base_url,
            adapter_config=adapter_config,
        )
        or profile_is_haodeya_gpt_sunburst(
            provider_name=provider_name,
            model_name=model_name,
            base_url=base_url,
            adapter_config=adapter_config,
        )
        or "haodeya_sync_image" in identity
    )


def profile_prefers_toapis_image(*, provider_name: str, model_name: str, base_url: str) -> bool:
    return profile_prefers_haodeya_async_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    )


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
    if profile_prefers_haodeya_async_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        if normalized in {"image.generate", "image.edit"}:
            return HAODEYA_ASYNC_IMAGE_STRATEGY
    if profile_prefers_haodeya_sync_image(
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    ):
        if normalized in {"image.generate", "image.edit"}:
            return HAODEYA_SYNC_IMAGE_STRATEGY
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
    # Discovery often stamps Seedance 2 ToAPI SKUs with Ark tasks strategy; Haodeya
    # gateway returns 404 on POST /v1/contents/generations/tasks — force /v1/videos.
    if (
        normalized == "video.generate"
        and explicit == VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY
        and profile_prefers_haodeya_grok_video(
            provider_name=provider_name,
            model_name=model_name,
            base_url=base_url,
        )
    ):
        return HAODEYA_GROK_VIDEO_STRATEGY
    if explicit:
        return explicit
    return default_strategy_for_capability(
        capability=normalized,
        provider_name=provider_name,
        model_name=model_name,
        base_url=base_url,
    )
