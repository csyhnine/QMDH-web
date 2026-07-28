import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import User
from app.routers import ai_tools, auth


class AiToolsApiTests(unittest.TestCase):
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
        app.include_router(ai_tools.router)
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

    def _create(self, **overrides):
        payload = {
            "name": "Midjourney",
            "description": "图像生成",
            "url": "https://www.midjourney.com",
            "category": "图像",
            "is_featured": True,
            "sort_order": 1,
            "is_active": True,
        }
        payload.update(overrides)
        return self.client.post("/ai-tools/admin", headers=self.admin_headers, json=payload)

    def test_list_requires_auth(self) -> None:
        response = self.client.get("/ai-tools")
        self.assertIn(response.status_code, (401, 403))

    def test_designer_sees_active_only(self) -> None:
        active = self._create()
        self.assertEqual(active.status_code, 201, active.text)
        inactive = self._create(name="Hidden", url="https://example.com/hidden", is_active=False)
        self.assertEqual(inactive.status_code, 201, inactive.text)

        listed = self.client.get("/ai-tools", headers=self.designer_headers)
        self.assertEqual(listed.status_code, 200)
        names = [item["name"] for item in listed.json()]
        self.assertIn("Midjourney", names)
        self.assertNotIn("Hidden", names)

    def test_designer_cannot_write(self) -> None:
        forbidden = self.client.post(
            "/ai-tools/admin",
            headers=self.designer_headers,
            json={"name": "x", "url": "https://example.com", "description": ""},
        )
        self.assertIn(forbidden.status_code, (401, 403))

    def test_rejects_bad_url(self) -> None:
        response = self._create(url="ftp://example.com")
        self.assertEqual(response.status_code, 422)

    def test_soft_delete_hides_from_list(self) -> None:
        created = self._create()
        tool_id = created.json()["id"]
        deleted = self.client.delete(f"/ai-tools/admin/{tool_id}", headers=self.admin_headers)
        self.assertEqual(deleted.status_code, 204)
        listed = self.client.get("/ai-tools", headers=self.designer_headers)
        self.assertEqual(listed.json(), [])


if __name__ == "__main__":
    unittest.main()
