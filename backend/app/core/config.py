from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT_DIR = BACKEND_DIR.parent


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
            )

        return profiles

    def get_image_provider_profile(self, provider_name: str) -> ImageProviderProfile:
        profiles = self.get_image_provider_profiles()
        if provider_name not in profiles:
            raise KeyError(f"Image provider profile not configured: {provider_name}")
        return profiles[provider_name]


settings = Settings()
