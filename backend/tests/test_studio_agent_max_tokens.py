"""Studio agent request shaping (max_tokens clamp)."""

from __future__ import annotations

from app.integrations.studio_agent.agent import STUDIO_AGENT_MAX_TOKENS


def test_studio_agent_max_tokens_is_bounded() -> None:
    """Upstream OpenRouter pre-auths by max_tokens; keep well below model ceilings like 65536."""
    assert 256 <= STUDIO_AGENT_MAX_TOKENS <= 8192
