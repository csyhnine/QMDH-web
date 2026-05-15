import json
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.encryption import encrypt_value
from app.database import Base
from app.models import ProviderProfile
from app.services.model_registry import get_provider_definition, get_provider_map, list_provider_capabilities


class ProviderRegistryProfileTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.encryption_key_patcher = patch.object(
            settings,
            "encryption_key",
            "2xL8HVx6K0mQq6g-2v0fH6Q4Wyy8CjN6i8h9sQ3Wc6Y=",
        )
        self.encryption_key_patcher.start()

    def tearDown(self) -> None:
        self.encryption_key_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_dynamic_image_provider_profiles_are_exposed(self) -> None:
        profiles_json = json.dumps(
            [
                {
                    "provider_name": "custom_image_lab",
                    "api_key": "test-key",
                    "base_url": "https://example.test/v1",
                    "model_name": "image-lab-1",
                    "quality": "high",
                    "output_format": "jpeg",
                }
            ]
        )

        with patch("app.services.model_registry.settings.image_provider_profiles_json", profiles_json):
            provider_map = get_provider_map()

        self.assertIn("custom_image_lab", provider_map)
        self.assertEqual(provider_map["custom_image_lab"].adapter_kind, "openai_compatible")
        self.assertEqual(provider_map["custom_image_lab"].model_name, "image-lab-1")
        self.assertIn("image.generate", provider_map["custom_image_lab"].capabilities)

    def test_modelscope_profiles_enable_reference_caption_mode_by_default(self) -> None:
        profiles_json = json.dumps(
            [
                {
                    "provider_name": "modelscope_free_image",
                    "api_key": "test-key",
                    "base_url": "https://api-inference.modelscope.cn/v1",
                    "model_name": "MAILAND/majicflus_v1",
                }
            ]
        )

        with patch.object(settings, "image_provider_profiles_json", profiles_json):
            profile = settings.get_image_provider_profile("modelscope_free_image")

        self.assertEqual(profile.provider_name, "modelscope_free_image")
        self.assertEqual(profile.reference_mode, "caption_prompt")
        self.assertIn("Qwen/Qwen3-VL-8B-Instruct", profile.reference_caption_fallback_models)

    def test_list_provider_capabilities_includes_dynamic_profile(self) -> None:
        profiles_json = json.dumps(
            [
                {
                    "provider_name": "poster_image",
                    "api_key": "test-key",
                    "base_url": "https://example.test/v1",
                    "model_name": "poster-image-2",
                    "capabilities": ["image.generate"],
                }
            ]
        )

        with patch("app.services.model_registry.settings.image_provider_profiles_json", profiles_json):
            listed_names = [item.provider_name for item in list_provider_capabilities()]
            runtime_profile_name = get_provider_definition("poster_image").runtime_profile_name

        self.assertIn("poster_image", listed_names)
        self.assertEqual(runtime_profile_name, "poster_image")

    def test_database_runtime_profiles_do_not_merge_env_profiles(self) -> None:
        profiles_json = json.dumps(
            [
                {
                    "provider_name": "env_only_image",
                    "api_key": "env-key",
                    "base_url": "https://env.example.test/v1",
                    "model_name": "env-model",
                }
            ]
        )

        with self.SessionLocal() as db:
            db.add(
                ProviderProfile(
                    provider_name="db_only_image",
                    api_key=encrypt_value("db-key"),
                    base_url="https://db.example.test/v1",
                    model_name="db-model",
                    adapter_kind="openai_compatible",
                    capabilities=["image.generate"],
                    enabled=True,
                )
            )
            db.commit()

            with patch.object(settings, "image_provider_profiles_json", profiles_json):
                provider_map = get_provider_map(db, include_static=False)

        self.assertIn("db_only_image", provider_map)
        self.assertNotIn("env_only_image", provider_map)


if __name__ == "__main__":
    unittest.main()
