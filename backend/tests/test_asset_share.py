import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import Asset, AssetType, DataClassification, InspirationPost, Project, Task, TaskStatus, User, Workflow
from app.routers import assets, auth, inspiration


class AssetShareTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            designer = User(
                name="designer",
                display_name="Designer",
                role="designer",
                password_hash=hash_password("designer-pass"),
                is_active=True,
                project_codes=["QMDH-001"],
            )
            db.add(designer)
            db.flush()
            db.add(Project(name="Demo", code="QMDH-001", classification=DataClassification.b))
            db.flush()
            project = db.query(Project).filter_by(code="QMDH-001").one()
            image_workflow = Workflow(
                key="image-generate",
                name="Image",
                description="Image generation",
                category="image",
                priority="P1",
                provider_capability="image.generate",
                config={},
            )
            video_workflow = Workflow(
                key="video-generate",
                name="Video",
                description="Video generation",
                category="video",
                priority="P1",
                provider_capability="video.generate",
                config={},
            )
            db.add_all([image_workflow, video_workflow])
            db.flush()

            text_only_task = Task(
                title="Text only image",
                status=TaskStatus.completed,
                workflow_id=image_workflow.id,
                project_id=project.id,
                user_id=designer.id,
                requested_provider="modelscope_free_image",
                payload={"prompt": "A tower at dusk"},
                result={},
                classification=DataClassification.b,
                cost=1.0,
                latency_ms=900,
            )
            video_task = Task(
                title="Generated clip",
                status=TaskStatus.completed,
                workflow_id=video_workflow.id,
                project_id=project.id,
                user_id=designer.id,
                requested_provider="jimeng",
                payload={"prompt": "Camera orbit around a plaza"},
                result={},
                classification=DataClassification.b,
                cost=2.0,
                latency_ms=1800,
            )
            db.add_all([text_only_task, video_task])
            db.flush()
            db.add(
                Asset(
                    name="Text only render",
                    asset_type=AssetType.image,
                    project_id=project.id,
                    source_task_id=text_only_task.id,
                    storage_path="media/text-only-render.png",
                    prompt_text="A tower at dusk",
                    like_count=0,
                    share_count=0,
                    tags=["render"],
                )
            )
            db.add(
                Asset(
                    name="Plaza clip",
                    asset_type=AssetType.video,
                    project_id=project.id,
                    source_task_id=video_task.id,
                    storage_path="media/plaza-clip.mp4",
                    prompt_text="Camera orbit around a plaza",
                    like_count=0,
                    share_count=0,
                    tags=["video"],
                )
            )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(auth.router)
        self.app.include_router(assets.router)
        self.app.include_router(inspiration.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def login(self) -> str:
        response = self.client.post("/auth/login", json={"username": "designer", "password": "designer-pass"})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["token"]

    def test_share_image_without_source_image_creates_single_media_post(self) -> None:
        token = self.login()
        assets_response = self.client.get("/assets", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(assets_response.status_code, 200, assets_response.text)
        image_asset = next(asset for asset in assets_response.json() if asset["asset_type"] == "image")

        share_response = self.client.post(
            f"/assets/{image_asset['id']}/share",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmed": True},
        )
        self.assertEqual(share_response.status_code, 200, share_response.text)
        payload = share_response.json()
        self.assertFalse(payload["already_shared"])
        self.assertTrue(payload["asset"]["is_shared_to_inspiration"])

        listed_posts = self.client.get("/inspiration", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(listed_posts.status_code, 200, listed_posts.text)
        post = next(item for item in listed_posts.json() if item["source_type"] == "user")
        self.assertEqual(post["media_type"], "image")
        self.assertEqual(post["source_image_path"], "")
        self.assertEqual(post["image_path"], "/media/media/text-only-render.png")

    def test_share_video_asset_creates_video_post(self) -> None:
        token = self.login()
        assets_response = self.client.get("/assets", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(assets_response.status_code, 200, assets_response.text)
        video_asset = next(asset for asset in assets_response.json() if asset["asset_type"] == "video")

        share_response = self.client.post(
            f"/assets/{video_asset['id']}/share",
            headers={"Authorization": f"Bearer {token}"},
            json={"confirmed": True},
        )
        self.assertEqual(share_response.status_code, 200, share_response.text)
        payload = share_response.json()
        self.assertFalse(payload["already_shared"])
        self.assertTrue(payload["asset"]["is_shared_to_inspiration"])

        with self.SessionLocal() as db:
            post = db.scalar(select(InspirationPost).where(InspirationPost.source_asset_id == video_asset["id"]))
            self.assertIsNotNone(post)
            assert post is not None
            self.assertEqual(post.media_type, "video")
            self.assertEqual(post.image_path, "media/plaza-clip.mp4")
            self.assertEqual(post.source_image_path, "")


if __name__ == "__main__":
    unittest.main()
