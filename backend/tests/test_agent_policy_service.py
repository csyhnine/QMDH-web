import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AgentSkillRelease
from app.services.agent_policy_service import (
    CHAT_AGENT_BASELINE_PROMPT,
    build_chat_system_prompt,
    normalize_chat_tool_allowlist,
    resolve_effective_chat_policy,
)


class AgentPolicyServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_normalize_chat_tool_allowlist_falls_back_to_defaults(self) -> None:
        self.assertEqual(len(normalize_chat_tool_allowlist([])), 5)
        self.assertEqual(
            normalize_chat_tool_allowlist(["search_inspiration_posts"]),
            ("search_inspiration_posts",),
        )

    def test_resolve_active_prod_release(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                AgentSkillRelease(
                    key="qmdh-chat-prod",
                    display_name="Prod chat policy",
                    environment="prod",
                    openclaw_version="latest",
                    skill_keys=[],
                    system_prompt_template="寒暄时简短回复。",
                    chat_tool_allowlist=["search_shared_templates"],
                    notes="",
                    is_active=True,
                )
            )
            db.commit()

            policy = resolve_effective_chat_policy(db, environment="prod")

        self.assertEqual(policy.policy_version, "qmdh-chat-prod")
        self.assertIn("寒暄时简短回复。", policy.system_prompt)
        self.assertEqual(policy.chat_tool_allowlist, ("search_shared_templates",))

    def test_resolve_pinned_policy_version(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                AgentSkillRelease(
                    key="qmdh-chat-test",
                    display_name="Test chat policy",
                    environment="test",
                    openclaw_version="latest",
                    skill_keys=[],
                    system_prompt_template="测试 overlay",
                    chat_tool_allowlist=["summarize_generation_stack"],
                    notes="",
                    is_active=False,
                )
            )
            db.commit()

            policy = resolve_effective_chat_policy(db, policy_version="qmdh-chat-test")

        self.assertEqual(policy.policy_version, "qmdh-chat-test")
        self.assertEqual(policy.chat_tool_allowlist, ("summarize_generation_stack",))

    def test_build_chat_system_prompt_keeps_baseline(self) -> None:
        prompt = build_chat_system_prompt(baseline=CHAT_AGENT_BASELINE_PROMPT, template="")
        self.assertEqual(prompt, CHAT_AGENT_BASELINE_PROMPT.strip())

        overlay = build_chat_system_prompt(baseline=CHAT_AGENT_BASELINE_PROMPT, template="额外规则")
        self.assertIn(CHAT_AGENT_BASELINE_PROMPT.strip(), overlay)
        self.assertIn("额外规则", overlay)
