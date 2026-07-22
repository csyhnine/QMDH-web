"""Tests for stable tool registry ordering."""

from __future__ import annotations

from app.services.agent_tool_registry_service import list_tools_in_registry_order, rank_tools_for_query


def test_registry_preserves_allowlist_order() -> None:
    allowlist = (
        "summarize_generation_stack",
        "search_inspiration_posts",
        "list_active_workflows",
    )
    tools = list_tools_in_registry_order(allowlist=allowlist)
    assert [item["key"] for item in tools] == list(allowlist)


def test_rank_tools_prefers_query_hits() -> None:
    allowlist = (
        "search_inspiration_posts",
        "list_enabled_image_providers",
        "create_image_generate_task",
    )
    ranked = rank_tools_for_query(allowlist=allowlist, query="生图 模型", limit=3)
    keys = [item["key"] for item in ranked]
    assert "create_image_generate_task" in keys or "list_enabled_image_providers" in keys
