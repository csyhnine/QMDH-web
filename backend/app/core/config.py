from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.services.provider_strategy import normalize_provider_base_url, normalize_strategies


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
    api_secret: str = ""
    display_name: str = ""
    timeout_seconds: float = 300.0
    quality: str = "medium"
    output_format: str = "png"
    pricing_currency: str = "CNY"
    pricing_unit: str = "per_image"
    unit_price: float = 0.0
    adapter_kind: str = "openai_compatible"
    capabilities: tuple[str, ...] = ("image.generate",)
    configurable: bool = True
    outbound: bool = True
    reference_mode: str = "disabled"
    reference_caption_model: str | None = None
    reference_caption_fallback_models: tuple[str, ...] = DEFAULT_REFERENCE_CAPTION_FALLBACK_MODELS
    reference_caption_prompt: str = DEFAULT_REFERENCE_CAPTION_PROMPT
    strategies: dict[str, str] = field(default_factory=dict)
    adapter_config: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class AuthUserProfile:
    name: str
    token: str
    role: str = "designer"
    project_codes: tuple[str, ...] = ("QMDH-001",)
    user_id: int | None = None
    display_name: str = ""


@dataclass(frozen=True)
class AgentAuthProfile:
    client_id: int
    key: str
    display_name: str
    device_id: str
    environment: str
    user_id: int | None
    user_name: str
    user_role: str
    project_codes: tuple[str, ...]
    request_id: str = ""
    external_execution_id: str = ""

    @property
    def auth_user(self) -> AuthUserProfile:
        return AuthUserProfile(
            name=self.user_name,
            token=self.key,
            role=self.user_role,
            project_codes=self.project_codes,
            user_id=self.user_id,
            display_name=self.display_name or self.user_name,
        )


@dataclass(frozen=True)
class AgentClientSeedProfile:
    key: str
    token: str
    user_name: str
    device_id: str = ""
    display_name: str = ""
    role: str = "designer"
    environment: str = "test"
    project_codes: tuple[str, ...] = ("QMDH-001",)
    capabilities: tuple[str, ...] = ()


class Settings(BaseSettings):
    app_name: str = "QMDH Internal AI Platform"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./app.db"
    frontend_origin: str = "http://127.0.0.1:18080"
    media_root: str = "./storage/assets"
    media_url_prefix: str = "/media"
    public_media_base_url: str = ""
    storage_backend: str = "local"
    cdn_base_url: str = ""
    oss_endpoint: str = ""
    oss_bucket_name: str = ""
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""
    oss_connect_timeout_seconds: float = 30.0
    task_execution_mode: str = "background"
    redis_url: str = "redis://localhost:6379/0"
    redis_queue_name: str = "qmdh:tasks"
    openai_image_api_key: str | None = None
    openai_image_base_url: str = "https://api.openai.com/v1"
    openai_image_model: str = "gpt-image-1"
    openai_image_timeout_seconds: float = 300.0
    openai_image_quality: str = "medium"
    openai_image_output_format: str = "png"
    bigjpg_api_key: str = ""
    bigjpg_base_url: str = "https://bigjpg.com/api"
    image_provider_profiles_json: str = "[]"
    auth_users_json: str = (
        '[{"name":"reviewer","token":"dev-reviewer-token","role":"reviewer","project_codes":["QMDH-001"]}]'
    )
    bootstrap_admin_name: str = "admin"
    bootstrap_admin_password: str = "dev-admin-password"
    auth_session_days: int = 7
    encryption_key: str = ""  # Fernet key for encrypting sensitive data like API keys
    agent_clients_json: str = (
        '[{"key":"openclaw-dev","token":"dev-openclaw-agent-token","user_name":"designer.arch",'
        '"display_name":"OpenClaw Dev","device_id":"LOCAL-OPENCLAW","role":"designer",'
        '"environment":"test","project_codes":["QMDH-001"],'
        '"capabilities":["image.generate","image.edit","inspiration.import","project.asset","research.note"]}]'
    )
    cors_origins: str = ""  # Comma-separated list of allowed origins; falls back to frontend_origin if empty
    rate_limit_enabled: bool = False
    rate_limit_general_per_minute: int = 60
    rate_limit_generation_per_minute: int = 10
    rate_limit_login_per_minute: int = 10
    session_cleanup_interval_seconds: int = 3600
    meilisearch_enabled: bool = False
    meilisearch_url: str = "http://meilisearch:7700"
    meilisearch_api_key: str = ""
    meilisearch_inspiration_index: str = "qmdh_inspiration"
    meilisearch_templates_index: str = "qmdh_templates"
    meilisearch_agent_memory_index: str = "qmdh_agent_memory"
    crawl_allowed_domains: str = ""
    studio_agent_enabled: bool = False

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), str(REPO_ROOT_DIR / ".env")),
        env_prefix="QMDH_",
    )

    def get_cors_origins(self) -> list[str]:
        """Parse QMDH_CORS_ORIGINS as a comma-separated list of allowed origins.

        Rules:
        - Strip whitespace, ignore empty entries
        - Max 20 entries, max 253 chars each (longer entries skipped)
        - Falls back to [frontend_origin] when QMDH_CORS_ORIGINS is empty
        - When QMDH_CORS_ORIGINS is set, ignores frontend_origin
        """
        raw = (self.cors_origins or "").strip()
        if not raw:
            return [self.frontend_origin] if self.frontend_origin else []

        entries: list[str] = []
        for entry in raw.split(","):
            cleaned = entry.strip()
            if not cleaned:
                continue
            if len(cleaned) > 253:
                continue  # Skip entries that are too long
            entries.append(cleaned)
            if len(entries) >= 20:
                break  # Cap at 20 entries
        return entries

    def get_image_provider_profiles(self) -> dict[str, ImageProviderProfile]:
        profiles: dict[str, ImageProviderProfile] = {}

        if self.openai_image_api_key:
            profiles["openai_image"] = ImageProviderProfile(
                provider_name="openai_image",
                display_name=self.openai_image_model,
                api_key=self.openai_image_api_key,
                base_url=self.openai_image_base_url,
                model_name=self.openai_image_model,
                timeout_seconds=self.openai_image_timeout_seconds,
                quality=self.openai_image_quality,
                output_format=self.openai_image_output_format,
            )

        if self.bigjpg_api_key.strip():
            profiles["bigjpg"] = ImageProviderProfile(
                provider_name="bigjpg",
                display_name="高清放大",
                api_key=self.bigjpg_api_key.strip(),
                base_url=normalize_provider_base_url(self.bigjpg_base_url.strip() or "https://bigjpg.com/api"),
                model_name="bigjpg",
                timeout_seconds=600.0,
                output_format="png",
                pricing_currency="CNY",
                pricing_unit="per_request",
                unit_price=0.0,
                adapter_kind="bigjpg",
                capabilities=("image.upscale",),
                strategies={"image.upscale": "bigjpg_upscale"},
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
            base_url = normalize_provider_base_url(str(item.get("base_url") or "").strip())
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
                display_name=str(item.get("display_name") or model_name).strip() or model_name,
                api_key=api_key,
                api_secret=str(item.get("api_secret") or "").strip(),
                base_url=base_url,
                model_name=model_name,
                timeout_seconds=float(item.get("timeout_seconds") or 300.0),
                quality=str(item.get("quality") or "medium"),
                output_format=str(item.get("output_format") or "png"),
                pricing_currency=str(item.get("pricing_currency") or "CNY").upper(),
                pricing_unit=str(item.get("pricing_unit") or "per_image"),
                unit_price=float(item.get("unit_price") or 0.0),
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
                strategies=normalize_strategies(item.get("strategies") or {}),
                adapter_config=item.get("adapter_config") if isinstance(item.get("adapter_config"), dict) else {},
            )

        return profiles

    def get_session_cleanup_interval_seconds(self) -> int:
        interval = int(self.session_cleanup_interval_seconds)
        if not 60 <= interval <= 86400:
            raise ValueError("QMDH_SESSION_CLEANUP_INTERVAL_SECONDS must be between 60 and 86400")
        return interval

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
            raw_user_id = item.get("user_id")
            user_id = int(raw_user_id) if raw_user_id not in (None, "") else None
            display_name = str(item.get("display_name") or "").strip()

            if not name or not token:
                continue
            profiles[token] = AuthUserProfile(
                name=name,
                token=token,
                role=role,
                project_codes=project_codes,
                user_id=user_id,
                display_name=display_name,
            )

        return profiles

    def get_agent_client_profiles(self) -> dict[str, AgentClientSeedProfile]:
        raw_profiles = self.agent_clients_json.strip()
        if not raw_profiles:
            return {}

        parsed_profiles = json.loads(raw_profiles)
        if not isinstance(parsed_profiles, list):
            raise ValueError("QMDH_AGENT_CLIENTS_JSON must be a JSON array")

        profiles: dict[str, AgentClientSeedProfile] = {}
        for item in parsed_profiles:
            if not isinstance(item, dict):
                raise ValueError("Each agent client profile must be a JSON object")

            key = str(item.get("key") or "").strip()
            token = str(item.get("token") or "").strip()
            user_name = str(item.get("user_name") or "").strip()
            if not key or not token or not user_name:
                continue

            raw_project_codes = item.get("project_codes") or ["QMDH-001"]
            if isinstance(raw_project_codes, str):
                raw_project_codes = [raw_project_codes]
            if not isinstance(raw_project_codes, list):
                raise ValueError(f"Agent client {key} project_codes must be a JSON array")

            raw_capabilities = item.get("capabilities") or []
            if isinstance(raw_capabilities, str):
                raw_capabilities = [raw_capabilities]
            if not isinstance(raw_capabilities, list):
                raise ValueError(f"Agent client {key} capabilities must be a JSON array")

            profiles[key] = AgentClientSeedProfile(
                key=key,
                token=token,
                user_name=user_name,
                display_name=str(item.get("display_name") or "").strip(),
                device_id=str(item.get("device_id") or "").strip(),
                role=str(item.get("role") or "designer").strip() or "designer",
                environment=str(item.get("environment") or "test").strip() or "test",
                project_codes=tuple(str(value).strip() for value in raw_project_codes if str(value).strip()),
                capabilities=tuple(str(value).strip() for value in raw_capabilities if str(value).strip()),
            )

        return profiles


settings = Settings()


def validate_required_for_production() -> None:
    """Validate that REQUIRED environment variables are set for production.

    Call this at startup. If any required variable is missing, prints an error
    to stderr and exits with code 1 before the server binds a port.
    """
    import sys

    # Only enforce in production (non-sqlite database URL indicates production)
    if settings.database_url.startswith("sqlite"):
        return

    required = {
        "QMDH_DATABASE_URL": settings.database_url,
        "QMDH_REDIS_URL": settings.redis_url,
        "QMDH_ENCRYPTION_KEY": settings.encryption_key,
    }
    if settings.bootstrap_admin_name.strip():
        required["QMDH_BOOTSTRAP_ADMIN_PASSWORD"] = settings.bootstrap_admin_password

    missing = [name for name, value in required.items() if not value or not value.strip()]
    if missing:
        for name in missing:
            print(f"ERROR: Required environment variable {name} is missing or empty.", file=sys.stderr)
        sys.exit(1)

    if settings.bootstrap_admin_name.strip() and settings.bootstrap_admin_password.strip() == "dev-admin-password":
        print(
            "ERROR: QMDH_BOOTSTRAP_ADMIN_PASSWORD must be changed from the development default in production.",
            file=sys.stderr,
        )
        sys.exit(1)
