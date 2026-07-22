import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base
from app.models import AgentPolicyOverride, AgentSkillRelease, User
from app.services.agent_policy_service import resolve_effective_chat_policy


class AgentPolicyOverrideTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            user = User(
                name="designer.arch",
                display_name="Designer",
                role="designer",
                password_hash=hash_password("qmdh-arch-2026"),
                is_active=True,
                project_codes=["QMDH-001"],
                group_name="建筑一所",
            )
            db.add(user)
            db.flush()
            self.user_id = user.id
            db.add(
                AgentSkillRelease(
                    key="qmdh-chat-prod",
                    display_name="Prod",
                    environment="prod",
                    openclaw_version="latest",
                    skill_keys=[],
                    system_prompt_template="发布 overlay",
                    chat_tool_allowlist=[
                        "search_shared_templates",
                        "search_inspiration_posts",
                        "list_active_workflows",
                    ],
                    notes="",
                    is_active=True,
                )
            )
            db.add(
                AgentPolicyOverride(
                    scope="group",
                    scope_key="建筑一所",
                    disabled_tool_keys=["search_inspiration_posts"],
                    system_prompt_overlay="优先共享模板。",
                    notes="",
                    is_active=True,
                )
            )
            db.add(
                AgentPolicyOverride(
                    scope="user",
                    scope_key=str(user.id),
                    disabled_tool_keys=["list_active_workflows"],
                    system_prompt_overlay="回答不超过三条。",
                    notes="",
                    is_active=True,
                )
            )
            db.commit()

    def test_effective_policy_merges_group_and_user_overrides(self) -> None:
        with self.SessionLocal() as db:
            policy = resolve_effective_chat_policy(db, environment="prod", user_id=self.user_id)

        self.assertEqual(policy.policy_version, "qmdh-chat-prod")
        self.assertIn("search_shared_templates", policy.chat_tool_allowlist)
        self.assertNotIn("search_inspiration_posts", policy.chat_tool_allowlist)
        self.assertNotIn("list_active_workflows", policy.chat_tool_allowlist)
        self.assertIn("发布 overlay", policy.system_prompt)
        self.assertIn("优先共享模板。", policy.system_prompt)
        self.assertIn("回答不超过三条。", policy.system_prompt)
        self.assertEqual(set(policy.disabled_tool_keys), {"search_inspiration_posts", "list_active_workflows"})
        self.assertEqual(len(policy.layers), 3)
