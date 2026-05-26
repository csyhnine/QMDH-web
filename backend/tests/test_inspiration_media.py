import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from urllib.error import URLError

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import Base, get_db
from app.models import InspirationPost, User
from app.routers import inspiration
from app.core.security import hash_password
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

        with self.SessionLocal() as db:
            db.add_all(
                [
                    User(
                        id=1,
                        name="designer",
                        display_name="Designer",
                        role="designer",
                        password_hash=hash_password("designer-pass"),
                        is_active=True,
                        project_codes=["QMDH-001"],
                    ),
                    User(
                        id=2,
                        name="peer.designer",
                        display_name="Peer Designer",
                        role="designer",
                        password_hash=hash_password("peer-pass"),
                        is_active=True,
                        project_codes=["QMDH-001"],
                    ),
                    User(
                        id=3,
                        name="admin",
                        display_name="Admin",
                        role="admin",
                        password_hash=hash_password("admin-pass"),
                        is_active=True,
                        project_codes=["*"],
                    ),
                ]
            )
            db.commit()

        self.current_auth_user = AuthUserProfile(name="designer", token="test", role="designer", project_codes=("QMDH-001",), user_id=1)

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        def override_auth_user():
            return self.current_auth_user

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

    def test_designer_can_update_own_inspiration_but_not_peer_post(self) -> None:
        with self.SessionLocal() as db:
            own_post = InspirationPost(
                title="Own reference",
                image_path="inspiration/imports/own.png",
                category="寤虹瓚",
                source_type="external",
                source_name="example.test",
                source_url="https://example.test/own",
                user_id=1,
            )
            peer_post = InspirationPost(
                title="Peer reference",
                image_path="inspiration/imports/peer.png",
                category="寤虹瓚",
                source_type="external",
                source_name="example.test",
                source_url="https://example.test/peer",
                user_id=2,
            )
            db.add_all([own_post, peer_post])
            db.commit()
            db.refresh(own_post)
            db.refresh(peer_post)
            own_post_id = own_post.id
            peer_post_id = peer_post.id

        updated = self.client.patch(
            f"/inspiration/{own_post_id}",
            json={"title": "Updated own reference"},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["title"], "Updated own reference")

        forbidden = self.client.patch(
            f"/inspiration/{peer_post_id}",
            json={"title": "Hijacked title"},
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_extract_images_and_create_external_inspiration_are_available_to_designers(self) -> None:
        html = """
        <html>
          <head>
            <title>Example Article</title>
            <meta property="og:image" content="https://images.example.test/cover.jpg" />
          </head>
          <body>
            <img src="/detail.jpg" width="1280" height="720" />
          </body>
        </html>
        """

        class _FakeHttpResponse:
            def __init__(self, text: str):
                self.text = text
                self.status_code = 200

            def raise_for_status(self) -> None:
                return None

        class _FakeAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def get(self, url: str, headers: dict[str, str]):
                return _FakeHttpResponse(html)

        with patch("app.routers.inspiration.httpx.AsyncClient", return_value=_FakeAsyncClient()):
            extracted = self.client.post(
                "/inspiration/extract-images",
                json={"url": "https://example.test/article"},
            )

        self.assertEqual(extracted.status_code, 200, extracted.text)
        payload = extracted.json()
        self.assertEqual(payload["title"], "Example Article")
        self.assertIn("https://images.example.test/cover.jpg", payload["images"])

        with patch(
            "app.routers.inspiration.prepare_inspiration_image",
            return_value="inspiration/imports/designer-upload.png",
        ):
            created = self.client.post(
                "/inspiration",
                json={
                    "title": "Designer upload",
                    "image_path": "/media/reference/designer.png",
                    "category": "寤虹瓚",
                    "source_type": "external",
                    "source_name": "designer",
                    "source_url": "",
                    "tags": ["灵感"],
                },
            )

        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["user_name"], "Designer")

        with self.SessionLocal() as db:
            post = db.scalar(select(InspirationPost).where(InspirationPost.title == "Designer upload"))
            self.assertIsNotNone(post)
            self.assertEqual(post.user_id, 1)


if __name__ == "__main__":
    unittest.main()
