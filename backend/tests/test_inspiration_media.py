import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from urllib.error import URLError

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import Base, get_db
from app.routers import inspiration
from app.services.inspiration_media import prepare_inspiration_image


class _FakeDownloadResponse:
    def __init__(self, payload: bytes, content_type: str = "image/png"):
        self._payload = payload
        self.headers = {"Content-Type": content_type}

    def read(self) -> bytes:
        return self._payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class InspirationMediaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-inspiration-")
        self.storage_backend_patcher = patch("app.services.media_storage.settings.storage_backend", "local")
        self.media_root_patcher = patch("app.services.media_storage.settings.media_root", self.tempdir)
        self.media_prefix_patcher = patch("app.services.media_storage.settings.media_url_prefix", "/media")
        self.storage_backend_patcher.start()
        self.media_root_patcher.start()
        self.media_prefix_patcher.start()

    def tearDown(self) -> None:
        self.storage_backend_patcher.stop()
        self.media_root_patcher.stop()
        self.media_prefix_patcher.stop()
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_prepare_inspiration_image_downloads_remote_image(self) -> None:
        with patch(
            "app.services.inspiration_media.urlopen",
            return_value=_FakeDownloadResponse(b"image-bytes", "image/jpeg"),
        ):
            relative_path = prepare_inspiration_image(
                "https://images.example.test/reference.jpg",
                title="Reference Lobby",
                source_url="https://example.test/article",
            )

        self.assertTrue(relative_path.startswith("inspiration/external/reference-lobby-"))
        self.assertTrue(relative_path.endswith(".jpeg"))
        self.assertTrue(os.path.exists(os.path.join(self.tempdir, *relative_path.split("/"))))

    def test_prepare_inspiration_image_falls_back_to_managed_placeholder(self) -> None:
        with patch("app.services.inspiration_media.urlopen", side_effect=URLError("blocked")):
            relative_path = prepare_inspiration_image(
                "https://images.example.test/blocked.jpg",
                title="Blocked Reference",
                source_url="https://example.test/article",
            )

        self.assertTrue(relative_path.startswith("inspiration/external/blocked-reference-"))
        self.assertTrue(relative_path.endswith(".svg"))
        self.assertTrue(os.path.exists(os.path.join(self.tempdir, *relative_path.split("/"))))


class InspirationRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-inspiration-router-")
        self.storage_backend_patcher = patch("app.services.media_storage.settings.storage_backend", "local")
        self.media_root_patcher = patch("app.services.media_storage.settings.media_root", self.tempdir)
        self.media_prefix_patcher = patch("app.services.media_storage.settings.media_url_prefix", "/media")
        self.storage_backend_patcher.start()
        self.media_root_patcher.start()
        self.media_prefix_patcher.start()

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

        def override_auth_user():
            return AuthUserProfile(name="ops", token="test", role="ops", project_codes=("QMDH-001",), user_id=1)

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.dependency_overrides[get_current_auth_user] = override_auth_user
        self.app.include_router(inspiration.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        self.storage_backend_patcher.stop()
        self.media_root_patcher.stop()
        self.media_prefix_patcher.stop()
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def test_create_inspiration_returns_resolved_managed_path(self) -> None:
        with patch(
            "app.routers.inspiration.prepare_inspiration_image",
            return_value="inspiration/imports/reference-lobby-demo.png",
        ):
            response = self.client.post(
                "/inspiration",
                json={
                    "title": "Reference Lobby",
                    "image_path": "https://images.example.test/reference.jpg",
                    "category": "建筑",
                    "source_type": "external",
                    "source_name": "example.test",
                    "source_url": "https://example.test/article",
                    "tags": ["大厅"],
                },
            )

        self.assertEqual(response.status_code, 201, response.text)
        payload = response.json()
        self.assertEqual(payload["image_path"], "/media/inspiration/imports/reference-lobby-demo.png")

        list_response = self.client.get("/inspiration")
        self.assertEqual(list_response.status_code, 200, list_response.text)
        listed = list_response.json()
        self.assertEqual(listed[0]["image_path"], "/media/inspiration/imports/reference-lobby-demo.png")


if __name__ == "__main__":
    unittest.main()
