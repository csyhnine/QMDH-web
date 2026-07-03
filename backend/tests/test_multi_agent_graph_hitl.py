"""Tests for LangGraph HITL interrupt/resume."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.integrations.multi_agent.graph import graph_has_pending_interrupt, resume_multi_agent_graph, run_multi_agent_graph
from app.integrations.studio_agent.agent import ChatAgentToolCall, StudioAgentReply
from app.models import AgentMemoryEntry, Base, User
from app.services.agent_persona_service import ensure_default_personas, ensure_default_roster_for_user


class MultiAgentGraphHitlTests(unittest.TestCase):
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

    @patch("app.integrations.multi_agent.nodes.run_studio_agent")
    def test_interrupt_and_resume_after_task_proposal(self, mock_run) -> None:
        proposal = {
            "proposal_id": "prop-1",
            "workflow_key": "image-generate",
            "title": "Test",
            "project_code": "QMDH-001",
            "requested_provider": "simulated",
            "provider_display_name": "Simulated",
            "classification": "internal",
            "payload": {"prompt": "test"},
            "summary": "生图提案",
            "status": "pending_confirmation",
        }
        mock_run.return_value = StudioAgentReply(
            text="已生成待确认任务",
            provider_name="test",
            model_name="test-model",
            tool_calls=(ChatAgentToolCall(name="propose_image_generate_task", summary="proposal"),),
            task_proposals=(proposal,),
            policy_version="qmdh-chat-prod",
        )

        with self._session() as db:
            user = User(name="hitl-user", display_name="Hitl User", role="designer", is_active=True)
            db.add(user)
            db.commit()

            ensure_default_personas(db)
            ensure_default_roster_for_user(db, user.id)
            db.commit()

            state = {
                "message": "帮我生图",
                "user_message_raw": "帮我生图",
                "user_id": user.id,
                "user_name": user.name,
                "conversation_id": 42,
                "provider_id": None,
                "policy_version": "qmdh-chat-prod",
                "memory_context": "",
                "memory_hit_count": 0,
                "session_summary_used": False,
                "tool_calls": [],
                "task_proposals": [],
                "thinking_steps": [],
            }

            run = run_multi_agent_graph(
                db,
                state=state,
                thinking_callback=None,
                thread_id="chat-42",
            )
            self.assertTrue(run.interrupted)
            self.assertIsNotNone(run.interrupt_payload)
            self.assertTrue(graph_has_pending_interrupt(db, thread_id="chat-42"))

            resume = resume_multi_agent_graph(
                db,
                thread_id="chat-42",
                resume_payload={
                    "status": "confirmed",
                    "proposal_id": "prop-1",
                    "task_id": 99,
                    "workflow_key": "image-generate",
                },
            )
            self.assertFalse(resume.interrupted)

            hitl_entries = list(
                db.scalars(
                    select(AgentMemoryEntry).where(
                        AgentMemoryEntry.user_id == user.id,
                        AgentMemoryEntry.source_turn_ref == "conv:42:hitl:prop-1",
                    )
                ).all()
            )
            self.assertEqual(1, len(hitl_entries))
            self.assertIn("task_id=99", hitl_entries[0].content)


if __name__ == "__main__":
    unittest.main()
