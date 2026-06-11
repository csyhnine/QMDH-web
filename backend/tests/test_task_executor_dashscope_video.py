import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import ImageProviderProfile, settings
from app.core.encryption import encrypt_value
from app.database import Base
from app.models import Asset, AssetType, DataClassification, Project, ProviderProfile, Task, TaskStatus, User, Workflow
from app.services.model_registry import ProviderDefinition
from app.services.provider_adapters.dashscope_video import DashScopeVideoProviderAdapter
from app.services.task_executor import execute_task


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


class DashScopeVideoProviderAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-dashscope-video-")

    def tearDown(self) -> None:
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_execute_submits_polls_and_persists_video(self) -> None:
        profile = ImageProviderProfile(
            provider_name="dashscope_wan",
            api_key="test-key",
            base_url="https://dashscope.aliyuncs.com/api/v1",
            model_name="wan2.1-t2v-turbo",
            adapter_kind="dashscope_native",
            capabilities=("video.generate",),
            strategies={"video.generate": "dashscope_async_video"},
            output_format="mp4",
            timeout_seconds=1,
            pricing_currency="CNY",
            pricing_unit="per_video",
            unit_price=0.42,
        )
        adapter = DashScopeVideoProviderAdapter(
            ProviderDefinition(
                "dashscope_wan",
                "wan2.1-t2v-turbo",
                ["video.generate"],
                adapter_kind="dashscope_native",
            ),
            profile,
        )
        seen_requests = []

        def fake_urlopen(request, timeout):
            seen_requests.append(request)
            url = request.full_url
            if url.endswith("/services/aigc/video-generation/video-synthesis"):
                return _FakeJsonResponse({"output": {"task_id": "task-1"}, "request_id": "submit-1"})
            if url.endswith("/tasks/task-1"):
                return _FakeJsonResponse(
                    {
                        "output": {
                            "task_id": "task-1",
                            "task_status": "SUCCEEDED",
                            "video_url": "https://media.example.test/video/task-1.mp4",
                        },
                        "request_id": "poll-1",
                    }
                )
            return _FakeBinaryResponse(b"fake-mp4")

        with patch("app.services.provider_adapters.dashscope_video.urlopen", side_effect=fake_urlopen):
            with patch("app.services.provider_adapters.video_common.urlopen", side_effect=fake_urlopen):
                with patch("app.services.media_storage.settings.media_root", self.tempdir):
                    with patch("app.services.media_storage.settings.storage_backend", "local"):
                        outcome = adapter.execute(
                            "video.generate",
                            {
                                "prompt": "A calm architectural flythrough",
                                "motion_prompt": "slow dolly forward",
                                "aspect_ratio": "16:9",
                            },
                        )

        submit_request = seen_requests[0]
        self.assertEqual(submit_request.headers["X-dashscope-async"], "enable")
        submit_body = json.loads(submit_request.data.decode("utf-8"))
        self.assertEqual(submit_body["model"], "wan2.1-t2v-turbo")
        self.assertIn("A calm architectural flythrough", submit_body["input"]["prompt"])
        self.assertEqual(outcome.cost, 0.42)
        self.assertEqual(outcome.cost_currency, "CNY")
        self.assertEqual(outcome.result["request_strategy"], "dashscope_async_video")
        self.assertEqual(outcome.result["upstream_task_id"], "task-1")
        self.assertEqual(outcome.result["upstream_status"], "SUCCEEDED")
        self.assertEqual(outcome.result["billing"]["pricing_unit"], "per_video")
        self.assertTrue(outcome.result["storage_path"].startswith("generated/dashscope_wan/"))
        saved_path = os.path.join(self.tempdir, outcome.result["storage_path"].replace("/", os.sep))
        self.assertTrue(os.path.exists(saved_path))
        self.assertEqual(open(saved_path, "rb").read(), b"fake-mp4")


class DashScopeVideoTaskExecutionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-dashscope-video-task-")
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

        with self.SessionLocal() as db:
            user = User(
                name="designer",
                display_name="Designer",
                role="designer",
                password_hash="unused",
                is_active=True,
                project_codes=["QMDH-001"],
            )
            project = Project(name="Demo", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="video-generate",
                name="Video Generate",
                description="Generate video",
                category="video",
                priority="P1",
                provider_capability="video.generate",
                config={},
            )
            profile = ProviderProfile(
                provider_name="dashscope_happyhorse",
                api_key=encrypt_value("test-key"),
                base_url="https://dashscope.aliyuncs.com/api/v1",
                model_name="happyhorse-v1",
                adapter_kind="dashscope_native",
                capabilities=["video.generate"],
                strategies={"video.generate": "dashscope_async_video"},
                output_format="mp4",
                pricing_currency="CNY",
                pricing_unit="per_request",
                unit_price=1.5,
                enabled=True,
            )
            db.add_all([user, project, workflow, profile])
            db.flush()
            task = Task(
                title="Video task",
                status=TaskStatus.pending,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="dashscope_happyhorse",
                payload={"prompt": "A cinematic pavilion video"},
                result={},
                classification=DataClassification.b,
            )
            db.add(task)
            db.commit()
            self.task_id = task.id

    def tearDown(self) -> None:
        self.encryption_key_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_execute_task_materializes_video_asset(self) -> None:
        def fake_urlopen(request, timeout):
            url = request.full_url
            if url.endswith("/services/aigc/video-generation/video-synthesis"):
                return _FakeJsonResponse({"output": {"task_id": "video-task-1"}, "request_id": "submit-1"})
            if url.endswith("/tasks/video-task-1"):
                return _FakeJsonResponse(
                    {
                        "output": {
                            "task_id": "video-task-1",
                            "task_status": "SUCCEEDED",
                            "video_url": "https://media.example.test/video/video-task-1.mp4",
                        },
                        "request_id": "poll-1",
                    }
                )
            return _FakeBinaryResponse(b"fake-video")

        with patch("app.services.task_executor.SessionLocal", self.SessionLocal):
            with patch("app.services.provider_adapters.dashscope_video.urlopen", side_effect=fake_urlopen):
                with patch("app.services.provider_adapters.video_common.urlopen", side_effect=fake_urlopen):
                    with patch("app.services.media_storage.settings.media_root", self.tempdir):
                        with patch("app.services.media_storage.settings.storage_backend", "local"):
                            execute_task(self.task_id)

        with self.SessionLocal() as db:
            task = db.get(Task, self.task_id)
            self.assertIsNotNone(task)
            assert task is not None
            self.assertEqual(task.status, TaskStatus.completed)
            self.assertEqual(task.cost, 1.5)
            self.assertEqual(task.result["billing"]["pricing_unit"], "per_request")
            self.assertTrue(task.result["storage_path"].startswith("generated/dashscope_happyhorse/"))

            asset = db.scalar(select(Asset).where(Asset.source_task_id == self.task_id))
            self.assertIsNotNone(asset)
            assert asset is not None
            self.assertEqual(asset.asset_type, AssetType.video)
            self.assertEqual(asset.storage_path, task.result["storage_path"])


if __name__ == "__main__":
    unittest.main()
