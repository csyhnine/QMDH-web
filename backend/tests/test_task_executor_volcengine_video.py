import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.volcengine_ark_video import VolcengineArkVideoProviderAdapter
from app.services.provider_adapters.volcengine_jimeng_video import VolcengineJimengVideoProviderAdapter


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


class VolcengineArkVideoAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-ark-video-")

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_execute_submits_polls_and_persists_seedance_video(self) -> None:
        profile = ImageProviderProfile(
            provider_name="seedance_ark",
            api_key="ark-key",
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            model_name="seedance-1-0-pro",
            adapter_kind="volcengine_ark",
            capabilities=("video.generate",),
            strategies={"video.generate": "volcengine_ark_video_tasks"},
            output_format="mp4",
            timeout_seconds=1,
            pricing_unit="per_video",
            unit_price=2.0,
        )
        adapter = VolcengineArkVideoProviderAdapter(
            ProviderDefinition("seedance_ark", "seedance-1-0-pro", ["video.generate"], adapter_kind="volcengine_ark"),
            profile,
        )
        seen_requests = []

        def fake_urlopen(request, timeout):
            seen_requests.append(request)
            url = request.full_url
            if url.endswith("/contents/generations/tasks"):
                return _FakeJsonResponse({"id": "ark-task-1", "status": "queued"})
            if url.endswith("/contents/generations/tasks/ark-task-1"):
                return _FakeJsonResponse(
                    {
                        "id": "ark-task-1",
                        "status": "succeeded",
                        "content": [{"type": "video_url", "video_url": "https://media.example.test/seedance.mp4"}],
                    }
                )
            return _FakeBinaryResponse(b"seedance-video")

        with patch("app.services.provider_adapters.volcengine_ark_video.urlopen", side_effect=fake_urlopen):
            with patch("app.services.provider_adapters.video_common.urlopen", side_effect=fake_urlopen):
                with patch("app.services.media_storage.settings.media_root", self.tempdir):
                    with patch("app.services.media_storage.settings.storage_backend", "local"):
                        outcome = adapter.execute("video.generate", {"prompt": "Seedance flythrough"})

        submit_body = json.loads(seen_requests[0].data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "seedance-1-0-pro")
        self.assertEqual(seen_requests[0].headers["Authorization"], "Bearer ark-key")
        self.assertEqual(outcome.result["request_strategy"], "volcengine_ark_video_tasks")
        self.assertEqual(outcome.result["upstream_task_id"], "ark-task-1")
        self.assertTrue(outcome.result["storage_path"].startswith("generated/seedance_ark/"))
        saved_path = os.path.join(self.tempdir, outcome.result["storage_path"].replace("/", os.sep))
        self.assertEqual(open(saved_path, "rb").read(), b"seedance-video")


class VolcengineJimengVideoAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-jimeng-video-")

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_execute_uses_signed_cv_actions_and_persists_video(self) -> None:
        profile = ImageProviderProfile(
            provider_name="jimeng_v30",
            api_key="ak-test",
            api_secret="sk-test",
            base_url="https://visual.volcengineapi.com",
            model_name="jimeng_t2v_v30",
            adapter_kind="jimeng_native",
            capabilities=("video.generate",),
            strategies={"video.generate": "volcengine_cv_jimeng_video"},
            adapter_config={
                "service": "cv",
                "region": "cn-north-1",
                "version": "2022-08-31",
                "submit_action": "CVSync2AsyncSubmitTask",
                "result_action": "CVSync2AsyncGetResult",
                "req_key": "jimeng_t2v_v30",
            },
            output_format="mp4",
            timeout_seconds=1,
            pricing_unit="per_request",
            unit_price=3.0,
        )
        adapter = VolcengineJimengVideoProviderAdapter(
            ProviderDefinition("jimeng_v30", "jimeng_t2v_v30", ["video.generate"], adapter_kind="jimeng_native"),
            profile,
        )
        seen_requests = []

        def fake_urlopen(request, timeout):
            seen_requests.append(request)
            url = request.full_url
            if "Action=CVSync2AsyncSubmitTask" in url:
                return _FakeJsonResponse({"data": {"task_id": "jimeng-task-1", "status": "submitted"}})
            if "Action=CVSync2AsyncGetResult" in url:
                return _FakeJsonResponse(
                    {
                        "code": 10000,
                        "data": {
                            "task_id": "jimeng-task-1",
                            "status": "done",
                            "video_url": "https://media.example.test/jimeng.mp4",
                        }
                    }
                )
            return _FakeBinaryResponse(b"jimeng-video")

        with patch("app.services.provider_adapters.volcengine_jimeng_video.urlopen", side_effect=fake_urlopen):
            with patch("app.services.provider_adapters.video_common.urlopen", side_effect=fake_urlopen):
                with patch("app.services.media_storage.settings.media_root", self.tempdir):
                    with patch("app.services.media_storage.settings.storage_backend", "local"):
                        outcome = adapter.execute("video.generate", {"prompt": "Jimeng camera move"})

        submit_request = seen_requests[0]
        self.assertIn("Action=CVSync2AsyncSubmitTask", submit_request.full_url)
        self.assertIn("Authorization", submit_request.headers)
        self.assertIn("HMAC-SHA256", submit_request.headers["Authorization"])
        self.assertEqual(outcome.cost, 3.0)
        self.assertEqual(outcome.result["request_strategy"], "volcengine_cv_jimeng_video")
        self.assertEqual(outcome.result["upstream_task_id"], "jimeng-task-1")
        saved_path = os.path.join(self.tempdir, outcome.result["storage_path"].replace("/", os.sep))
        self.assertEqual(open(saved_path, "rb").read(), b"jimeng-video")


if __name__ == "__main__":
    unittest.main()
