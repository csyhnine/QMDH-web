from __future__ import annotations

from dataclasses import dataclass

from app.core.config import settings


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


def get_provider_map() -> dict[str, ProviderDefinition]:
    providers = dict(STATIC_PROVIDERS)
    for profile in settings.get_image_provider_profiles().values():
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


def get_provider_definition(provider_name: str) -> ProviderDefinition:
    return get_provider_map()[provider_name]


def list_provider_capabilities() -> list[ProviderDefinition]:
    return list(get_provider_map().values())
