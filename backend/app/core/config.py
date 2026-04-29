from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT_DIR = BACKEND_DIR.parent
DEFAULT_REFERENCE_CAPTION_PROMPT = (
    "Describe the reference image for an image-generation model. "
    "Focus on composition, subject, materials, lighting, style, spatial layout, and constraints. "
    "Do not invent private or sensitive information."
)
DEFAULT_REFERENCE_CAPTION_FALLBACK_MODELS = (
    "Qwen/Qwen3-VL-8B-Instruct",
    "OpenGVLab/InternVL3_5-241B-A28B",
)


@dataclass(frozen=True)
class ImageProviderProfile:
    provider_name: str
    api_key: str
    base_url: str
    model_name: str
    timeout_seconds: float = 90.0
    quality: str = "medium"
    output_format: str = "png"
    adapter_kind: str = "openai_compatible"
    capabilities: tuple[str, ...] = ("image.generate",)
    configurable: bool = True
    outbound: bool = True
    reference_mode: str = "disabled"
    reference_caption_model: str | None = None
    reference_caption_fallback_models: tuple[str, ...] = DEFAULT_REFERENCE_CAPTION_FALLBACK_MODELS
    reference_caption_prompt: str = DEFAULT_REFERENCE_CAPTION_PROMPT


@dataclass(frozen=True)
class AuthUserProfile:
    name: str
    token: str
    role: str = "designer"
    project_codes: tuple[str, ...] = ("QMDH-001",)


class Settings(BaseSettings):
    app_name: str = "QMDH Internal AI Platform"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./app.db"
    frontend_origin: str = "http://localhost:5180"
    media_root: str = "./storage/assets"
    media_url_prefix: str = "/media"
    task_execution_mode: str = "background"
    redis_url: str = "redis://localhost:6379/0"
    redis_queue_name: str = "qmdh:tasks"
    openai_image_api_key: str | None = None
    openai_image_base_url: str = "https://api.openai.com/v1"
    openai_image_model: str = "gpt-image-1"
    openai_image_timeout_seconds: float = 90.0
    openai_image_quality: str = "medium"
    openai_image_output_format: str = "png"
    image_provider_profiles_json: str = "[]"
    auth_users_json: str = (
        '[{"name":"reviewer","token":"dev-reviewer-token","role":"reviewer","project_codes":["QMDH-001"]}]'
    )

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), str(REPO_ROOT_DIR / ".env")),
        env_prefix="QMDH_",
    )

    def get_image_provider_profiles(self) -> dict[str, ImageProviderProfile]:
        profiles: dict[str, ImageProviderProfile] = {}

        if self.openai_image_api_key:
            profiles["openai_image"] = ImageProviderProfile(
                provider_name="openai_image",
                api_key=self.openai_image_api_key,
                base_url=self.openai_image_base_url,
                model_name=self.openai_image_model,
                timeout_seconds=self.openai_image_timeout_seconds,
                quality=self.openai_image_quality,
                output_format=self.openai_image_output_format,
            )

        raw_profiles = self.image_provider_profiles_json.strip()
        if not raw_profiles:
            return profiles

        parsed_profiles = json.loads(raw_profiles)
        if not isinstance(parsed_profiles, list):
            raise ValueError("QMDH_IMAGE_PROVIDER_PROFILES_JSON must be a JSON array")

        for item in parsed_profiles:
            if not isinstance(item, dict):
                raise ValueError("Each image provider profile must be a JSON object")

            if not item.get("enabled", True):
                continue

            provider_name = str(item.get("provider_name") or "").strip()
            api_key = str(item.get("api_key") or "").strip()
            base_url = str(item.get("base_url") or "").strip().rstrip("/")
            model_name = str(item.get("model_name") or "").strip()
            if not provider_name or not api_key or not base_url or not model_name:
                continue

            capabilities = item.get("capabilities") or ["image.generate"]
            if not isinstance(capabilities, list) or not capabilities:
                raise ValueError(f"Provider {provider_name} capabilities must be a non-empty JSON array")

            reference_mode = str(item.get("reference_mode") or "").strip()
            if not reference_mode:
                reference_mode = "caption_prompt" if "modelscope.cn" in base_url else "disabled"

            reference_caption_model = str(item.get("reference_caption_model") or "").strip() or None
            raw_fallback_models = item.get("reference_caption_fallback_models") or []
            if isinstance(raw_fallback_models, str):
                raw_fallback_models = [raw_fallback_models]
            if not isinstance(raw_fallback_models, list):
                raise ValueError(f"Provider {provider_name} reference_caption_fallback_models must be a JSON array")
            reference_caption_prompt = str(item.get("reference_caption_prompt") or "").strip()

            profiles[provider_name] = ImageProviderProfile(
                provider_name=provider_name,
                api_key=api_key,
                base_url=base_url,
                model_name=model_name,
                timeout_seconds=float(item.get("timeout_seconds") or 90.0),
                quality=str(item.get("quality") or "medium"),
                output_format=str(item.get("output_format") or "png"),
                adapter_kind=str(item.get("adapter_kind") or "openai_compatible"),
                capabilities=tuple(str(value) for value in capabilities if str(value).strip()),
                configurable=bool(item.get("configurable", True)),
                outbound=bool(item.get("outbound", True)),
                reference_mode=reference_mode,
                reference_caption_model=reference_caption_model,
                reference_caption_fallback_models=tuple(
                    str(value).strip() for value in raw_fallback_models if str(value).strip()
                )
                or DEFAULT_REFERENCE_CAPTION_FALLBACK_MODELS,
                reference_caption_prompt=reference_caption_prompt or DEFAULT_REFERENCE_CAPTION_PROMPT,
            )

        return profiles

    def get_image_provider_profile(self, provider_name: str) -> ImageProviderProfile:
        profiles = self.get_image_provider_profiles()
        if provider_name not in profiles:
            raise KeyError(f"Image provider profile not configured: {provider_name}")
        return profiles[provider_name]

    def get_auth_user_profiles(self) -> dict[str, AuthUserProfile]:
        raw_profiles = self.auth_users_json.strip()
        if not raw_profiles:
            return {}

        parsed_profiles = json.loads(raw_profiles)
        if not isinstance(parsed_profiles, list):
            raise ValueError("QMDH_AUTH_USERS_JSON must be a JSON array")

        profiles: dict[str, AuthUserProfile] = {}
        for item in parsed_profiles:
            if not isinstance(item, dict):
                raise ValueError("Each auth user profile must be a JSON object")

            name = str(item.get("name") or "").strip()
            token = str(item.get("token") or "").strip()
            role = str(item.get("role") or "designer").strip() or "designer"
            raw_project_codes = item.get("project_codes") or ["QMDH-001"]
            if isinstance(raw_project_codes, str):
                raw_project_codes = [raw_project_codes]
            if not isinstance(raw_project_codes, list):
                raise ValueError(f"Auth user {name or '<unnamed>'} project_codes must be a JSON array")
            project_codes = tuple(str(value).strip() for value in raw_project_codes if str(value).strip())

            if not name or not token:
                continue
            profiles[token] = AuthUserProfile(name=name, token=token, role=role, project_codes=project_codes)

        return profiles


settings = Settings()
