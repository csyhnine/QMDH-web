import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.encryption import encrypt_value

from app.core.config import settings
from app.database import Base, get_db
from app.models import ProviderProfile
from app.routers import providers
from app.services.model_registry import get_image_provider_profile, get_provider_definition


AUTH_USERS_JSON = json.dumps(
    [
        {
            "name": "admin",
            "token": "admin-token",
            "role": "admin",
            "project_codes": ["*"],
        },
        {
            "name": "designer",
            "token": "designer-token",
            "role": "designer",
            "project_codes": ["QMDH-001"],
        }
    ]
)


class ProviderProfileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(providers.router)
        self.client = TestClient(self.app)
        self.auth_patcher = patch.object(settings, "auth_users_json", AUTH_USERS_JSON)
        self.auth_patcher.start()
        self.encryption_key_patcher = patch.object(
            settings,
            "encryption_key",
            "2xL8HVx6K0mQq6g-2v0fH6Q4Wyy8CjN6i8h9sQ3Wc6Y=",
        )
        self.encryption_key_patcher.start()

    def tearDown(self) -> None:
        self.auth_patcher.stop()
        self.encryption_key_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def auth_headers(self) -> dict[str, str]:
        return {"X-QMDH-Auth": "admin-token", "X-QMDH-User": "admin"}

    def designer_headers(self) -> dict[str, str]:
        return {"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer"}

    def test_crud_masks_key_and_registers_provider(self) -> None:
        response = self.client.post(
            "/providers/profiles",
            headers=self.auth_headers(),
            json={
                "provider_name": "arch_image",
                "api_key": "sk-test-secret",
                "base_url": "https://api.example.test/v1/",
                "model_name": "arch-render-v1",
                "capabilities": ["image.generate"],
                "quality": "high",
                "output_format": "png",
                "timeout_seconds": 60,
                "pricing_currency": "CNY",
                "pricing_unit": "per_image",
                "unit_price": 0.35,
                "enabled": True,
                "reference_mode": "disabled",
            },
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertTrue(payload["has_api_key"])
        self.assertEqual(payload["masked_api_key"], "sk-t...cret")
        self.assertNotIn("editable_api_key", payload)
        self.assertEqual(payload["pricing_currency"], "CNY")
        self.assertEqual(payload["pricing_unit"], "per_image")
        self.assertEqual(payload["unit_price"], 0.35)
        self.assertEqual(payload["strategies"], {})

        providers_response = self.client.get("/providers")
        self.assertEqual(providers_response.status_code, 200)
        provider_names = [item["provider_name"] for item in providers_response.json()]
        self.assertIn("arch_image", provider_names)

        update_response = self.client.patch(
            f"/providers/profiles/{payload['id']}",
            headers=self.auth_headers(),
            json={"model_name": "arch-render-v2", "api_key": ""},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["model_name"], "arch-render-v2")
        self.assertEqual(update_response.json()["masked_api_key"], "sk-t...cret")
        self.assertNotIn("editable_api_key", update_response.json())

    def test_provider_profile_rejects_endpoint_in_base_url(self) -> None:
        response = self.client.post(
            "/providers/profiles",
            headers=self.auth_headers(),
            json={
                "provider_name": "bad_base_url",
                "api_key": "sk-test-secret",
                "base_url": "https://api.example.test/v1/chat/completions",
                "model_name": "bad-model",
                "capabilities": ["image.generate"],
                "quality": "high",
                "output_format": "png",
                "timeout_seconds": 60,
                "pricing_currency": "CNY",
                "pricing_unit": "per_image",
                "unit_price": 0.35,
                "enabled": True,
                "reference_mode": "disabled",
            },
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("API root", response.json()["detail"])

    def test_provider_profile_accepts_dashscope_video_strategy(self) -> None:
        response = self.client.post(
            "/providers/profiles",
            headers=self.auth_headers(),
            json={
                "provider_name": "dashscope_wan_video",
                "api_key": "sk-video",
                "base_url": "https://dashscope.aliyuncs.com/api/v1",
                "model_name": "wan2.1-t2v-turbo",
                "adapter_kind": "dashscope_native",
                "capabilities": ["video.generate"],
                "strategies": {"video.generate": "dashscope_async_video"},
                "quality": "standard",
                "output_format": "mp4",
                "timeout_seconds": 900,
                "pricing_currency": "CNY",
                "pricing_unit": "per_video",
                "unit_price": 1.2,
                "enabled": True,
                "reference_mode": "disabled",
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        payload = response.json()
        self.assertEqual(payload["adapter_kind"], "dashscope_native")
        self.assertEqual(payload["capabilities"], ["video.generate"])
        self.assertEqual(payload["strategies"], {"video.generate": "dashscope_async_video"})
        self.assertEqual(payload["output_format"], "mp4")
        self.assertEqual(payload["pricing_unit"], "per_video")

    def test_provider_profile_accepts_jimeng_secret_and_adapter_config(self) -> None:
        response = self.client.post(
            "/providers/profiles",
            headers=self.auth_headers(),
            json={
                "provider_name": "jimeng_v30",
                "api_key": "ak-test",
                "api_secret": "sk-test",
                "base_url": "https://visual.volcengineapi.com",
                "model_name": "jimeng_t2v_v30",
                "adapter_kind": "jimeng_native",
                "capabilities": ["video.generate"],
                "strategies": {"video.generate": "volcengine_cv_jimeng_video"},
                "adapter_config": {
                    "service": "cv",
                    "region": "cn-north-1",
                    "version": "2022-08-31",
                    "submit_action": "CVSync2AsyncSubmitTask",
                    "result_action": "CVSync2AsyncGetResult",
                    "req_key": "jimeng_t2v_v30",
                },
                "quality": "standard",
                "output_format": "mp4",
                "timeout_seconds": 900,
                "pricing_currency": "CNY",
                "pricing_unit": "per_video",
                "unit_price": 1.2,
                "enabled": True,
                "reference_mode": "disabled",
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        payload = response.json()
        self.assertNotIn("api_secret", payload)
        self.assertEqual(payload["adapter_kind"], "jimeng_native")
        self.assertEqual(payload["strategies"], {"video.generate": "volcengine_cv_jimeng_video"})
        self.assertEqual(payload["adapter_config"]["submit_action"], "CVSync2AsyncSubmitTask")

    def test_designer_cannot_manage_provider_profiles(self) -> None:
        response = self.client.get("/providers/profiles", headers=self.designer_headers())
        self.assertEqual(response.status_code, 403)
        pricing_rules = self.client.get("/providers/pricing-rules", headers=self.designer_headers())
        self.assertEqual(pricing_rules.status_code, 403)

    def test_provider_pricing_rule_crud(self) -> None:
        created_profile = self.client.post(
            "/providers/profiles",
            headers=self.auth_headers(),
            json={
                "provider_name": "chat_metered",
                "api_key": "sk-test-secret",
                "base_url": "https://api.example.test/v1/",
                "model_name": "chat-metered-v1",
                "capabilities": ["chat.completions"],
                "quality": "medium",
                "output_format": "png",
                "timeout_seconds": 60,
                "pricing_currency": "CNY",
                "pricing_unit": "per_request",
                "unit_price": 0,
                "enabled": True,
                "reference_mode": "disabled",
            },
        )
        self.assertEqual(created_profile.status_code, 201, created_profile.text)
        profile_id = created_profile.json()["id"]

        created_rule = self.client.post(
            "/providers/pricing-rules",
            headers=self.auth_headers(),
            json={
                "provider_profile_id": profile_id,
                "capability": "chat.completions",
                "metric": "input_tokens",
                "unit_price": 0.8,
                "is_active": True,
            },
        )
        self.assertEqual(created_rule.status_code, 201, created_rule.text)
        rule_payload = created_rule.json()
        self.assertEqual(rule_payload["provider_profile_id"], profile_id)
        self.assertEqual(rule_payload["metric"], "input_tokens")
        self.assertEqual(rule_payload["unit_size"], 1_000_000.0)
        self.assertEqual(rule_payload["currency"], "USD")

        listing = self.client.get("/providers/pricing-rules", headers=self.auth_headers())
        self.assertEqual(listing.status_code, 200, listing.text)
        self.assertEqual(len(listing.json()), 1)

        updated_rule = self.client.patch(
            f"/providers/pricing-rules/{rule_payload['id']}",
            headers=self.auth_headers(),
            json={"metric": "output_tokens", "unit_price": 1.2},
        )
        self.assertEqual(updated_rule.status_code, 200, updated_rule.text)
        self.assertEqual(updated_rule.json()["metric"], "output_tokens")
        self.assertEqual(updated_rule.json()["unit_price"], 1.2)

        deleted = self.client.delete(
            f"/providers/pricing-rules/{rule_payload['id']}",
            headers=self.auth_headers(),
        )
        self.assertEqual(deleted.status_code, 204, deleted.text)
        listing_after = self.client.get("/providers/pricing-rules", headers=self.auth_headers())
        self.assertEqual(listing_after.json(), [])

    def test_provider_profile_create_requires_configured_encryption_key(self) -> None:
        with patch.object(settings, "encryption_key", ""):
            response = self.client.post(
                "/providers/profiles",
                headers=self.auth_headers(),
                json={
                    "provider_name": "arch_image",
                    "api_key": "sk-test-secret",
                    "base_url": "https://api.example.test/v1/",
                    "model_name": "arch-render-v1",
                    "capabilities": ["image.generate"],
                    "quality": "high",
                    "output_format": "png",
                    "timeout_seconds": 60,
                    "pricing_currency": "CNY",
                    "pricing_unit": "per_image",
                    "unit_price": 0.35,
                    "enabled": True,
                    "reference_mode": "disabled",
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("QMDH_ENCRYPTION_KEY", response.json()["detail"])

    def test_bulk_import_requires_configured_encryption_key(self) -> None:
        with patch.object(settings, "encryption_key", ""):
            response = self.client.post(
                "/providers/bulk-import",
                headers=self.auth_headers(),
                json={
                    "base_url": "https://api.example.test/v1",
                    "api_key": "sk-test-secret",
                    "models": [
                        {
                            "model_id": "image-edit-pro",
                            "provider_name": "image_edit_pro",
                            "capabilities": ["image.edit"],
                            "adapter_kind": "openai_compatible",
                            "reference_mode": "disabled",
                        }
                    ],
                },
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("QMDH_ENCRYPTION_KEY", response.json()["detail"])

    def test_registry_uses_enabled_database_profile(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                ProviderProfile(
                    provider_name="db_image",
                    api_key=encrypt_value("db-secret"),
                    base_url="https://api.example.test/v1",
                    model_name="db-model",
                    adapter_kind="openai_compatible",
                    capabilities=["image.generate"],
                    enabled=True,
                )
            )
            db.commit()

            definition = get_provider_definition("db_image", db)
            profile = get_image_provider_profile("db_image", db)

        self.assertEqual(definition.model_name, "db-model")
        self.assertEqual(definition.runtime_profile_name, "db_image")
        self.assertEqual(profile.api_key, "db-secret")

    def test_probe_provider_profile_reports_success(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="chat_ok",
                api_key=encrypt_value("sk-ok"),
                base_url="https://api.example.test/v1",
                model_name="chat-model",
                adapter_kind="openai_compatible",
                capabilities=["chat.completions"],
                timeout_seconds=500.0,
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.text = '{"data":[]}'
        mock_client = MagicMock()
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_async_client = MagicMock()
        mock_async_client.__aenter__.return_value = mock_client
        mock_async_client.__aexit__.return_value = False

        with patch("app.routers.providers.httpx.AsyncClient", return_value=mock_async_client) as mocked_async_client_ctor:
            response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["status"], "ok")
        self.assertIn("/chat/completions", payload["checked_url"])
        self.assertIn("Chat", payload["detail"])
        mock_client.request.assert_awaited_once()
        mocked_async_client_ctor.assert_called_once_with(timeout=500.0)
        args, kwargs = mock_client.request.await_args
        self.assertEqual(args[0], "POST")
        self.assertIn("/chat/completions", args[1])
        self.assertEqual(kwargs["json"]["model"], "chat-model")

    def test_probe_provider_profile_reports_auth_error(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="chat_bad_key",
                api_key=encrypt_value("sk-bad"),
                base_url="https://api.example.test/v1",
                model_name="chat-model",
                adapter_kind="openai_compatible",
                capabilities=["chat.completions"],
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.is_success = False
        mock_response.text = '{"error":{"message":"invalid token"}}'
        mock_client = MagicMock()
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_async_client = MagicMock()
        mock_async_client.__aenter__.return_value = mock_client
        mock_async_client.__aexit__.return_value = False

        with patch("app.routers.providers.httpx.AsyncClient", return_value=mock_async_client):
            response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["status"], "auth_error")
        self.assertIn("API Key", payload["detail"])

    def test_probe_provider_profile_uses_strategy_endpoint_for_non_chat_capability(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="image_probe",
                api_key=encrypt_value("sk-image"),
                base_url="https://api.example.test/v1",
                model_name="image-model",
                adapter_kind="openai_compatible",
                capabilities=["image.generate"],
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.text = '{"data":[]}'
        mock_client = MagicMock()
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_async_client = MagicMock()
        mock_async_client.__aenter__.return_value = mock_client
        mock_async_client.__aexit__.return_value = False

        with patch("app.routers.providers.httpx.AsyncClient", return_value=mock_async_client):
            response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertIn("/images/generations", payload["checked_url"])
        args, kwargs = mock_client.request.await_args
        self.assertEqual(args[0], "POST")
        self.assertIn("/images/generations", args[1])
        self.assertEqual(kwargs["json"]["model"], "image-model")

    def test_probe_provider_profile_uses_strategy_endpoint_for_chat_modalities_image(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="gemini_image_probe",
                api_key=encrypt_value("sk-image"),
                base_url="https://api.example.test/v1",
                model_name="google/gemini-3.1-flash-image-preview",
                adapter_kind="openai_compatible",
                capabilities=["image.generate"],
                strategies={"image.generate": "chat_modalities_image"},
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.text = '{"choices":[]}'
        mock_client = MagicMock()
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_async_client = MagicMock()
        mock_async_client.__aenter__.return_value = mock_client
        mock_async_client.__aexit__.return_value = False

        with patch("app.routers.providers.httpx.AsyncClient", return_value=mock_async_client):
            response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertIn("/chat/completions", payload["checked_url"])
        args, kwargs = mock_client.request.await_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(kwargs["json"]["modalities"], ["image", "text"])

    def test_probe_provider_profile_defaults_gemini_image_preview_to_chat_modalities(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="google_gemini-3.1-flash-image-preview",
                api_key=encrypt_value("sk-image"),
                base_url="https://api.example.test/v1",
                model_name="google/gemini-3.1-flash-image-preview",
                adapter_kind="openai_compatible",
                capabilities=["image.generate"],
                strategies={},
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.is_success = True
        mock_response.text = '{"choices":[]}'
        mock_client = MagicMock()
        mock_client.request = AsyncMock(return_value=mock_response)
        mock_async_client = MagicMock()
        mock_async_client.__aenter__.return_value = mock_client
        mock_async_client.__aexit__.return_value = False

        with patch("app.routers.providers.httpx.AsyncClient", return_value=mock_async_client):
            response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertIn("/chat/completions", payload["checked_url"])
        args, kwargs = mock_client.request.await_args
        self.assertEqual(args[0], "POST")
        self.assertEqual(kwargs["json"]["modalities"], ["image", "text"])

    def test_probe_dashscope_video_profile_is_configuration_only(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="dashscope_wan_video",
                api_key=encrypt_value("sk-video"),
                base_url="https://dashscope.aliyuncs.com/api/v1",
                model_name="wan2.1-t2v-turbo",
                adapter_kind="dashscope_native",
                capabilities=["video.generate"],
                strategies={"video.generate": "dashscope_async_video"},
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        with patch("app.routers.providers.httpx.AsyncClient") as mock_async_client:
            response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["status"], "configured")
        self.assertIn("/services/aigc/video-generation/video-synthesis", payload["checked_url"])
        self.assertIn("DashScope", payload["detail"])
        mock_async_client.assert_not_called()

    def test_probe_volcengine_video_profiles_are_configuration_only(self) -> None:
        profiles = [
            ProviderProfile(
                provider_name="seedance_ark_probe",
                api_key=encrypt_value("ark-key"),
                base_url="https://ark.cn-beijing.volces.com/api/v3",
                model_name="seedance-1-0-pro",
                adapter_kind="volcengine_ark",
                capabilities=["video.generate"],
                strategies={"video.generate": "volcengine_ark_video_tasks"},
                enabled=True,
            ),
            ProviderProfile(
                provider_name="jimeng_probe",
                api_key=encrypt_value("ak-test"),
                api_secret=encrypt_value("sk-test"),
                base_url="https://visual.volcengineapi.com",
                model_name="jimeng_t2v_v30",
                adapter_kind="jimeng_native",
                capabilities=["video.generate"],
                strategies={"video.generate": "volcengine_cv_jimeng_video"},
                adapter_config={"submit_action": "CVSync2AsyncSubmitTask", "version": "2022-08-31"},
                enabled=True,
            ),
        ]
        with self.SessionLocal() as db:
            db.add_all(profiles)
            db.commit()
            profile_ids = [profile.id for profile in profiles]

        with patch("app.routers.providers.httpx.AsyncClient") as mock_async_client:
            responses = [
                self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())
                for profile_id in profile_ids
            ]

        for response in responses:
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            self.assertTrue(payload["ok"])
            self.assertEqual(payload["status"], "configured")
        self.assertIn("/contents/generations/tasks", responses[0].json()["checked_url"])
        self.assertIn("Action=CVSync2AsyncSubmitTask", responses[1].json()["checked_url"])
        mock_async_client.assert_not_called()

    def test_probe_haodeya_grok_video_profile_is_configuration_only(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="grok_i2v_5s",
                api_key=encrypt_value("sk-grok"),
                base_url="https://newapi.haodeya.xyz/v1",
                model_name="x-ai/grok-imagine-video-i2v",
                adapter_kind="haodeya_grok",
                capabilities=["video.generate"],
                strategies={"video.generate": "haodeya_grok_video"},
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        with patch("app.routers.providers.httpx.AsyncClient") as mock_async_client:
            response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["status"], "configured")
        self.assertIn("/videos", payload["checked_url"])
        self.assertIn("Grok 视频", payload["detail"])
        mock_async_client.assert_not_called()

    def test_probe_provider_profile_rejects_unsupported_adapter(self) -> None:
        with self.SessionLocal() as db:
            profile = ProviderProfile(
                provider_name="claude_native",
                api_key=encrypt_value("sk-native"),
                base_url="https://api.example.test/v1",
                model_name="claude-3",
                adapter_kind="anthropic_native",
                capabilities=["chat.completions"],
                enabled=True,
            )
            db.add(profile)
            db.commit()
            profile_id = profile.id

        response = self.client.post(f"/providers/profiles/{profile_id}/probe", headers=self.auth_headers())
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertFalse(payload["ok"])
        self.assertEqual(payload["status"], "unsupported")


if __name__ == "__main__":
    unittest.main()
