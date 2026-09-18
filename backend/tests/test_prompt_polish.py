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
from app.models import PlatformSettings
from app.services.prompt_polish_service import (
    ReferenceImageResolution,
    _reference_image_warning,
    _trim_polished_output,
    configured_prompt_polish_system_prompt,
    resolve_prompt_polish_system_prompt,
)


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

        request_body = json.loads(mock_urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(request_body["max_tokens"], 500)
        self.assertIn("文生图", request_body["messages"][0]["content"])

    @patch("app.services.prompt_polish_service.urlopen")
    def test_polish_edit_mode_uses_edit_prompt_and_lower_max_tokens(self, mock_urlopen) -> None:
        payload = {
            "choices": [{"message": {"content": "将外立面改为白色"}}],
        }
        mock_response = mock_urlopen.return_value.__enter__.return_value
        mock_response.read.return_value = json.dumps(payload).encode("utf-8")

        response = self.client.post(
            "/studio/prompt-polish",
            headers=self.headers,
            json={
                "prompt": "衣服改白色",
                "creation_mode": "edit",
                "reference_images": [],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        request_body = json.loads(mock_urlopen.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(request_body["max_tokens"], 280)
        self.assertIn("图生图", request_body["messages"][0]["content"])

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
                "prompt_polish_system_prompts": {
                    "generate": "文生图自定义提示词",
                    "edit": "图生图自定义提示词",
                    "video": "视频自定义提示词",
                },
            },
        )
        self.assertEqual(updated.status_code, 200)
        body = updated.json()
        self.assertTrue(body["prompt_polish_enabled"])
        self.assertEqual(body["prompt_polish_provider_id"], self.provider_id)
        self.assertEqual(body["prompt_polish_system_prompts"]["generate"], "文生图自定义提示词")
        self.assertEqual(body["prompt_polish_system_prompts"]["edit"], "图生图自定义提示词")
        self.assertEqual(body["prompt_polish_system_prompts"]["video"], "视频自定义提示词")
        self.assertIn("图生图", body["prompt_polish_builtin_prompts"]["edit"])


class PromptPolishServiceUnitTests(unittest.TestCase):
    def test_trim_polished_output_limits_edit_mode_by_original_length(self) -> None:
        original = "将女孩的上衣改成白色并保持原有光影"
        verbose = "将参考图中女孩的上衣材质改为纯白色，保持原有剪裁与光影，不要改变背景与构图。" * 3
        trimmed = _trim_polished_output(verbose, creation_mode="edit", original_prompt=original)
        expected_limit = min(200, max(int(len(original) * 1.8), 40))
        self.assertLessEqual(len(trimmed), expected_limit + 1)

    def test_reference_image_warning_for_edit_without_resolved_images(self) -> None:
        warning = _reference_image_warning(
            creation_mode="edit",
            resolution=ReferenceImageResolution(urls=[], requested_count=1, skipped_count=1),
        )
        self.assertIsNotNone(warning)
        self.assertIn("参考图", warning or "")

    def test_resolve_prompt_polish_system_prompt_uses_mode_specific_config(self) -> None:
        settings = PlatformSettings(
            id=1,
            chat_agent_ui_enabled=False,
            prompt_polish_enabled=True,
            prompt_polish_system_prompt_edit="只改图生图",
        )
        self.assertEqual(configured_prompt_polish_system_prompt(settings, "edit"), "只改图生图")
        self.assertIsNone(configured_prompt_polish_system_prompt(settings, "generate"))
        self.assertIn("文生图", resolve_prompt_polish_system_prompt(settings, "generate"))
        self.assertEqual(resolve_prompt_polish_system_prompt(settings, "edit"), "只改图生图")


if __name__ == "__main__":
    unittest.main()
