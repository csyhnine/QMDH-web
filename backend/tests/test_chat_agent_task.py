"""Tests for Chat agent HITL task proposals (B2 slim)."""

from __future__ import annotations

from app.services.chat_agent_task_service import (
    WRITE_TOOL_BY_WORKFLOW,
    proposal_from_confirm_payload,
)


def test_write_tool_mapping_covers_image_and_video() -> None:
    assert WRITE_TOOL_BY_WORKFLOW["image-generate"] == "create_image_generate_task"
    assert WRITE_TOOL_BY_WORKFLOW["image-edit"] == "create_image_edit_task"
    assert WRITE_TOOL_BY_WORKFLOW["video-generate"] == "create_video_generate_task"


def test_proposal_from_confirm_payload_roundtrip() -> None:
    proposal = proposal_from_confirm_payload(
        {
            "proposal_id": "abc-123",
            "workflow_key": "image-generate",
            "title": "测试生图",
            "project_code": "demo",
            "requested_provider": "demo-image",
            "provider_display_name": "Demo Image",
            "classification": "B",
            "payload": {"prompt": "glass facade", "aspect_ratio": "16:9", "resolution": "1k"},
            "summary": "16:9 · 1K · Demo Image · demo",
        }
    )
    assert proposal.proposal_id == "abc-123"
    assert proposal.workflow_key == "image-generate"
    assert proposal.payload["prompt"] == "glass facade"
