import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import User
from app.routers import auth, platform_settings


class PlatformSettingsApiTests(unittest.TestCase):
    def setUp(self) -> None:
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
                        name="designer",
                        display_name="Designer",
                        role="designer",
                        password_hash=hash_password("designer-pass"),
                        is_active=True,
                        project_codes=["QMDH-001"],
                    ),
                    User(
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

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app = FastAPI()
        app.include_router(auth.router)
        app.include_router(platform_settings.router)
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

        designer_login = self.client.post(
            "/auth/login", json={"username": "designer", "password": "designer-pass"}
        )
        self.assertEqual(designer_login.status_code, 200)
        self.designer_headers = {"Authorization": f"Bearer {designer_login.json()['token']}"}

        admin_login = self.client.post("/auth/login", json={"username": "admin", "password": "admin-pass"})
        self.assertEqual(admin_login.status_code, 200)
        self.admin_headers = {"Authorization": f"Bearer {admin_login.json()['token']}"}

    def test_public_read_defaults_disabled(self) -> None:
        response = self.client.get("/settings/platform")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["chat_agent_ui_enabled"])
        self.assertFalse(body["prompt_polish_enabled"])

    def test_admin_can_enable_chat_agent_ui(self) -> None:
        updated = self.client.patch(
            "/settings/platform",
            headers=self.admin_headers,
            json={"chat_agent_ui_enabled": True},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertTrue(updated.json()["chat_agent_ui_enabled"])

        public = self.client.get("/settings/platform")
        self.assertEqual(public.status_code, 200)
        self.assertTrue(public.json()["chat_agent_ui_enabled"])

    def test_designer_cannot_update(self) -> None:
        forbidden = self.client.patch(
            "/settings/platform",
            headers=self.designer_headers,
            json={"chat_agent_ui_enabled": True},
        )
        self.assertIn(forbidden.status_code, (401, 403))

        public = self.client.get("/settings/platform")
        self.assertFalse(public.json()["chat_agent_ui_enabled"])


if __name__ == "__main__":
    unittest.main()
