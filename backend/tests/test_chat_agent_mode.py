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
from app.models import ChatMessage, Conversation, ProviderProfile, User
from app.routers import auth, chat


class ChatAgentModeTests(unittest.TestCase):
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
            db.commit()
            provider = db.scalar(select(ProviderProfile).where(ProviderProfile.provider_name == "ms_zhipuai_glm-5"))
            assert provider is not None
            self.provider_id = provider.id

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

    @patch("app.routers.chat.run_multi_agent_chat_isolated")
    def test_agent_mode_persists_reply_before_stream_done(self, mock_run_studio_agent) -> None:
        mock_run_studio_agent.return_value = StudioAgentReply(
            text="已找到 2 个商业综合体相关模板。",
            provider_name="ms_zhipuai_glm-5",
            model_name="ZhipuAI/GLM-5",
            tool_calls=(ChatAgentToolCall(name="search_shared_templates", summary="找到 2 个共享模板"),),
            policy_version="qmdh-chat-prod",
        )

        headers = self._login()
        create_response = self.client.post(
            "/api/v1/chat/conversations",
            headers=headers,
            json={"model_provider_id": self.provider_id},
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        conversation_id = create_response.json()["id"]

        with self.client.stream(
            "POST",
            f"/api/v1/chat/conversations/{conversation_id}/messages",
            headers=headers,
            json={"content": "找商业综合体模板", "agent_mode": True},
        ) as response:
            self.assertEqual(response.status_code, 200)
            # Assistant should be persisted before the client finishes reading the stream.
            with self.SessionLocal() as db:
                messages = db.scalars(
                    select(ChatMessage)
                    .where(ChatMessage.conversation_id == conversation_id)
                    .order_by(ChatMessage.id.asc())
                ).all()
                self.assertEqual(len(messages), 2)
                self.assertEqual(messages[-1].role, "assistant")
            body = "".join(response.iter_text())

        self.assertIn("tool_calls", body)
        self.assertIn("search_shared_templates", body)
        self.assertIn('"thinking"', body)
        self.assertIn('"policy_version"', body)
        self.assertIn("已找到 2 个商业综合体相关模板。", body)
        mock_run_studio_agent.assert_called_once()

    @patch("app.routers.chat.stream_chat_completion")
    @patch("app.routers.chat.run_multi_agent_chat_isolated")
    def test_agent_mode_false_uses_plain_chat_stream(
        self,
        mock_run_studio_agent,
        mock_stream_chat_completion,
    ) -> None:
        async def fake_stream(*_args, **_kwargs):
            yield 'data: {"delta": "纯 Chat 回复。"}\n\n'
            yield "data: [DONE]\n\n"

        mock_stream_chat_completion.side_effect = fake_stream

        headers = self._login()
        create_response = self.client.post(
            "/api/v1/chat/conversations",
            headers=headers,
            json={"model_provider_id": self.provider_id},
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        conversation_id = create_response.json()["id"]

        with self.client.stream(
            "POST",
            f"/api/v1/chat/conversations/{conversation_id}/messages",
            headers=headers,
            json={"content": "你好", "agent_mode": False},
        ) as response:
            self.assertEqual(response.status_code, 200)
            body = "".join(response.iter_text())

        self.assertIn("纯 Chat 回复。", body)
        self.assertNotIn("tool_calls", body)
        mock_run_studio_agent.assert_not_called()
        mock_stream_chat_completion.assert_called_once()
