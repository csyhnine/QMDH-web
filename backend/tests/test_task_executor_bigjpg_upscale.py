from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from io import BytesIO
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.encryption import encrypt_value
from app.database import Base
from app.models import DataClassification, Project, ProviderProfile, Task, TaskStatus, User, Workflow
from app.services.provider_adapters.bigjpg_upscale import _extension_for_downloaded_image
from app.services.task_executor import execute_task


class _FakeJsonResponse:
    def __init__(self, payload: dict):
        self._payload = payload
        self.headers = {"Content-Type": "application/json"}

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeBinaryResponse:
    def __init__(self, payload: bytes, *, content_type: str = "image/png"):
        self._payload = payload
        self.headers = {"Content-Type": content_type}

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


_MIN_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16

class BigjpgUpscaleExecutorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp()
        self.engine = create_engine(
            "sqlite+pysqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
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
                key="image-upscale",
                name="Upscale",
                description="Upscale image",
                category="image",
                priority="P1",
                provider_capability="image.upscale",
                config={},
            )
            profile = ProviderProfile(
                provider_name="bigjpg",
                display_name="Bigjpg",
                api_key=encrypt_value("test-bigjpg-key"),
                base_url="https://bigjpg.com/api",
                model_name="bigjpg",
                adapter_kind="bigjpg",
                capabilities=["image.upscale"],
                strategies={"image.upscale": "bigjpg_upscale"},
                output_format="png",
                pricing_currency="CNY",
                pricing_unit="per_request",
                unit_price=0.0,
                enabled=True,
            )
            db.add_all([user, project, workflow, profile])
            db.flush()
            task = Task(
                title="Upscale task",
                status=TaskStatus.pending,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="bigjpg",
                payload={
                    "source_image": "/media/generated/demo/source.png",
                    "upscale_style": "photo",
                    "upscale_noise": "1",
                    "upscale_x2": "2",
                },
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

    def test_execute_task_materializes_upscaled_asset(self) -> None:
        def fake_urlopen(request, timeout=0):
            url = request.full_url
            if url.endswith("/api/task/"):
                return _FakeJsonResponse({"tid": "task-123", "remaining_api_calls": 99})
            if url.endswith("/api/task/task-123"):
                return _FakeJsonResponse(
                    {
                        "task-123": {
                            "status": "success",
                            "url": "https://cdn.example.test/upscaled.png",
                        }
                    }
                )
            if url.endswith("/upscaled.png"):
                return _FakeBinaryResponse(_MIN_PNG)
            raise AssertionError(f"Unexpected request: {url} {request.method}")

        with patch("app.services.task_executor.SessionLocal", self.SessionLocal):
            with patch("app.services.provider_adapters.bigjpg_upscale.urlopen", side_effect=fake_urlopen):
                with patch("app.services.media_storage.settings.media_root", self.tempdir):
                    with patch("app.services.media_storage.settings.storage_backend", "local"):
                        with patch(
                            "app.services.provider_adapters.bigjpg_upscale.resolve_public_media_url",
                            return_value="https://cityusbdisk.cn/media/generated/demo/source.png",
                        ):
                            execute_task(self.task_id)

        with self.SessionLocal() as db:
            task = db.get(Task, self.task_id)
            self.assertIsNotNone(task)
            assert task is not None
            self.assertEqual(task.status, TaskStatus.completed)
            self.assertEqual(task.result.get("upstream_task_id"), "task-123")
            self.assertEqual(task.result.get("upscale_factor"), "4x")
            storage_paths = task.result.get("storage_paths")
            self.assertIsInstance(storage_paths, list)
            assert isinstance(storage_paths, list)
            self.assertEqual(len(storage_paths), 1)
            self.assertTrue(str(storage_paths[0]).endswith(".png"))

    def test_execute_task_16x_octet_stream_saves_with_image_extension(self) -> None:
        def fake_urlopen(request, timeout=0):
            url = request.full_url
            if url.endswith("/api/task/"):
                return _FakeJsonResponse({"tid": "task-16x", "remaining_api_calls": 99})
            if url.endswith("/api/task/task-16x"):
                return _FakeJsonResponse(
                    {
                        "task-16x": {
                            "status": "success",
                            "url": "https://cdn.example.test/download/1796",
                        }
                    }
                )
            if url.endswith("/download/1796"):
                return _FakeBinaryResponse(_MIN_PNG, content_type="application/octet-stream")
            raise AssertionError(f"Unexpected request: {url} {request.method}")

        with self.SessionLocal() as db:
            task = db.get(Task, self.task_id)
            assert task is not None
            task.payload = {
                **task.payload,
                "upscale_x2": "4",
            }
            task.status = TaskStatus.pending
            task.result = {}
            db.commit()

        with patch("app.services.task_executor.SessionLocal", self.SessionLocal):
            with patch("app.services.provider_adapters.bigjpg_upscale.urlopen", side_effect=fake_urlopen):
                with patch("app.services.media_storage.settings.media_root", self.tempdir):
                    with patch("app.services.media_storage.settings.storage_backend", "local"):
                        with patch(
                            "app.services.provider_adapters.bigjpg_upscale.resolve_public_media_url",
                            return_value="https://cityusbdisk.cn/media/generated/demo/source.png",
                        ):
                            execute_task(self.task_id)

        with self.SessionLocal() as db:
            task = db.get(Task, self.task_id)
            assert task is not None
            self.assertEqual(task.status, TaskStatus.completed)
            self.assertEqual(task.result.get("upscale_factor"), "16x")
            storage_paths = task.result.get("storage_paths")
            assert isinstance(storage_paths, list)
            self.assertEqual(len(storage_paths), 1)
            self.assertTrue(str(storage_paths[0]).endswith(".png"))
            self.assertNotIn(".bin", str(storage_paths[0]))


class BigjpgUpscaleExtensionTests(unittest.TestCase):
    def test_octet_stream_without_url_suffix_sniffs_png(self) -> None:
        extension = _extension_for_downloaded_image(
            "https://cdn.example.test/download/1796",
            "application/octet-stream",
            "png",
            _MIN_PNG,
        )
        self.assertEqual(extension, "png")

    def test_image_jpeg_content_type_still_works(self) -> None:
        extension = _extension_for_downloaded_image(
            "https://cdn.example.test/download/1796",
            "image/jpeg",
            "png",
            b"\xff\xd8\xff\xe0" + b"\x00" * 8,
        )
        self.assertEqual(extension, "jpg")


if __name__ == "__main__":
    unittest.main()
