"""Tests for agent persona roster and routing."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import AgentPersona, Base, User, UserAgentAssignment
from app.services.agent_persona_service import (
    AssignedAgentPersona,
    classify_route,
    ensure_default_personas,
    ensure_default_roster_for_user,
    intersect_allowlists,
    load_user_agent_roster,
    replace_user_roster,
)


class AgentPersonaServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)

    def _session(self) -> Session:
        return self.session_factory()

    def test_default_personas_and_roster_seed(self) -> None:
        with self._session() as db:
            user = User(name="designer-a", display_name="Designer A", role="designer", is_active=True)
            db.add(user)
            db.commit()

            personas = ensure_default_personas(db)
            self.assertEqual({"qmdh-coordinator", "qmdh-research", "qmdh-studio"}, set(personas.keys()))

            assignments = ensure_default_roster_for_user(db, user.id)
            db.commit()
            self.assertEqual(3, len(assignments))

            roster = load_user_agent_roster(db, user.id)
            self.assertEqual(3, len(roster))
            self.assertTrue(any(item.role == "coordinator" and item.is_primary for item in roster))

    def test_replace_user_roster(self) -> None:
        with self._session() as db:
            user = User(name="designer-b", display_name="Designer B", role="designer", is_active=True)
            db.add(user)
            db.commit()

            personas = ensure_default_personas(db)
            db.commit()
            research = personas["qmdh-research"]
            coordinator = personas["qmdh-coordinator"]

            replace_user_roster(
                db,
                user_id=user.id,
                persona_ids=[research.id, coordinator.id],
                primary_persona_id=coordinator.id,
            )
            db.commit()

            roster = load_user_agent_roster(db, user.id)
            self.assertEqual(2, len(roster))
            self.assertTrue(any(item.key == "qmdh-coordinator" and item.is_primary for item in roster))

    def test_classify_route(self) -> None:
        roster = [
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
        self.assertEqual("studio", classify_route("帮我生图，商业综合体黄昏效果", roster=roster))
        self.assertEqual("research", classify_route("搜索玻璃幕墙高层灵感", roster=roster))
        self.assertEqual("direct", classify_route("你好", roster=roster))

    def test_intersect_allowlists(self) -> None:
        result = intersect_allowlists(
            ("search_inspiration_posts", "summarize_generation_stack"),
            ("summarize_generation_stack", "propose_image_generate_task"),
        )
        self.assertEqual(("summarize_generation_stack",), result)


if __name__ == "__main__":
    unittest.main()
