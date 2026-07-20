import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import User
from app.routers import auth, canvas_templates


class CanvasTemplateApiTests(unittest.TestCase):
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
        app.include_router(canvas_templates.router)
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

    def test_list_visible_to_designer_and_non_admin_cannot_write(self) -> None:
        seeded = self.client.post(
            "/canvas-templates/admin",
            headers=self.admin_headers,
            json={
                "title": "人像工作流",
                "description": "示例",
                "category": "人像",
                "is_featured": True,
                "graph_json": {
                    "version": 1,
                    "nodes": [{"id": "n1", "position": {"x": 0, "y": 0}, "data": {}}],
                    "edges": [],
                    "viewport": {"x": 0, "y": 0, "zoom": 1},
                },
            },
        )
        self.assertEqual(seeded.status_code, 201, seeded.text)
        template_id = seeded.json()["id"]

        listed = self.client.get("/canvas-templates", headers=self.designer_headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)
        self.assertNotIn("graph_json", listed.json()[0])
        self.assertEqual(listed.json()[0]["title"], "人像工作流")

        detail = self.client.get(f"/canvas-templates/{template_id}", headers=self.designer_headers)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(detail.json()["graph_json"]["nodes"]), 1)

        forbidden = self.client.post(
            "/canvas-templates/admin",
            headers=self.designer_headers,
            json={"title": "不应创建"},
        )
        self.assertIn(forbidden.status_code, {401, 403})

    def test_admin_crud_and_soft_delete_hides_template(self) -> None:
        created = self.client.post(
            "/canvas-templates/admin",
            headers=self.admin_headers,
            json={"title": "模板 A", "category": "通用"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        template_id = created.json()["id"]
        self.assertEqual(created.json()["graph_json"]["nodes"], [])

        patched = self.client.patch(
            f"/canvas-templates/admin/{template_id}",
            headers=self.admin_headers,
            json={"title": "模板 B", "is_featured": True, "description": "更新说明"},
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["title"], "模板 B")
        self.assertTrue(patched.json()["is_featured"])

        admin_list = self.client.get("/canvas-templates/admin", headers=self.admin_headers)
        self.assertEqual(admin_list.status_code, 200)
        self.assertEqual(len(admin_list.json()), 1)
        self.assertIn("graph_json", admin_list.json()[0])

        deleted = self.client.delete(
            f"/canvas-templates/admin/{template_id}",
            headers=self.admin_headers,
        )
        self.assertEqual(deleted.status_code, 204)

        public_list = self.client.get("/canvas-templates", headers=self.designer_headers)
        self.assertEqual(public_list.status_code, 200)
        self.assertEqual(public_list.json(), [])

        missing = self.client.get(f"/canvas-templates/{template_id}", headers=self.designer_headers)
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()
