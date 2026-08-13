import json
import unittest
from unittest.mock import patch

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.haodeya_grok_video import (
    SEEDANCE2_VIDEO_SKUS,
    _build_seedance2_request_body,
    _resolve_grok_sku,
)
from app.services.provider_strategy import (
    HAODEYA_GROK_VIDEO_STRATEGY,
    VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY,
    default_strategy_for_capability,
    profile_prefers_haodeya_grok_video,
    profile_prefers_volcengine_ark_video,
    resolve_strategy_for_capability,
)


class Seedance2VideoRoutingTests(unittest.TestCase):
    def test_haodeya_seedance_prefers_videos_not_ark(self) -> None:
        self.assertTrue(
            profile_prefers_haodeya_grok_video(
                provider_name="haodeya_seedance",
                model_name="seedance-2",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertFalse(
            profile_prefers_volcengine_ark_video(
                provider_name="haodeya_seedance",
                model_name="seedance-2",
                base_url="https://newapi.haodeya.xyz/v1",
            )
        )
        self.assertEqual(
            default_strategy_for_capability(
                capability="video.generate",
                provider_name="haodeya_seedance",
                model_name="seedance-2-720p-5s",
                base_url="https://newapi.haodeya.xyz/v1",
            ),
            HAODEYA_GROK_VIDEO_STRATEGY,
        )

    def test_volc_seedance_still_can_prefer_ark(self) -> None:
        self.assertTrue(
            profile_prefers_volcengine_ark_video(
                provider_name="seedance_ark",
                model_name="doubao-seedance-1.5-pro",
                base_url="https://ark.cn-beijing.volces.com/api/v3",
            )
        )
        self.assertEqual(
            default_strategy_for_capability(
                capability="video.generate",
                provider_name="seedance_ark",
                model_name="doubao-seedance-1.5-pro",
                base_url="https://ark.cn-beijing.volces.com/api/v3",
            ),
            VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY,
        )

    def test_explicit_ark_strategy_overridden_for_seedance2(self) -> None:
        self.assertEqual(
            resolve_strategy_for_capability(
                capability="video.generate",
                provider_name="seedance-2",
                model_name="seedance-2",
                base_url="https://newapi.haodeya.xyz/v1",
                strategies={"video.generate": VOLCENGINE_ARK_VIDEO_TASKS_STRATEGY},
            ),
            HAODEYA_GROK_VIDEO_STRATEGY,
        )


class Seedance2VideoBodyTests(unittest.TestCase):
    def test_six_skus_registered(self) -> None:
        self.assertEqual(len(SEEDANCE2_VIDEO_SKUS), 6)

    def test_resolve_sku_from_payload(self) -> None:
        profile = ImageProviderProfile(
            provider_name="haodeya_seedance",
            api_key="k",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="seedance-2",
        )
        sku = _resolve_grok_sku(profile, {"video_sku": "seedance-2-1080p-10s"})
        self.assertEqual(sku, "seedance-2-1080p-10s")

    def test_body_forces_duration_and_aspect(self) -> None:
        body = _build_seedance2_request_body(
            "seedance-2-fast-720p-5s",
            "一只柴犬在霓虹街头奔跑",
            {"duration": 5, "aspect_ratio": "16:9"},
        )
        self.assertEqual(
            body,
            {
                "model": "seedance-2-fast-720p-5s",
                "prompt": "一只柴犬在霓虹街头奔跑",
                "duration": 5,
                "aspect_ratio": "16:9",
            },
        )

    def test_body_rejects_mismatched_duration(self) -> None:
        with self.assertRaisesRegex(ValueError, "duration must be 5"):
            _build_seedance2_request_body(
                "seedance-2-720p-5s",
                "prompt",
                {"duration": 10},
            )

    def test_optional_first_frame(self) -> None:
        with patch(
            "app.services.provider_adapters.haodeya_grok_video.resolve_public_media_url",
            return_value="https://cdn.example.test/frame.png",
        ):
            body = _build_seedance2_request_body(
                "seedance-2-720p-5s",
                "prompt",
                {"duration": 5, "reference_images": ["generated/x.png"]},
            )
        self.assertEqual(
            body["image_with_roles"],
            [{"url": "https://cdn.example.test/frame.png", "role": "first_frame"}],
        )

    def test_asset_protocol_passthrough(self) -> None:
        body = _build_seedance2_request_body(
            "seedance-2-720p-5s",
            "prompt",
            {"duration": 5, "reference_images": ["asset://pa_01KTEST"]},
        )
        self.assertEqual(
            body["image_with_roles"],
            [{"url": "asset://pa_01KTEST", "role": "reference_image"}],
        )

    def test_profile_fallback_registers_private_avatar(self) -> None:
        profile = ImageProviderProfile(
            provider_name="seedance-2",
            api_key="k",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="seedance-2",
        )
        with patch(
            "app.services.seedance_private_avatar.ensure_seedance_reference_asset_url",
            return_value="asset://pa_FROM_FALLBACK",
        ) as mocked:
            body = _build_seedance2_request_body(
                "seedance-2-720p-5s",
                "prompt",
                {"duration": 5, "reference_images": ["/media/references/a.png"]},
                profile=profile,
            )
        mocked.assert_called_once()
        self.assertEqual(
            body["image_with_roles"],
            [{"url": "asset://pa_FROM_FALLBACK", "role": "reference_image"}],
        )

    def test_multiple_reference_images(self) -> None:
        body = _build_seedance2_request_body(
            "seedance-2-720p-5s",
            "prompt",
            {
                "duration": 5,
                "reference_images": ["asset://pa_1", "asset://pa_2"],
            },
        )
        self.assertEqual(
            body["image_with_roles"],
            [
                {"url": "asset://pa_1", "role": "reference_image"},
                {"url": "asset://pa_2", "role": "reference_image"},
            ],
        )

    def test_rejects_more_than_four_references(self) -> None:
        with self.assertRaisesRegex(ValueError, "at most 4"):
            _build_seedance2_request_body(
                "seedance-2-720p-5s",
                "prompt",
                {
                    "duration": 5,
                    "reference_images": [f"asset://pa_{i}" for i in range(5)],
                },
            )


if __name__ == "__main__":
    unittest.main()
