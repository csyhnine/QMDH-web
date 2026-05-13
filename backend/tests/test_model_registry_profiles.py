import json
import unittest
from unittest.mock import patch

from app.core.config import settings
from app.services.model_registry import get_provider_definition, get_provider_map, list_provider_capabilities


class ProviderRegistryProfileTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
