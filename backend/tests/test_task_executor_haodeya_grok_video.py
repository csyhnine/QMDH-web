import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.haodeya_grok_video import HaodeyaGrokVideoProviderAdapter


class _FakeJsonResponse:
    def __init__(self, payload: dict):
        self.payload = payload
        self.headers = {"Content-Type": "application/json"}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class _FakeBinaryResponse:
    def __init__(self, payload: bytes, content_type: str = "video/mp4"):
        self.payload = payload
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return self.payload


class HaodeyaGrokVideoAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-haodeya-grok-")

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def _profile(self) -> ImageProviderProfile:
        return ImageProviderProfile(
            provider_name="grok_i2v_5s",
            api_key="haodeya-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="x-ai/grok-imagine-video-i2v",
            adapter_kind="haodeya_grok",
            capabilities=("video.generate",),
            strategies={"video.generate": "haodeya_grok_video"},
            output_format="mp4",
            timeout_seconds=30,
            pricing_unit="per_video",
            unit_price=3.35,
        )

    def test_execute_submits_i2v_polls_and_persists_video(self) -> None:
        profile = self._profile()
        adapter = HaodeyaGrokVideoProviderAdapter(
            ProviderDefinition("grok_i2v_5s", profile.model_name, ["video.generate"], adapter_kind="haodeya_grok"),
            profile,
        )
        seen_requests = []

        def fake_urlopen(request, timeout):
            seen_requests.append(request)
            url = request.full_url
            if url.endswith("/videos") and request.method == "POST":
                body = json.loads(request.data.decode("utf-8"))
                self.assertEqual(body["model"], "x-ai/grok-imagine-video-i2v")
                self.assertEqual(body["duration"], 5)
                self.assertEqual(body["resolution"], "720p")
                self.assertEqual(body["frame_images"][0]["type"], "first_frame")
                self.assertEqual(body["frame_images"][0]["url"], "https://cdn.example.com/start.jpg")
                return _FakeJsonResponse(
                    {
                        "id": "job-1",
                        "polling_url": "https://newapi.haodeya.xyz/v1/videos/job-1",
                        "status": "pending",
                    }
                )
            if url.endswith("/videos/job-1"):
                return _FakeJsonResponse(
                    {
                        "id": "job-1",
                        "status": "completed",
                        "unsigned_urls": ["https://cdn.example.com/output.mp4"],
                    }
                )
            if url.endswith("/output.mp4"):
                return _FakeBinaryResponse(b"fake-video-bytes")
            raise AssertionError(f"Unexpected request: {url} {request.method}")

        with patch.dict(os.environ, {"QMDH_MEDIA_ROOT": self.tempdir}, clear=False):
            with patch("app.services.provider_adapters.haodeya_grok_video.urlopen", side_effect=fake_urlopen):
                with patch("app.services.provider_adapters.video_common.urlopen", side_effect=fake_urlopen):
                    with patch("app.services.provider_adapters.haodeya_grok_video.sleep"):
                        outcome = adapter.execute(
                            "video.generate",
                            {
                                "prompt": "slow dolly in",
                                "aspect_ratio": "16:9",
                                "reference_image": "https://cdn.example.com/start.jpg",
                            },
                        )

        self.assertEqual(outcome.cost, 3.35)
        self.assertEqual(outcome.result["video_sku"], "x-ai/grok-imagine-video-i2v")
        self.assertTrue(outcome.result["storage_path"].startswith("generated/grok_i2v_5s/"))
        self.assertEqual(len(seen_requests), 3)

    def test_ref_mode_builds_input_references(self) -> None:
        profile = ImageProviderProfile(
            provider_name="grok_ref_10s",
            api_key="haodeya-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="x-ai/grok-imagine-video-ref-10s",
            adapter_kind="haodeya_grok",
            capabilities=("video.generate",),
            strategies={"video.generate": "haodeya_grok_video"},
            output_format="mp4",
            timeout_seconds=30,
            pricing_unit="per_video",
            unit_price=6.74,
        )
        adapter = HaodeyaGrokVideoProviderAdapter(
            ProviderDefinition("grok_ref_10s", profile.model_name, ["video.generate"], adapter_kind="haodeya_grok"),
            profile,
        )
        submit_body: dict | None = None

        def fake_urlopen(request, timeout):
            nonlocal submit_body
            url = request.full_url
            if url.endswith("/videos") and request.method == "POST":
                submit_body = json.loads(request.data.decode("utf-8"))
                return _FakeJsonResponse({"id": "job-2", "status": "pending"})
            if url.endswith("/videos/job-2"):
                return _FakeJsonResponse(
                    {"id": "job-2", "status": "completed", "unsigned_urls": ["https://cdn.example.com/ref.mp4"]}
                )
            if url.endswith("/ref.mp4"):
                return _FakeBinaryResponse(b"fake-video-bytes")
            raise AssertionError(f"Unexpected request: {url}")

        with patch.dict(os.environ, {"QMDH_MEDIA_ROOT": self.tempdir}, clear=False):
            with patch("app.services.provider_adapters.haodeya_grok_video.urlopen", side_effect=fake_urlopen):
                with patch("app.services.provider_adapters.video_common.urlopen", side_effect=fake_urlopen):
                    with patch("app.services.provider_adapters.haodeya_grok_video.sleep"):
                        adapter.execute(
                            "video.generate",
                            {
                                "prompt": "Person from <IMAGE_1> in outfit from <IMAGE_2>",
                                "reference_images": [
                                    "https://cdn.example.com/person.jpg",
                                    "https://cdn.example.com/outfit.jpg",
                                ],
                            },
                        )

        assert submit_body is not None
        self.assertEqual(submit_body["model"], "x-ai/grok-imagine-video-ref-10s")
        self.assertEqual(submit_body["duration"], 10)
        self.assertEqual(len(submit_body["input_references"]), 2)
        self.assertNotIn("frame_images", submit_body)

    def test_rejects_mixed_duration(self) -> None:
        profile = self._profile()
        adapter = HaodeyaGrokVideoProviderAdapter(
            ProviderDefinition("grok_i2v_5s", profile.model_name, ["video.generate"], adapter_kind="haodeya_grok"),
            profile,
        )
        with self.assertRaisesRegex(Exception, "duration=5"):
            adapter.execute("video.generate", {"prompt": "test", "duration": 10})

    def test_rejects_placeholder_profile_model_without_video_sku(self) -> None:
        profile = ImageProviderProfile(
            provider_name="haodeya_grok",
            api_key="haodeya-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="grok-imagine-video",
            adapter_kind="haodeya_grok",
            capabilities=("video.generate",),
            strategies={"video.generate": "haodeya_grok_video"},
            output_format="mp4",
            timeout_seconds=30,
        )
        adapter = HaodeyaGrokVideoProviderAdapter(
            ProviderDefinition("haodeya_grok", profile.model_name, ["video.generate"], adapter_kind="haodeya_grok"),
            profile,
        )
        with self.assertRaisesRegex(Exception, "missing video_sku"):
            adapter.execute("video.generate", {"prompt": "test"})

    def test_uses_video_sku_from_payload_for_placeholder_profile(self) -> None:
        profile = ImageProviderProfile(
            provider_name="haodeya_grok",
            api_key="haodeya-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="grok-imagine-video",
            adapter_kind="haodeya_grok",
            capabilities=("video.generate",),
            strategies={"video.generate": "haodeya_grok_video"},
            output_format="mp4",
            timeout_seconds=30,
        )
        adapter = HaodeyaGrokVideoProviderAdapter(
            ProviderDefinition("haodeya_grok", profile.model_name, ["video.generate"], adapter_kind="haodeya_grok"),
            profile,
        )
        submit_body: dict | None = None

        def fake_urlopen(request, timeout):
            nonlocal submit_body
            url = request.full_url
            if url.endswith("/videos") and request.method == "POST":
                submit_body = json.loads(request.data.decode("utf-8"))
                return _FakeJsonResponse({"id": "job-3", "status": "pending"})
            if url.endswith("/videos/job-3"):
                return _FakeJsonResponse(
                    {"id": "job-3", "status": "completed", "unsigned_urls": ["https://cdn.example.com/plain.mp4"]}
                )
            if url.endswith("/plain.mp4"):
                return _FakeBinaryResponse(b"fake-video-bytes")
            raise AssertionError(f"Unexpected request: {url}")

        with patch.dict(os.environ, {"QMDH_MEDIA_ROOT": self.tempdir}, clear=False):
            with patch("app.services.provider_adapters.haodeya_grok_video.urlopen", side_effect=fake_urlopen):
                with patch("app.services.provider_adapters.video_common.urlopen", side_effect=fake_urlopen):
                    with patch("app.services.provider_adapters.haodeya_grok_video.sleep"):
                        adapter.execute(
                            "video.generate",
                            {
                                "prompt": "plain text video",
                                "video_sku": "x-ai/grok-imagine-video-i2v",
                                "duration": 5,
                                "resolution": "720p",
                            },
                        )

        assert submit_body is not None
        self.assertEqual(submit_body["model"], "x-ai/grok-imagine-video-i2v")
        self.assertNotIn("haodeya_grok", json.dumps(submit_body))

    def test_rejects_deprecated_model(self) -> None:
        profile = ImageProviderProfile(
            provider_name="grok_legacy",
            api_key="haodeya-key",
            base_url="https://newapi.haodeya.xyz/v1",
            model_name="x-ai/grok-imagine-video",
            adapter_kind="haodeya_grok",
            capabilities=("video.generate",),
            strategies={"video.generate": "haodeya_grok_video"},
            output_format="mp4",
            timeout_seconds=30,
        )
        adapter = HaodeyaGrokVideoProviderAdapter(
            ProviderDefinition("grok_legacy", profile.model_name, ["video.generate"], adapter_kind="haodeya_grok"),
            profile,
        )
        with self.assertRaisesRegex(Exception, "deprecated"):
            adapter.execute("video.generate", {"prompt": "test"})


if __name__ == "__main__":
    unittest.main()
