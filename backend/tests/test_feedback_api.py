import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import User, UserFeedback
from app.routers import feedback
from app.services.bootstrap import ensure_schema


class FeedbackApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.auth_users_patcher = patch(
            "app.core.config.settings.auth_users_json",
            (
                '[{"name":"designer.arch","token":"designer-token","role":"designer","project_codes":["QMDH-001"],"user_id":1},'
                '{"name":"admin.ops","token":"admin-token","role":"admin","project_codes":["*"],"user_id":2},'
                '{"name":"designer.b","token":"designer-b-token","role":"designer","project_codes":["QMDH-001"],"user_id":3}]'
            ),
        )
        self.auth_users_patcher.start()

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
                        name="designer.arch",
                        display_name="Designer A",
                        role="designer",
                        password_hash=hash_password("designer-pass"),
                        is_active=True,
                        project_codes=["QMDH-001"],
                    ),
                    User(
                        id=2,
                        name="admin.ops",
                        display_name="Admin",
                        role="admin",
                        password_hash=hash_password("admin-pass"),
                        is_active=True,
                        project_codes=["*"],
                    ),
                    User(
                        id=3,
                        name="designer.b",
                        display_name="Designer B",
                        role="designer",
                        password_hash=hash_password("designer-b-pass"),
                        is_active=True,
                        project_codes=["QMDH-001"],
                    ),
                ]
            )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(feedback.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        self.auth_users_patcher.stop()

    def _designer_headers(self) -> dict[str, str]:
        return {"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer.arch"}

    def _designer_b_headers(self) -> dict[str, str]:
        return {"X-QMDH-Auth": "designer-b-token", "X-QMDH-User": "designer.b"}

    def _admin_headers(self) -> dict[str, str]:
        return {"X-QMDH-Auth": "admin-token", "X-QMDH-User": "admin.ops"}

    def test_user_can_create_and_list_own_feedback(self) -> None:
        created = self.client.post(
            "/feedback",
            headers=self._designer_headers(),
            json={
                "title": "Upload issue",
                "message": "Large references feel unreliable.",
                "attachment_paths": ["references/test-1.png"],
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(created.json()["status"], "open")
        self.assertEqual(created.json()["attachment_paths"], ["/media/references/test-1.png"])

        listed = self.client.get("/feedback", headers=self._designer_headers())
        self.assertEqual(listed.status_code, 200, listed.text)
        payload = listed.json()
        self.assertEqual(len(payload), 1)
        self.assertEqual(payload[0]["title"], "Upload issue")
        self.assertEqual(payload[0]["user_name"], "designer.arch")

    def test_user_only_sees_own_feedback(self) -> None:
        with self.SessionLocal() as db:
            db.add_all(
                [
                    UserFeedback(user_id=1, title="Mine", message="Own note"),
                    UserFeedback(user_id=3, title="Other", message="Other note"),
                ]
            )
            db.commit()

        listed = self.client.get("/feedback", headers=self._designer_headers())
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual([item["title"] for item in listed.json()], ["Mine"])

    def test_admin_can_reply_and_user_can_see_reply(self) -> None:
        created = self.client.post(
            "/feedback",
            headers=self._designer_headers(),
            json={"title": "Need help", "message": "Please check my generation history."},
        )
        feedback_id = created.json()["id"]

        admin_list = self.client.get("/feedback/admin", headers=self._admin_headers())
        self.assertEqual(admin_list.status_code, 200, admin_list.text)
        self.assertEqual(admin_list.json()[0]["id"], feedback_id)

        replied = self.client.patch(
            f"/feedback/admin/{feedback_id}",
            headers=self._admin_headers(),
            json={"status": "replied", "admin_reply": "We fixed this and deployed a patch."},
        )
        self.assertEqual(replied.status_code, 200, replied.text)
        self.assertEqual(replied.json()["status"], "replied")
        self.assertEqual(replied.json()["replied_by_user_name"], "admin.ops")

        listed = self.client.get("/feedback", headers=self._designer_headers())
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json()[0]["admin_reply"], "We fixed this and deployed a patch.")

    def test_ensure_schema_backfills_feedback_attachment_column_for_legacy_database(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        with engine.begin() as connection:
            connection.execute(
                text(
                    """
                    CREATE TABLE projects (
                        id INTEGER PRIMARY KEY,
                        name VARCHAR(150) NOT NULL,
                        code VARCHAR(50) NOT NULL,
                        classification VARCHAR(10) NOT NULL
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    CREATE TABLE user_feedbacks (
                        id INTEGER PRIMARY KEY,
                        user_id INTEGER NOT NULL,
                        title VARCHAR(150) NOT NULL,
                        message TEXT NOT NULL,
                        status VARCHAR(30) NOT NULL,
                        admin_reply TEXT NOT NULL,
                        replied_by_user_id INTEGER,
                        replied_at DATETIME,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                    """
                )
            )

        ensure_schema(engine)

        columns = {column["name"] for column in inspect(engine).get_columns("user_feedbacks")}
        self.assertIn("attachment_paths", columns)
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
