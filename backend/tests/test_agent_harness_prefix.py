"""Harness L3 prefix thinning (2026-08 slice A)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from app.integrations.studio_agent.tools import (
    allowlist_needs_generation_models,
    format_enabled_generation_models_note,
)
from app.services.agent_policy_service import DEFAULT_CHAT_TOOL_ALLOWLIST


def test_allowlist_needs_generation_models_detects_create_tools() -> None:
    assert allowlist_needs_generation_models(DEFAULT_CHAT_TOOL_ALLOWLIST) is True
    assert allowlist_needs_generation_models(("search_shared_templates", "memory_recall")) is False
    assert allowlist_needs_generation_models(()) is False
    assert allowlist_needs_generation_models(None) is False


def test_format_enabled_generation_models_note_compact() -> None:
    ctx = SimpleNamespace(db=object())
    providers = [
        {
            "provider_name": "gemini-3.1-flash-image",
            "display_name": "Nano Banana PRO",
            "model_name": "gemini-3.1-flash-image",
            "capabilities": ["image.generate", "image.edit"],
        },
        {
            "provider_name": "bigjpg",
            "display_name": "Bigjpg",
            "model_name": "bigjpg",
            "capabilities": ["image.upscale"],
        },
    ]

    with patch(
        "app.integrations.studio_agent.tools.list_enabled_image_providers",
        return_value=providers,
    ):
        compact = format_enabled_generation_models_note(ctx, compact=True)  # type: ignore[arg-type]
        verbose = format_enabled_generation_models_note(ctx, compact=False)  # type: ignore[arg-type]

    assert "gemini-3.1-flash-image" in compact
    assert "bigjpg" in compact
    assert "caps=[" not in compact
    assert "display=`" not in compact
    assert len(compact) < len(verbose)
    assert "caps=[image.generate, image.edit]" in verbose
