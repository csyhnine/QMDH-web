from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderDefinition:
    provider_name: str
    model_name: str
    capabilities: list[str]
    configurable: bool = True
    outbound: bool = True


PROVIDERS: dict[str, ProviderDefinition] = {
    "jimeng": ProviderDefinition("jimeng", "jimeng-4.0", ["image.generate", "image.edit"]),
    "nano_banana": ProviderDefinition("nano_banana", "nano-banana-pro", ["image.generate", "image.edit"]),
    "openai": ProviderDefinition("openai", "gpt-4.1", ["text.generate", "document.generate", "image.edit"]),
    "anthropic": ProviderDefinition("anthropic", "claude-sonnet-4", ["text.generate", "document.generate"]),
    "runway": ProviderDefinition("runway", "gen-4-turbo", ["video.generate"]),
}


def list_provider_capabilities() -> list[ProviderDefinition]:
    return list(PROVIDERS.values())
