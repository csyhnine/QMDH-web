import unittest
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import User
from app.routers import announcements, auth


class SiteAnnouncementApiTests(unittest.TestCase):
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
        app.include_router(announcements.router)
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

        self.now = datetime.now(timezone.utc)

    def _create(self, **overrides):
        payload = {
            "title": "维护通知",
            "body": "今晚 22:00 短暂停机",
            "is_active": True,
            "starts_at": (self.now - timedelta(hours=1)).isoformat(),
            "ends_at": (self.now + timedelta(hours=2)).isoformat(),
            "priority": 1,
        }
        payload.update(overrides)
        return self.client.post("/announcements/admin", headers=self.admin_headers, json=payload)

    def test_active_requires_auth(self) -> None:
        response = self.client.get("/announcements/active")
        self.assertIn(response.status_code, (401, 403))

    def test_active_returns_current_window(self) -> None:
        created = self._create()
        self.assertEqual(created.status_code, 201, created.text)

        active = self.client.get("/announcements/active", headers=self.designer_headers)
        self.assertEqual(active.status_code, 200)
        self.assertIsNotNone(active.json())
        self.assertEqual(active.json()["title"], "维护通知")

    def test_active_excludes_outside_window(self) -> None:
        future = self._create(
            starts_at=(self.now + timedelta(days=1)).isoformat(),
            ends_at=(self.now + timedelta(days=2)).isoformat(),
        )
        self.assertEqual(future.status_code, 201, future.text)

        active = self.client.get("/announcements/active", headers=self.designer_headers)
        self.assertEqual(active.status_code, 200)
        self.assertIsNone(active.json())

    def test_soft_delete_hides_from_active(self) -> None:
        created = self._create()
        announcement_id = created.json()["id"]
        deleted = self.client.delete(f"/announcements/admin/{announcement_id}", headers=self.admin_headers)
        self.assertEqual(deleted.status_code, 204)

        active = self.client.get("/announcements/active", headers=self.designer_headers)
        self.assertEqual(active.status_code, 200)
        self.assertIsNone(active.json())

    def test_designer_cannot_write(self) -> None:
        response = self._create()
        # recreate via designer
        forbidden = self.client.post(
            "/announcements/admin",
            headers=self.designer_headers,
            json={
                "title": "x",
                "body": "y",
                "starts_at": self.now.isoformat(),
                "ends_at": (self.now + timedelta(hours=1)).isoformat(),
            },
        )
        self.assertIn(forbidden.status_code, (401, 403))
        self.assertEqual(response.status_code, 201)

    def test_rejects_invalid_window(self) -> None:
        response = self._create(
            starts_at=(self.now + timedelta(hours=2)).isoformat(),
            ends_at=self.now.isoformat(),
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
