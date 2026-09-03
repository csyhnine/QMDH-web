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
from app.models import PlatformSettings, ProviderProfile, User
from app.routers import auth, platform_settings, prompt_polish


class PromptPolishApiTests(unittest.TestCase):
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
                    name="designer",
                    display_name="Designer",
                    role="designer",
                    password_hash=hash_password("designer-pass"),
                    is_active=True,
                    project_codes=["QMDH-001"],
                )
            )
            provider = ProviderProfile(
                provider_name="polish-model",
                display_name="Polish Model",
                api_key=encrypt_value("sk-test"),
                base_url="https://example.com/v1",
                model_name="test-polish",
                adapter_kind="openai_compat",
                capabilities=["chat.completions"],
                strategies={},
                enabled=True,
            )
            db.add(provider)
            db.flush()
            db.add(
                PlatformSettings(
                    id=1,
                    chat_agent_ui_enabled=False,
                    prompt_polish_enabled=True,
                    prompt_polish_provider_id=provider.id,
                )
            )
            db.commit()
            self.provider_id = provider.id

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app = FastAPI()
        app.include_router(auth.router)
        app.include_router(prompt_polish.router)
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        login = self.client.post("/auth/login", json={"username": "designer", "password": "designer-pass"})
        self.assertEqual(login.status_code, 200)
        self.headers = {"Authorization": f"Bearer {login.json()['token']}"}

    @patch("app.services.prompt_polish_service.urlopen")
    def test_polish_prompt_returns_optimized_text(self, mock_urlopen) -> None:
        payload = {
            "choices": [{"message": {"content": "优化后的城市夜景提示词"}}],
        }
        mock_response = mock_urlopen.return_value.__enter__.return_value
        mock_response.read.return_value = json.dumps(payload).encode("utf-8")

        response = self.client.post(
            "/studio/prompt-polish",
            headers=self.headers,
            json={
                "prompt": "城市夜景",
                "creation_mode": "generate",
                "reference_images": [],
            },
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["polished_prompt"], "优化后的城市夜景提示词")
        self.assertEqual(body["provider_name"], "polish-model")

    @patch("app.services.prompt_polish_service.urlopen")
    def test_polish_skips_missing_reference_images(self, mock_urlopen) -> None:
        payload = {
            "choices": [{"message": {"content": "优化后的图生图提示词"}}],
        }
        mock_response = mock_urlopen.return_value.__enter__.return_value
        mock_response.read.return_value = json.dumps(payload).encode("utf-8")

        response = self.client.post(
            "/studio/prompt-polish",
            headers=self.headers,
            json={
                "prompt": "城市夜景",
                "creation_mode": "edit",
                "reference_images": ["/media/missing-reference.png"],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["polished_prompt"], "优化后的图生图提示词")

        request_body = json.loads(mock_urlopen.call_args.args[0].data.decode("utf-8"))
        user_content = request_body["messages"][1]["content"]
        self.assertEqual(len(user_content), 1)
        self.assertEqual(user_content[0]["type"], "text")

    @patch("app.services.prompt_polish_service.urlopen")
    def test_polish_skips_asset_protocol_reference_images(self, mock_urlopen) -> None:
        payload = {
            "choices": [{"message": {"content": "优化后的提示词"}}],
        }
        mock_response = mock_urlopen.return_value.__enter__.return_value
        mock_response.read.return_value = json.dumps(payload).encode("utf-8")

        response = self.client.post(
            "/studio/prompt-polish",
            headers=self.headers,
            json={
                "prompt": "城市夜景",
                "creation_mode": "edit",
                "reference_images": ["asset://pa_01KTEST"],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        request_body = json.loads(mock_urlopen.call_args.args[0].data.decode("utf-8"))
        user_content = request_body["messages"][1]["content"]
        self.assertEqual(len(user_content), 1)

    def test_polish_disabled_returns_503(self) -> None:
        with self.SessionLocal() as db:
            row = db.get(PlatformSettings, 1)
            assert row is not None
            row.prompt_polish_enabled = False
            db.commit()

        response = self.client.post(
            "/studio/prompt-polish",
            headers=self.headers,
            json={"prompt": "城市夜景", "creation_mode": "generate"},
        )
        self.assertEqual(response.status_code, 503)


class PlatformSettingsPromptPolishTests(unittest.TestCase):
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
                    name="admin",
                    display_name="Admin",
                    role="admin",
                    password_hash=hash_password("admin-pass"),
                    is_active=True,
                    project_codes=["*"],
                )
            )
            provider = ProviderProfile(
                provider_name="polish-model",
                display_name="Polish Model",
                api_key=encrypt_value("sk-test"),
                base_url="https://example.com/v1",
                model_name="test-polish",
                adapter_kind="openai_compat",
                capabilities=["chat.completions"],
                strategies={},
                enabled=True,
            )
            db.add(provider)
            db.commit()
            self.provider_id = provider.id

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app = FastAPI()
        app.include_router(auth.router)
        app.include_router(platform_settings.router)
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        login = self.client.post("/auth/login", json={"username": "admin", "password": "admin-pass"})
        self.assertEqual(login.status_code, 200)
        self.headers = {"Authorization": f"Bearer {login.json()['token']}"}

    def test_admin_can_configure_prompt_polish(self) -> None:
        updated = self.client.patch(
            "/settings/platform",
            headers=self.headers,
            json={
                "prompt_polish_enabled": True,
                "prompt_polish_provider_id": self.provider_id,
                "prompt_polish_system_prompt": "自定义系统提示词",
            },
        )
        self.assertEqual(updated.status_code, 200)
        body = updated.json()
        self.assertTrue(body["prompt_polish_enabled"])
        self.assertEqual(body["prompt_polish_provider_id"], self.provider_id)
        self.assertEqual(body["prompt_polish_system_prompt"], "自定义系统提示词")


if __name__ == "__main__":
    unittest.main()
