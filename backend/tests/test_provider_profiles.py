import json
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.database import Base, get_db
from app.models import ProviderProfile
from app.routers import providers
from app.services.model_registry import get_image_provider_profile, get_provider_definition


AUTH_USERS_JSON = json.dumps(
    [
        {
            "name": "reviewer",
            "token": "reviewer-token",
            "role": "reviewer",
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

    def tearDown(self) -> None:
        self.auth_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def auth_headers(self) -> dict[str, str]:
        return {"X-QMDH-Auth": "reviewer-token", "X-QMDH-User": "reviewer"}

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
                "enabled": True,
                "reference_mode": "disabled",
            },
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertTrue(payload["has_api_key"])
        self.assertEqual(payload["masked_api_key"], "sk-t...cret")
        self.assertNotIn("sk-test-secret", json.dumps(payload))

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

    def test_registry_uses_enabled_database_profile(self) -> None:
        with self.SessionLocal() as db:
            db.add(
                ProviderProfile(
                    provider_name="db_image",
                    api_key="db-secret",
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


if __name__ == "__main__":
    unittest.main()
