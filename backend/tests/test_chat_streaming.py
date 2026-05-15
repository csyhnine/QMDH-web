import json
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.encryption import encrypt_value
from app.core.security import hash_password
from app.database import Base, get_db
from app.models import ProviderProfile, User
from app.routers import auth, chat


class ChatStreamingTests(unittest.TestCase):
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

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(auth.router)
        self.app.include_router(chat.router)
        self.client = TestClient(self.app)

        self.encryption_key_patcher = patch(
            "app.core.config.settings.encryption_key",
            "2xL8HVx6K0mQq6g-2v0fH6Q4Wyy8CjN6i8h9sQ3Wc6Y=",
        )
        self.encryption_key_patcher.start()

    def tearDown(self) -> None:
        self.encryption_key_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def login(self) -> str:
        response = self.client.post(
            "/auth/login",
            json={"username": "designer.arch", "password": "qmdh-arch-2026"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["token"]

    def test_chat_message_route_streams_with_provider_snapshot(self) -> None:
        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        create_response = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": 1, "title": ""},
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        conversation_id = create_response.json()["id"]

        seen = {}

        async def fake_stream(provider, messages):
            seen["provider_type"] = type(provider).__name__
            seen["model_name"] = provider.model_name
            seen["messages"] = messages
            yield f"data: {json.dumps({'delta': '你好'})}\n\n"
            yield "data: [DONE]\n\n"

        with patch("app.routers.chat.stream_chat_completion", fake_stream):
            response = self.client.post(
                f"/chat/conversations/{conversation_id}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={"content": "你好"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn('data: {"delta": "\\u4f60\\u597d"}', response.text)
        self.assertEqual(seen["provider_type"], "ChatProviderConfig")
        self.assertEqual(seen["model_name"], "ZhipuAI/GLM-5")
        self.assertEqual(seen["messages"][-1]["content"], "你好")

        messages_response = self.client.get(
            f"/chat/conversations/{conversation_id}/messages",
            headers=headers,
        )
        self.assertEqual(messages_response.status_code, 200, messages_response.text)
        payload = messages_response.json()
        self.assertEqual(payload[-1]["role"], "assistant")
        self.assertEqual(payload[-1]["content"], "你好")


if __name__ == "__main__":
    unittest.main()
