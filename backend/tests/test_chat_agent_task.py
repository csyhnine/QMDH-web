import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.encryption import encrypt_value
from app.core.security import hash_password
from app.database import Base, get_db
from app.integrations.studio_agent.agent import ChatAgentToolCall, StudioAgentReply
from app.integrations.studio_agent.tools import StudioToolContext
from app.models import AgentSkillRelease, Project, ProviderProfile, Task, User, Workflow
from app.routers import auth, chat
from app.services.chat_agent_task_service import build_image_generate_proposal, resolve_requested_provider_name


class ChatAgentTaskServiceTests(unittest.TestCase):
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
            )
            db.add(user)
            db.flush()
            db.add(
                Project(
                    code="QMDH-001",
                    name="Default",
                    owner_user_id=user.id,
                )
            )
            db.add(
                Workflow(
                    key="image-generate",
                    name="Image Generate",
                    description="Generate image",
                    category="image",
                    provider_capability="image.generate",
                )
            )
            db.add(
                ProviderProfile(
                    provider_name="gemini-3.1-flash-image",
                    display_name="Gemini 3.1 Flash",
                    api_key=encrypt_value("test-key"),
                    base_url="https://newapi.haodeya.xyz/v1",
                    model_name="gemini-3.1-flash-image",
                    adapter_kind="openai_compatible",
                    capabilities=["image.generate", "image.edit"],
                    enabled=True,
                )
            )
            db.commit()
            self.user_id = user.id

    def test_build_image_generate_proposal_returns_structured_payload(self) -> None:
        with self.SessionLocal() as db:
            ctx = StudioToolContext(db=db, user_name="designer.arch", user_id=self.user_id)
            proposal = build_image_generate_proposal(
                ctx,
                prompt="现代商业综合体鸟瞰效果图",
                requested_provider="gemini-3.1-flash-image",
                aspect_ratio="16:9",
                resolution="2k",
                image_count=1,
            )
            payload = proposal.to_dict()
            self.assertEqual(payload["workflow_key"], "image-generate")
            self.assertEqual(payload["project_code"], "QMDH-001")
            self.assertEqual(payload["payload"]["resolution"], "2k")
            self.assertTrue(payload["proposal_id"])


    def test_resolve_requested_provider_name_matches_display_name(self) -> None:
        with self.SessionLocal() as db:
            resolved = resolve_requested_provider_name(db, "Gemini 3.1 Flash")
            self.assertEqual(resolved, "gemini-3.1-flash-image")


class ChatAgentTaskConfirmApiTests(unittest.TestCase):
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
            )
            db.add(user)
            db.flush()
            db.add(
                Project(
                    code="QMDH-001",
                    name="Default",
                    owner_user_id=user.id,
                )
            )
            db.add(
                Workflow(
                    key="image-generate",
                    name="Image Generate",
                    description="Generate image",
                    category="image",
                    provider_capability="image.generate",
                )
            )
            db.add(
                ProviderProfile(
                    provider_name="gemini-3.1-flash-image",
                    display_name="Gemini 3.1 Flash",
                    api_key=encrypt_value("test-key"),
                    base_url="https://newapi.haodeya.xyz/v1",
                    model_name="gemini-3.1-flash-image",
                    adapter_kind="openai_compatible",
                    capabilities=["image.generate", "image.edit"],
                    enabled=True,
                )
            )
            db.add(
                ProviderProfile(
                    provider_name="ms_zhipuai_glm-5",
                    api_key=encrypt_value("test-key"),
                    base_url="https://api-inference.modelscope.cn/v1",
                    model_name="ZhipuAI/GLM-5",
                    adapter_kind="openai_compatible",
                    capabilities=["chat.completions"],
                    enabled=True,
                )
            )
            db.add(
                AgentSkillRelease(
                    key="qmdh-chat-prod",
                    display_name="Chat Prod",
                    environment="prod",
                    openclaw_version="latest",
                    skill_keys=[],
                    system_prompt_template="",
                    chat_tool_allowlist=[
                        "search_shared_templates",
                        "propose_image_generate_task",
                    ],
                    notes="",
                    is_active=True,
                )
            )
            db.commit()
            self.chat_provider_id = db.scalar(
                select(ProviderProfile.id).where(ProviderProfile.provider_name == "ms_zhipuai_glm-5")
            )

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

    @patch("app.services.chat_agent_task_service.execute_task")
    @patch("app.routers.chat.run_studio_agent_isolated")
    def test_agent_mode_streams_task_proposals_and_confirm_creates_task(
        self, mock_run_studio_agent, _mock_execute_task
    ) -> None:
        headers = self._login()
        conversation = self.client.post(
            "/api/v1/chat/conversations",
            headers=headers,
            json={"model_provider_id": self.chat_provider_id, "title": "B2 test"},
        )
        self.assertEqual(conversation.status_code, 201, conversation.text)
        conversation_id = conversation.json()["id"]

        proposal = {
            "proposal_id": "11111111-2222-4333-8444-555555555555",
            "workflow_key": "image-generate",
            "title": "Chat 生图任务",
            "project_code": "QMDH-001",
            "requested_provider": "gemini-3.1-flash-image",
            "provider_display_name": "Gemini 3.1 Flash",
            "classification": "B",
            "payload": {
                "prompt": "现代商业综合体鸟瞰效果图",
                "aspect_ratio": "16:9",
                "resolution": "2k",
                "image_count": 1,
            },
            "summary": "16:9 · 2K · Gemini 3.1 Flash · QMDH-001",
            "status": "pending_confirmation",
        }
        mock_run_studio_agent.return_value = StudioAgentReply(
            text="我已准备好生图任务，请确认卡片后提交。",
            provider_name="ms_zhipuai_glm-5",
            model_name="ZhipuAI/GLM-5",
            tool_calls=(ChatAgentToolCall(name="propose_image_generate_task", summary=proposal["summary"]),),
            task_proposals=(proposal,),
            policy_version="qmdh-chat-prod",
        )

        with self.client.stream(
            "POST",
            f"/api/v1/chat/conversations/{conversation_id}/messages",
            headers=headers,
            json={"content": "帮我生成一张商业综合体效果图", "agent_mode": True},
        ) as response:
            self.assertEqual(response.status_code, 200)
            body = "".join(response.iter_text())
        self.assertIn('"task_proposals"', body)

        confirm = self.client.post(
            f"/api/v1/chat/conversations/{conversation_id}/confirm-agent-task",
            headers=headers,
            json=proposal,
        )
        self.assertEqual(confirm.status_code, 202, confirm.text)
        task_id = confirm.json()["id"]

        with self.SessionLocal() as db:
            task = db.get(Task, task_id)
            self.assertIsNotNone(task)
            assert task is not None
            self.assertEqual(task.requested_provider, "gemini-3.1-flash-image")
            self.assertEqual(task.result.get("chat_agent_proposal_id"), proposal["proposal_id"])

    def test_confirm_rejects_when_write_tool_disabled(self) -> None:
        headers = self._login()
        conversation = self.client.post(
            "/api/v1/chat/conversations",
            headers=headers,
            json={"model_provider_id": self.chat_provider_id, "title": "B2 deny"},
        )
        conversation_id = conversation.json()["id"]

        with self.SessionLocal() as db:
            release = db.scalar(select(AgentSkillRelease).where(AgentSkillRelease.key == "qmdh-chat-prod"))
            assert release is not None
            release.chat_tool_allowlist = ["search_shared_templates"]
            db.commit()

        proposal = {
            "proposal_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "workflow_key": "image-generate",
            "title": "Chat 生图任务",
            "project_code": "QMDH-001",
            "requested_provider": "gemini-3.1-flash-image",
            "provider_display_name": "Gemini 3.1 Flash",
            "classification": "B",
            "payload": {
                "prompt": "现代商业综合体鸟瞰效果图",
                "aspect_ratio": "16:9",
                "resolution": "1k",
                "image_count": 1,
            },
            "summary": "16:9 · 1K · Gemini 3.1 Flash · QMDH-001",
        }
        confirm = self.client.post(
            f"/api/v1/chat/conversations/{conversation_id}/confirm-agent-task",
            headers=headers,
            json=proposal,
        )
        self.assertEqual(confirm.status_code, 400, confirm.text)
        self.assertIn("not enabled", confirm.json()["detail"])
