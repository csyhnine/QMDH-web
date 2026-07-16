import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import InspirationPost, PromptTemplate, User
from app.routers import chat, feedback, inspiration, prompt_templates, search, tasks


class GuestOptionalAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            user = User(name="designer", display_name="设计师", role="designer", is_active=True)
            db.add(user)
            db.flush()
            db.add(
                InspirationPost(
                    title="公开灵感",
                    description="",
                    image_path="/media/demo.png",
                    category="建筑",
                    source_type="seed",
                    source_name="seed",
                    user_id=user.id,
                )
            )
            db.add(
                PromptTemplate(
                    user_id=user.id,
                    scope="shared",
                    label="共享模板",
                    title="标题",
                    prompt="生成建筑效果图",
                )
            )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(inspiration.router)
        self.app.include_router(feedback.router)
        self.app.include_router(chat.router)
        self.app.include_router(prompt_templates.router)
        self.app.include_router(search.router)
        self.app.include_router(tasks.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_guest_can_read_inspiration_list(self) -> None:
        response = self.client.get("/inspiration")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["title"], "公开灵感")

    def test_guest_can_read_empty_feedback_list(self) -> None:
        response = self.client.get("/feedback")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_guest_can_read_shared_prompt_templates(self) -> None:
        response = self.client.get("/prompt-templates")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["scope"], "shared")

    def test_guest_can_search_inspiration(self) -> None:
        response = self.client.get("/search", params={"q": "公开", "domain": "inspiration"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["domain"], "inspiration")

    def test_guest_cannot_create_task(self) -> None:
        response = self.client.post(
            "/tasks",
            json={
                "project_code": "QMDH-001",
                "workflow_key": "image-generate",
                "prompt": "test",
            },
        )
        self.assertEqual(response.status_code, 401)
