import os
import unittest

os.environ.setdefault("QMDH_OPENAI_IMAGE_API_KEY", "test-key")

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.task_executor import (
    _build_haodeya_wan_image_edits_plan,
    _build_image_request_plan,
    _build_openai_images_plan,
    _encode_multipart_form,
    _wan_image_size,
)


class WanImageRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = ImageProviderProfile(
            provider_name="haodeya_wan2.7-image-pro",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="wan2.7-image-pro",
            timeout_seconds=30,
            strategies={
                "image.generate": "openai_images",
                "image.edit": "openai_images",
            },
            adapter_config={"provider_flavor": "haodeya_wan_image"},
            capabilities=("image.generate", "image.edit"),
        )
        self.definition = ProviderDefinition(
            "haodeya_wan2.7-image-pro",
            "wan2.7-image-pro",
            ["image.generate", "image.edit"],
            adapter_kind="openai",
        )

    def test_literal_size_tiers_only(self) -> None:
        self.assertEqual(_wan_image_size(self.profile, {"resolution": "4k"}), "4K")
        self.assertEqual(
            _wan_image_size(self.profile, {"aspect_ratio": "16:9", "resolution": "2k"}),
            "2K",
        )
        self.assertEqual(
            _wan_image_size(
                self.profile,
                {
                    "aspect_ratio": "遵循原图",
                    "resolution": "4k",
                    "reference_image": "data:image/png;base64,xx",
                },
            ),
            "2K",
        )

    def test_non_pro_clamps_4k(self) -> None:
        standard = ImageProviderProfile(
            provider_name="haodeya_wan2.7-image",
            api_key="test-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="wan2.7-image",
            timeout_seconds=30,
            strategies={"image.generate": "openai_images"},
            adapter_config={"provider_flavor": "haodeya_wan_image"},
        )
        self.assertEqual(_wan_image_size(standard, {"resolution": "4k"}), "2K")

    def test_generate_without_ref_uses_generations(self) -> None:
        plan = _build_image_request_plan(
            profile=self.profile,
            definition=self.definition,
            capability="image.generate",
            payload={"prompt": "a cat", "resolution": "2k"},
            prompt="a cat",
        )
        self.assertEqual(plan.endpoint_path, "/images/generations")
        self.assertEqual(plan.body["size"], "2K")
        self.assertEqual(plan.multipart_files, ())

    def test_edit_with_ref_uses_multipart_edits(self) -> None:
        tiny_png = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="
        )
        plan = _build_haodeya_wan_image_edits_plan(
            profile=self.profile,
            requested_capability="image.edit",
            effective_capability="image.edit",
            payload={
                "prompt": "change background",
                "resolution": "4k",
                "reference_image": tiny_png,
            },
            prompt="change background",
        )
        self.assertEqual(plan.endpoint_path, "/images/edits")
        self.assertEqual(plan.body["model"], "wan2.7-image-pro")
        self.assertEqual(plan.body["size"], "2K")
        self.assertEqual(plan.body["prompt"], "change background")
        self.assertEqual(len(plan.multipart_files), 1)
        self.assertEqual(plan.multipart_files[0][0], "image")
        self.assertTrue(plan.multipart_files[0][2])

        data, content_type = _encode_multipart_form(plan.body, plan.multipart_files)
        self.assertIn("multipart/form-data", content_type)
        self.assertIn(b'name="model"', data)
        self.assertIn(b'name="image"', data)
        self.assertIn(b"wan2.7-image-pro", data)

    def test_generate_with_ref_routes_to_edits(self) -> None:
        tiny_png = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII="
        )
        plan = _build_image_request_plan(
            profile=self.profile,
            definition=self.definition,
            capability="image.generate",
            payload={"prompt": "edit me", "resolution": "2k", "reference_image": tiny_png},
            prompt="edit me",
        )
        self.assertEqual(plan.endpoint_path, "/images/edits")
        self.assertEqual(plan.effective_capability, "image.edit")
        self.assertTrue(plan.multipart_files)

    def test_openai_images_plan_rejects_wan_with_refs(self) -> None:
        with self.assertRaises(ValueError):
            _build_openai_images_plan(
                profile=self.profile,
                requested_capability="image.generate",
                effective_capability="image.generate",
                payload={"prompt": "x", "reference_image": "data:image/png;base64,xx"},
                prompt="x",
            )


if __name__ == "__main__":
    unittest.main()
