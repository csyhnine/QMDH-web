"""Tests for agent routing service."""

from __future__ import annotations

import unittest

from app.services.agent_persona_service import AssignedAgentPersona
from app.services.agent_routing_service import resolve_route


def _full_roster() -> list[AssignedAgentPersona]:
    return [
        AssignedAgentPersona(
            id=1,
            key="qmdh-coordinator",
            display_name="协调",
            role="coordinator",
            system_prompt_template="",
            chat_tool_allowlist=(),
            memory_scope="user",
            is_primary=True,
        ),
        AssignedAgentPersona(
            id=2,
            key="qmdh-research",
            display_name="检索",
            role="research",
            system_prompt_template="",
            chat_tool_allowlist=("search_inspiration_posts",),
            memory_scope="both",
            is_primary=False,
        ),
        AssignedAgentPersona(
            id=3,
            key="qmdh-studio",
            display_name="生图",
            role="studio",
            system_prompt_template="",
            chat_tool_allowlist=("propose_image_generate_task",),
            memory_scope="both",
            is_primary=False,
        ),
    ]


class AgentRoutingServiceTests(unittest.TestCase):
    def test_studio_route(self) -> None:
        decision = resolve_route("帮我生图，商业综合体黄昏效果", roster=_full_roster())
        self.assertEqual("studio", decision.route)
        self.assertGreaterEqual(decision.confidence, 0.65)

    def test_research_route(self) -> None:
        decision = resolve_route("搜索玻璃幕墙高层灵感", roster=_full_roster())
        self.assertEqual("research", decision.route)

    def test_greeting_direct(self) -> None:
        decision = resolve_route("你好", roster=_full_roster())
        self.assertEqual("direct", decision.route)
        self.assertEqual("greeting", decision.reason)

    def test_composite_research_then_studio(self) -> None:
        decision = resolve_route(
            "先搜索商业综合体黄昏参考，再帮我生图",
            roster=_full_roster(),
        )
        self.assertEqual("research_then_studio", decision.route)
        self.assertEqual("composite_intent", decision.reason)
        self.assertEqual("score", decision.method)

    def test_empty_message(self) -> None:
        decision = resolve_route("", roster=_full_roster())
        self.assertEqual("direct", decision.route)
        self.assertEqual("empty_message", decision.reason)


if __name__ == "__main__":
    unittest.main()
