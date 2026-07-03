import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import AgentSkillRelease, User
from app.routers import auth, chat


class ChatAgentPolicyApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            db.add(
                User(
                    name="designer.arch",
                    display_name="Designer",
                    role="designer",
                    password_hash=hash_password("qmdh-arch-2026"),
                    is_active=True,
                    project_codes=["QMDH-001"],
                )
            )
            db.add(
                AgentSkillRelease(
                    key="qmdh-chat-prod",
                    display_name="生产 Chat 策略",
                    environment="prod",
                    openclaw_version="latest",
                    skill_keys=[],
                    system_prompt_template="回答时保持简洁。",
                    chat_tool_allowlist=["search_shared_templates", "search_inspiration_posts"],
                    notes="",
                    is_active=True,
                )
            )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(auth.router, prefix="/api/v1")
        self.app.include_router(chat.router, prefix="/api/v1")
        self.client = TestClient(self.app)

    def _login(self) -> dict[str, str]:
        response = self.client.post(
            "/api/v1/auth/login",
            json={"username": "designer.arch", "password": "qmdh-arch-2026"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}

    def test_get_chat_agent_policy_returns_enabled_tools(self) -> None:
        response = self.client.get("/api/v1/chat/agent-policy", headers=self._login())
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["policy_version"], "qmdh-chat-prod")
        self.assertEqual(payload["release_display_name"], "生产 Chat 策略")
        self.assertEqual(len(payload["enabled_tools"]), 2)
        self.assertIn("data_scope_note", payload)
        self.assertIn("baseline_prompt", payload)
