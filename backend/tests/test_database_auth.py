import unittest
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password, hash_session_token
from app.database import Base, get_db
from app.models import AuthSession, DataClassification, Project, ProviderCall, Task, TaskStatus, User, Workflow
from app.routers import auth, dashboard, projects, users
from app.services.bootstrap import seed_initial_data


class DatabaseAuthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            admin = User(
                name="admin",
                display_name="Admin",
                role="admin",
                password_hash=hash_password("admin-pass"),
                is_active=True,
                project_codes=["*"],
            )
            ops = User(
                name="ops",
                display_name="Ops",
                role="ops",
                password_hash=hash_password("ops-pass"),
                is_active=True,
                project_codes=["*"],
            )
            designer = User(
                name="designer",
                display_name="Designer",
                role="designer",
                password_hash=hash_password("designer-pass"),
                is_active=True,
                project_codes=["QMDH-001"],
            )
            disabled = User(
                name="disabled",
                display_name="Disabled",
                role="designer",
                password_hash=hash_password("disabled-pass"),
                is_active=False,
                project_codes=["QMDH-001"],
            )
            db.add_all([admin, ops, designer, disabled])
            db.flush()
            db.add(Project(name="Demo", code="QMDH-001", classification=DataClassification.b))
            db.add(Project(name="Secret", code="QMDH-SEC", classification=DataClassification.a))
            workflow = Workflow(
                key="image-generate",
                name="Image",
                description="Image generation",
                category="image",
                priority="P1",
                provider_capability="image.generate",
                config={},
            )
            db.add(workflow)
            db.flush()
            project = db.query(Project).filter_by(code="QMDH-001").one()
            completed_task = Task(
                title="Done",
                status=TaskStatus.completed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=designer.id,
                requested_provider="modelscope_free_image",
                payload={},
                result={},
                classification=DataClassification.b,
                cost=1.25,
                latency_ms=1200,
            )
            failed_task = Task(
                title="Jimeng failed",
                status=TaskStatus.failed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=designer.id,
                requested_provider="jimeng",
                payload={},
                result={"error": "Provider not configured: jimeng"},
                classification=DataClassification.b,
                cost=0.0,
                latency_ms=0,
            )
            db.add_all([completed_task, failed_task])
            db.flush()
            db.add(
                ProviderCall(
                    task_id=completed_task.id,
                    provider_name="modelscope_free_image",
                    model_name="MAILAND/majicflus_v1",
                    capability="image.generate",
                    cost=1.25,
                    latency_ms=1200,
                    outbound=True,
                    request_summary={},
                )
            )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(auth.router)
        self.app.include_router(users.router)
        self.app.include_router(projects.router)
        self.app.include_router(dashboard.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def login(self, username: str, password: str) -> str:
        response = self.client.post("/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["token"]

    def test_login_me_and_logout_session(self) -> None:
        token = self.login("designer", "designer-pass")

        me = self.client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["name"], "designer")

        logout = self.client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(logout.status_code, 204)

        rejected = self.client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(rejected.status_code, 401)

    def test_login_rejects_wrong_password_disabled_and_expired_session(self) -> None:
        wrong = self.client.post("/auth/login", json={"username": "designer", "password": "bad-pass"})
        self.assertEqual(wrong.status_code, 401)

        disabled = self.client.post("/auth/login", json={"username": "disabled", "password": "disabled-pass"})
        self.assertEqual(disabled.status_code, 401)

        with self.SessionLocal() as db:
            user = db.query(User).filter_by(name="designer").one()
            db.add(
                AuthSession(
                    user_id=user.id,
                    token_hash=hash_session_token("expired-token"),
                    expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
                )
            )
            db.commit()

        expired = self.client.get("/auth/me", headers={"Authorization": "Bearer expired-token"})
        self.assertEqual(expired.status_code, 401)

    def test_role_boundaries_for_users_and_dashboard(self) -> None:
        designer_token = self.login("designer", "designer-pass")
        ops_token = self.login("ops", "ops-pass")
        admin_token = self.login("admin", "admin-pass")

        designer_users = self.client.get("/users", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(designer_users.status_code, 403)

        ops_users = self.client.get("/users", headers={"Authorization": f"Bearer {ops_token}"})
        self.assertEqual(ops_users.status_code, 403)

        ops_dashboard = self.client.get("/dashboard/stats", headers={"Authorization": f"Bearer {ops_token}"})
        self.assertEqual(ops_dashboard.status_code, 200)
        stats = ops_dashboard.json()
        self.assertEqual(stats["total_tasks"], 2)
        self.assertEqual(stats["failed_tasks"], 1)
        self.assertEqual(stats["total_cost"], 1.25)
        self.assertEqual(stats["cost_unit"], "CNY")
        self.assertEqual(stats["cost_by_currency"], [{"currency": "CNY", "total_cost": 1.25}])
        self.assertEqual(len(stats["daily_series"]), 30)
        self.assertEqual(sum(day["total_tasks"] for day in stats["daily_series"]), stats["total_tasks"])
        self.assertEqual(len(stats["model_calls_by_day"]), 30)
        week_view = self.client.get("/dashboard/stats?days=7", headers={"Authorization": f"Bearer {ops_token}"})
        self.assertEqual(week_view.status_code, 200)
        self.assertEqual(len(week_view.json()["daily_series"]), 7)
        self.assertEqual(stats["failure_reasons"][0]["reason"], "Provider not configured: jimeng")
        jimeng_provider = next(row for row in stats["provider_rankings"] if row["name"] == "jimeng")
        self.assertEqual(jimeng_provider["failed_tasks"], 1)
        designer_usage = next(row for row in stats["account_usage"] if row["name"] == "designer")
        self.assertEqual(designer_usage["total_tasks"], 2)
        self.assertEqual(designer_usage["quota_status"], "unlimited")

        created = self.client.post(
            "/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "new.designer",
                "password": "new-pass",
                "display_name": "New Designer",
                "role": "designer",
                "project_codes": ["QMDH-001"],
                "is_active": True,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)

        reset = self.client.post(
            f"/users/{created.json()['id']}/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"password": "newer-pass"},
        )
        self.assertEqual(reset.status_code, 200)

    def test_project_list_is_filtered_by_database_session_user(self) -> None:
        designer_token = self.login("designer", "designer-pass")
        response = self.client.get("/projects", headers={"Authorization": f"Bearer {designer_token}"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([project["code"] for project in response.json()], ["QMDH-001"])

        forbidden = self.client.get("/projects/QMDH-SEC/status", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(forbidden.status_code, 403)

    def test_seed_initial_data_creates_local_dev_accounts_without_overwriting_passwords(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            owner = db.query(User).filter_by(name="qmdh.owner").one()
            designer = db.query(User).filter_by(name="designer.arch").one()

        self.assertEqual(owner.role, "owner")
        self.assertEqual(owner.project_codes, ["*"])
        self.assertEqual(designer.role, "designer")
        self.assertEqual(designer.project_codes, ["QMDH-001"])

        owner_token = self.login("qmdh.owner", "qmdh-owner-2026")
        designer_token = self.login("designer.arch", "qmdh-arch-2026")

        owner_users = self.client.get("/users", headers={"Authorization": f"Bearer {owner_token}"})
        self.assertEqual(owner_users.status_code, 200)

        designer_users = self.client.get("/users", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(designer_users.status_code, 403)


if __name__ == "__main__":
    unittest.main()
