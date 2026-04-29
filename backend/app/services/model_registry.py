from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import ImageProviderProfile, settings
from app.models import ProviderProfile


@dataclass(frozen=True)
class ProviderDefinition:
    provider_name: str
    model_name: str
    capabilities: list[str]
    configurable: bool = True
    outbound: bool = True
    adapter_kind: str = "simulated"
    runtime_profile_name: str | None = None


STATIC_PROVIDERS: dict[str, ProviderDefinition] = {
    "jimeng": ProviderDefinition("jimeng", "jimeng-4.0", ["image.generate", "image.edit"]),
    "nano_banana": ProviderDefinition("nano_banana", "nano-banana-pro", ["image.generate", "image.edit"]),
    "openai": ProviderDefinition("openai", "gpt-4.1", ["text.generate", "document.generate", "image.edit"]),
    "anthropic": ProviderDefinition("anthropic", "claude-sonnet-4", ["text.generate", "document.generate"]),
    "runway": ProviderDefinition("runway", "gen-4-turbo", ["video.generate"]),
}


def _profile_from_record(record: ProviderProfile) -> ImageProviderProfile:
    reference_mode = record.reference_mode.strip() if record.reference_mode else ""
    if not reference_mode:
        reference_mode = "caption_prompt" if "modelscope.cn" in record.base_url else "disabled"

    return ImageProviderProfile(
        provider_name=record.provider_name,
        api_key=record.api_key,
        base_url=record.base_url.rstrip("/"),
        model_name=record.model_name,
        timeout_seconds=record.timeout_seconds,
        quality=record.quality,
        output_format=record.output_format,
        adapter_kind=record.adapter_kind,
        capabilities=tuple(record.capabilities or ["image.generate"]),
        configurable=True,
        outbound=True,
        reference_mode=reference_mode,
        reference_caption_model=record.reference_caption_model,
    )


def get_image_provider_profiles(db: Session | None = None) -> dict[str, ImageProviderProfile]:
    profiles = settings.get_image_provider_profiles()
    if db is None:
        return profiles

    records = db.scalars(select(ProviderProfile).order_by(ProviderProfile.provider_name)).all()
    for record in records:
        if record.enabled and record.api_key and record.base_url and record.model_name:
            profiles[record.provider_name] = _profile_from_record(record)
    return profiles


def get_image_provider_profile(provider_name: str, db: Session | None = None) -> ImageProviderProfile:
    profiles = get_image_provider_profiles(db)
    if provider_name not in profiles:
        raise KeyError(f"Image provider profile not configured: {provider_name}")
    return profiles[provider_name]


def get_provider_map(db: Session | None = None) -> dict[str, ProviderDefinition]:
    providers = dict(STATIC_PROVIDERS)
    for profile in get_image_provider_profiles(db).values():
        providers[profile.provider_name] = ProviderDefinition(
            provider_name=profile.provider_name,
            model_name=profile.model_name,
            capabilities=list(profile.capabilities),
            configurable=profile.configurable,
            outbound=profile.outbound,
            adapter_kind=profile.adapter_kind,
            runtime_profile_name=profile.provider_name,
        )
    return providers


def get_provider_definition(provider_name: str, db: Session | None = None) -> ProviderDefinition:
    return get_provider_map(db)[provider_name]


def list_provider_capabilities(db: Session | None = None) -> list[ProviderDefinition]:
    return list(get_provider_map(db).values())
