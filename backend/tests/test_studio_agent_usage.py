"""Unit tests for chat-agent usage extraction."""

from __future__ import annotations

from types import SimpleNamespace

from app.integrations.studio_agent.agent import _usage_fields_from_run_result


def test_usage_fields_from_run_result_maps_pydantic_ai_usage() -> None:
    result = SimpleNamespace(
        usage=lambda: SimpleNamespace(
            request_tokens=100,
            response_tokens=25,
            total_tokens=125,
            requests=2,
            details={"cache_read_input_tokens": 10},
        )
    )
    fields = _usage_fields_from_run_result(result)
    assert fields["prompt_tokens"] == 100
    assert fields["completion_tokens"] == 25
    assert fields["total_tokens"] == 125
    assert fields["cached_input_tokens"] == 10
    assert fields["usage_payload"]["source"] == "chat_agent"
    assert fields["usage_payload"]["requests"] == 2


def test_usage_fields_from_run_result_handles_missing_usage() -> None:
    fields = _usage_fields_from_run_result(SimpleNamespace())
    assert fields["total_tokens"] == 0
    assert fields["usage_payload"]["source"] == "chat_agent"
