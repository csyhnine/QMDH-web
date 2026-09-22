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
from app.models import ChatTurnTelemetry, Conversation, ProviderProfile, User
from app.routers import auth, chat
from app.services.chat_telemetry_service import append_client_telemetry_events, begin_chat_turn, summarize_chat_attachments


class ChatTelemetryTests(unittest.TestCase):
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

    def test_summarize_chat_attachments_counts_types(self) -> None:
        count, types, total_bytes = summarize_chat_attachments(
            [
                {"storage_path": "chat-attachments/demo.pdf", "kind": "file"},
                {"storage_path": "references/demo.png", "kind": "image"},
            ]
        )
        self.assertEqual(count, 2)
        self.assertEqual(types, ["pdf", "png"])

    def test_chat_send_persists_turn_telemetry(self) -> None:
        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        create_response = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": 1, "title": ""},
        )
        conversation_id = create_response.json()["id"]

        async def fake_stream(provider, messages):
            del provider, messages
            yield 'data: {"delta": "ok"}\n\n'
            yield "data: [DONE]\n\n"

        with patch("app.routers.chat.stream_chat_completion", fake_stream):
            response = self.client.post(
                f"/chat/conversations/{conversation_id}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={"content": "hello telemetry"},
            )

        self.assertEqual(response.status_code, 200, response.text)

        with self.SessionLocal() as db:
            turn = db.scalar(select(ChatTurnTelemetry).order_by(ChatTurnTelemetry.id.desc()))
            assert turn is not None
            self.assertEqual(turn.conversation_id, conversation_id)
            self.assertEqual(turn.outcome, "success")
            self.assertTrue(turn.upstream_called)
            self.assertGreater(turn.total_duration_ms, 0)

    def test_client_telemetry_merges_by_correlation_id(self) -> None:
        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        with self.SessionLocal() as db:
            user = db.scalar(select(User).where(User.name == "designer.arch"))
            assert user is not None
            conversation = Conversation(user_id=user.id, title="telemetry", model_provider_id=1)
            db.add(conversation)
            db.commit()
            db.refresh(conversation)
            user_id = user.id
            begin_chat_turn(
                db,
                conversation_id=conversation.id,
                user_id=user_id,
                user_message_id=None,
                provider_name="demo",
                model_name="demo-model",
                content_length=12,
                attachments=[],
                correlation_id="cid-test-001",
            )
            conversation_id = conversation.id

        response = self.client.post(
            "/chat/telemetry",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "events": [
                    {
                        "event": "chat.stream.client_error",
                        "detail": "network error",
                        "correlation_id": "cid-test-001",
                        "conversation_id": conversation_id,
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 204, response.text)

        with self.SessionLocal() as db:
            turn = db.scalar(
                select(ChatTurnTelemetry).where(ChatTurnTelemetry.correlation_id == "cid-test-001")
            )
            assert turn is not None
            self.assertEqual(len(turn.client_events_json), 1)
            self.assertEqual(turn.client_events_json[0]["event"], "chat.stream.client_error")

        with self.SessionLocal() as db:
            merged = append_client_telemetry_events(
                db,
                correlation_id="missing",
                user_id=user_id,
                events=[{"event": "noop"}],
            )
            self.assertEqual(merged, 0)

    def test_delete_conversation_removes_turn_telemetry(self) -> None:
        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        create_response = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": 1, "title": "delete-me"},
        )
        conversation_id = create_response.json()["id"]

        async def fake_stream(provider, messages):
            del provider, messages
            yield 'data: {"delta": "ok"}\n\n'
            yield "data: [DONE]\n\n"

        with patch("app.routers.chat.stream_chat_completion", fake_stream):
            send_response = self.client.post(
                f"/chat/conversations/{conversation_id}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={"content": "hello"},
            )
        self.assertEqual(send_response.status_code, 200, send_response.text)

        with self.SessionLocal() as db:
            self.assertIsNotNone(
                db.scalar(
                    select(ChatTurnTelemetry).where(ChatTurnTelemetry.conversation_id == conversation_id)
                )
            )

        delete_response = self.client.delete(
            f"/chat/conversations/{conversation_id}",
            headers=headers,
        )
        self.assertEqual(delete_response.status_code, 204, delete_response.text)

        with self.SessionLocal() as db:
            self.assertIsNone(db.get(Conversation, conversation_id))
            self.assertIsNone(
                db.scalar(
                    select(ChatTurnTelemetry).where(ChatTurnTelemetry.conversation_id == conversation_id)
                )
            )


if __name__ == "__main__":
    unittest.main()
