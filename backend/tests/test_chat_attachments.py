import json
import io
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
from app.models import ChatMessage, Conversation, ProviderProfile, User
from app.routers import auth, chat
from app.services.media_storage import write_binary_asset


class ChatAttachmentTests(unittest.TestCase):
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
        self.storage_path = write_binary_asset(
            "references/chat-test.png",
            b"\x89PNG\r\n\x1a\n",
        )

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

    def test_chat_message_with_image_attachment_builds_multimodal_payload(self) -> None:
        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        create_response = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": 1, "title": ""},
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        conversation_id = create_response.json()["id"]

        seen: dict[str, object] = {}

        async def fake_stream(provider, messages):
            del provider
            seen["messages"] = messages
            yield f"data: {json.dumps({'delta': '看到了图片'})}\n\n"
            yield "data: [DONE]\n\n"

        with patch("app.routers.chat.stream_chat_completion", fake_stream):
            response = self.client.post(
                f"/chat/conversations/{conversation_id}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "content": "请描述这张图",
                    "attachments": [
                        {
                            "storage_path": self.storage_path,
                            "file_name": "chat-test.png",
                            "mime_type": "image/png",
                        }
                    ],
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        messages = seen["messages"]
        self.assertIsInstance(messages, list)
        last_message = messages[-1]
        self.assertEqual(last_message["role"], "user")
        content = last_message["content"]
        self.assertIsInstance(content, list)
        assert isinstance(content, list)
        self.assertEqual(content[0], {"type": "text", "text": "请描述这张图"})
        self.assertEqual(content[1]["type"], "image_url")
        self.assertTrue(str(content[1]["image_url"]["url"]).startswith("data:image/png;base64,"))

        messages_response = self.client.get(
            f"/chat/conversations/{conversation_id}/messages",
            headers=headers,
        )
        self.assertEqual(messages_response.status_code, 200, messages_response.text)
        payload = messages_response.json()
        self.assertEqual(payload[0]["attachments"][0]["file_name"], "chat-test.png")
        self.assertTrue(payload[0]["attachments"][0]["url"].endswith("references/chat-test.png"))

        with self.SessionLocal() as db:
            stored = db.scalar(select(ChatMessage).where(ChatMessage.role == "user"))
            self.assertIsNotNone(stored)
            assert stored is not None
            self.assertEqual(stored.attachments_json[0]["storage_path"], "references/chat-test.png")

    def test_chat_message_accepts_double_encoded_json_body(self) -> None:
        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        create_response = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": 1, "title": ""},
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        conversation_id = create_response.json()["id"]

        payload = {
            "content": "请描述这张图",
            "attachments": [
                {
                    "storage_path": self.storage_path,
                    "file_name": "chat-test.png",
                    "mime_type": "image/png",
                    "kind": "image",
                }
            ],
        }

        async def fake_stream(provider, messages):
            del provider, messages
            yield "data: [DONE]\n\n"

        with patch("app.routers.chat.stream_chat_completion", fake_stream):
            response = self.client.post(
                f"/chat/conversations/{conversation_id}/messages",
                headers={**headers, "Content-Type": "application/json"},
                content=json.dumps(json.dumps(payload)),
            )

        self.assertEqual(response.status_code, 200, response.text)

    def test_chat_message_with_text_file_injects_extracted_content(self) -> None:
        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        file_path = write_binary_asset("chat-attachments/notes.txt", b"hello from txt")
        create_response = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": 1, "title": ""},
        )
        conversation_id = create_response.json()["id"]

        seen: dict[str, object] = {}

        async def fake_stream(provider, messages):
            del provider
            seen["messages"] = messages
            yield f"data: {json.dumps({'delta': 'ok'})}\n\n"
            yield "data: [DONE]\n\n"

        with patch("app.routers.chat.stream_chat_completion", fake_stream):
            response = self.client.post(
                f"/chat/conversations/{conversation_id}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "content": "请阅读附件",
                    "attachments": [
                        {
                            "storage_path": file_path,
                            "file_name": "notes.txt",
                            "mime_type": "text/plain",
                            "kind": "file",
                        }
                    ],
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        last_message = seen["messages"][-1]
        self.assertEqual(last_message["role"], "user")
        content = last_message["content"]
        self.assertIsInstance(content, str)
        assert isinstance(content, str)
        self.assertIn("请阅读附件", content)
        self.assertIn("附件：notes.txt", content)
        self.assertIn("hello from txt", content)

    def test_chat_message_with_docx_file_injects_extracted_content(self) -> None:
        from docx import Document

        token = self.login()
        headers = {"Authorization": f"Bearer {token}"}

        buffer = io.BytesIO()
        document = Document()
        document.add_paragraph("word attachment body")
        document.save(buffer)
        file_path = write_binary_asset("chat-attachments/spec.docx", buffer.getvalue())

        create_response = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": 1, "title": ""},
        )
        conversation_id = create_response.json()["id"]
        seen: dict[str, object] = {}

        async def fake_stream(provider, messages):
            del provider
            seen["messages"] = messages
            yield f"data: {json.dumps({'delta': 'ok'})}\n\n"
            yield "data: [DONE]\n\n"

        with patch("app.routers.chat.stream_chat_completion", fake_stream):
            response = self.client.post(
                f"/chat/conversations/{conversation_id}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "content": "请阅读 Word 附件",
                    "attachments": [
                        {
                            "storage_path": file_path,
                            "file_name": "spec.docx",
                            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                            "kind": "file",
                        }
                    ],
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        content = seen["messages"][-1]["content"]
        self.assertIn("附件：spec.docx", content)
        self.assertIn("word attachment body", content)


if __name__ == "__main__":
    unittest.main()
