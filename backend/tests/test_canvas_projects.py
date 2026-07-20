import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import User
from app.routers import auth, canvas_projects


class CanvasProjectApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            db.add(
                User(
                    name="designer",
                    display_name="Designer",
                    role="designer",
                    password_hash=hash_password("designer-pass"),
                    is_active=True,
                    project_codes=["QMDH-001"],
                )
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
        app.include_router(canvas_projects.router)
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        login = self.client.post("/auth/login", json={"username": "designer", "password": "designer-pass"})
        self.assertEqual(login.status_code, 200)
        token = login.json()["token"]
        self.headers = {"Authorization": f"Bearer {token}"}

    def test_canvas_project_crud(self) -> None:
        created = self.client.post(
            "/canvas-projects",
            headers=self.headers,
            json={"title": "板 A"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["title"], "板 A")
        self.assertEqual(body["graph_json"]["nodes"], [])
        project_id = body["id"]

        listed = self.client.get("/canvas-projects", headers=self.headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)

        patched = self.client.patch(
            f"/canvas-projects/{project_id}",
            headers=self.headers,
            json={
                "title": "板 B",
                "graph_json": {
                    "version": 1,
                    "nodes": [{"id": "n1", "position": {"x": 10, "y": 20}, "data": {"kind": "generate"}}],
                    "edges": [],
                    "viewport": {"x": 0, "y": 0, "zoom": 1.2},
                },
            },
        )
        self.assertEqual(patched.status_code, 200, patched.text)
        self.assertEqual(patched.json()["title"], "板 B")
        self.assertEqual(len(patched.json()["graph_json"]["nodes"]), 1)

        fetched = self.client.get(f"/canvas-projects/{project_id}", headers=self.headers)
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["graph_json"]["viewport"]["zoom"], 1.2)

        deleted = self.client.delete(f"/canvas-projects/{project_id}", headers=self.headers)
        self.assertEqual(deleted.status_code, 204)
        listed_after = self.client.get("/canvas-projects", headers=self.headers)
        self.assertEqual(listed_after.json(), [])


if __name__ == "__main__":
    unittest.main()
