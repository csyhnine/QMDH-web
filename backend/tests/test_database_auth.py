import unittest
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password, hash_session_token
from app.database import Base, get_db
from app.models import Asset, AssetType, AuditLog, AuthSession, DataClassification, Project, ProviderCall, ProviderCallArchive, Task, TaskArchive, TaskStatus, UsageLedger, User, Workflow
from app.routers import assets, auth, dashboard, projects, tasks, users
from app.services.bootstrap import seed_initial_data
from app.services.usage_ledger import ensure_usage_ledger_for_task


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
            peer_designer = User(
                name="peer.designer",
                display_name="Peer Designer",
                role="designer",
                password_hash=hash_password("peer-pass"),
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
            db.add_all([admin, ops, designer, peer_designer, disabled])
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
            db.add(
                Asset(
                    name="Project cover",
                    asset_type=AssetType.image,
                    project_id=project.id,
                    source_task_id=completed_task.id,
                    storage_path="media/project-cover.png",
                    prompt_text="cover",
                    like_count=0,
                    share_count=0,
                    tags=["cover"],
                )
            )
            db.flush()
            ensure_usage_ledger_for_task(db, completed_task, ledger_source="test.seed")
            ensure_usage_ledger_for_task(db, failed_task, ledger_source="test.seed")
            db.add(
                UsageLedger(
                    entry_type="chat.message.completed",
                    source_table="chat_messages",
                    source_id=1,
                    project_code="__chat__",
                    project_name="Chat",
                    workflow_key="chat.completions",
                    workflow_name="Chat Conversation",
                    user_id=designer.id,
                    user_name=designer.name,
                    requested_provider="ms_zhipuai_glm-5",
                    provider_name="ms_zhipuai_glm-5",
                    model_name="ZhipuAI/GLM-5",
                    capability="chat.completions",
                    classification=DataClassification.b,
                    task_status=None,
                    cost=0.0,
                    cost_currency="CNY",
                    billable_units=0.0,
                    billing_unit="chat_tokens",
                    output_count=1,
                    prompt_tokens=120,
                    completion_tokens=80,
                    total_tokens=200,
                    latency_ms=0,
                    error_code="",
                    error_summary="",
                    ledger_source="test.seed",
                    recorded_at=datetime.now(timezone.utc),
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
        self.app.include_router(tasks.router)
        self.app.include_router(assets.router)
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
        self.assertEqual(ops_users.status_code, 200)

        ops_me = self.client.get("/auth/me", headers={"Authorization": f"Bearer {ops_token}"})
        self.assertEqual(ops_me.status_code, 200)
        self.assertEqual(ops_me.json()["role"], "admin")

        ops_dashboard = self.client.get("/dashboard/stats", headers={"Authorization": f"Bearer {ops_token}"})
        self.assertEqual(ops_dashboard.status_code, 200)
        stats = ops_dashboard.json()
        self.assertEqual(stats["total_tasks"], 2)
        self.assertEqual(stats["failed_tasks"], 1)
        self.assertEqual(stats["total_cost"], 1.25)
        self.assertEqual(stats["cost_unit"], "CNY")
        self.assertEqual(stats["cost_by_currency"], [{"currency": "CNY", "total_cost": 1.25}])
        self.assertEqual(stats["today_image_generate_count"], 2)
        self.assertEqual(stats["week_image_generate_count"], 2)
        self.assertEqual(stats["today_video_generate_count"], 0)
        self.assertEqual(stats["week_video_generate_count"], 0)
        self.assertEqual(stats["window_chat_turn_count"], 1)
        self.assertEqual(stats["window_chat_prompt_tokens"], 120)
        self.assertEqual(stats["window_chat_completion_tokens"], 80)
        self.assertEqual(stats["window_chat_total_tokens"], 200)
        self.assertEqual(len(stats["daily_series"]), 30)
        self.assertEqual(sum(day["total_tasks"] for day in stats["daily_series"]), stats["total_tasks"])
        self.assertEqual(sum(day["chat_total_tokens"] for day in stats["daily_series"]), 200)
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
        designer_execution = next(row for row in stats["execution_rankings"] if row["user_name"] == "designer")
        self.assertEqual(designer_execution["image_generate_count"], 2)
        self.assertEqual(designer_execution["video_generate_count"], 0)
        self.assertEqual(designer_execution["chat_turn_count"], 1)
        self.assertEqual(designer_execution["chat_total_tokens"], 200)

        created = self.client.post(
            "/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "new.designer",
                "password": "new-pass",
                "display_name": "New Designer",
                "role": "designer",
                "is_active": True,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertNotIn("project_codes", created.json())

        listed_users = self.client.get("/users", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(listed_users.status_code, 200)
        self.assertTrue(all("project_codes" not in user for user in listed_users.json()))

        with self.SessionLocal() as db:
            new_user = db.scalar(select(User).where(User.name == "new.designer"))
            self.assertIsNotNone(new_user)
            self.assertEqual(new_user.project_codes, [])

        reset = self.client.post(
            f"/users/{created.json()['id']}/reset-password",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"password": "newer-pass"},
        )
        self.assertEqual(reset.status_code, 200)

    def test_designer_task_and_asset_visibility_is_scoped_to_own_history(self) -> None:
        designer_token = self.login("designer", "designer-pass")
        peer_token = self.login("peer.designer", "peer-pass")
        admin_token = self.login("admin", "admin-pass")

        with self.SessionLocal() as db:
            workflow = db.scalar(select(Workflow).where(Workflow.key == "image-generate"))
            project = db.scalar(select(Project).where(Project.code == "QMDH-001"))
            peer = db.scalar(select(User).where(User.name == "peer.designer"))
            self.assertIsNotNone(workflow)
            self.assertIsNotNone(project)
            self.assertIsNotNone(peer)

            peer_task = Task(
                title="Peer task",
                status=TaskStatus.completed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=peer.id,
                requested_provider="modelscope_free_image",
                payload={},
                result={},
                classification=DataClassification.b,
                cost=0.25,
                latency_ms=600,
            )
            db.add(peer_task)
            db.flush()
            peer_asset = Asset(
                name="Peer asset",
                asset_type=AssetType.image,
                project_id=project.id,
                source_task_id=peer_task.id,
                storage_path="media/peer-asset.png",
                prompt_text="peer",
                like_count=0,
                share_count=0,
                tags=["peer"],
            )
            db.add(peer_asset)
            db.commit()
            peer_asset_id = peer_asset.id

        designer_tasks = self.client.get("/tasks", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(designer_tasks.status_code, 200, designer_tasks.text)
        self.assertEqual({task["title"] for task in designer_tasks.json()}, {"Done", "Jimeng failed"})

        peer_tasks = self.client.get("/tasks", headers={"Authorization": f"Bearer {peer_token}"})
        self.assertEqual(peer_tasks.status_code, 200, peer_tasks.text)
        self.assertEqual({task["title"] for task in peer_tasks.json()}, {"Peer task"})

        admin_tasks = self.client.get("/tasks", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(admin_tasks.status_code, 200, admin_tasks.text)
        self.assertEqual({task["title"] for task in admin_tasks.json()}, {"Done", "Jimeng failed", "Peer task"})

        designer_assets = self.client.get("/assets", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(designer_assets.status_code, 200, designer_assets.text)
        self.assertEqual({asset["name"] for asset in designer_assets.json()}, {"Project cover"})

        peer_assets = self.client.get("/assets", headers={"Authorization": f"Bearer {peer_token}"})
        self.assertEqual(peer_assets.status_code, 200, peer_assets.text)
        self.assertEqual({asset["name"] for asset in peer_assets.json()}, {"Peer asset"})

        admin_assets = self.client.get("/assets", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(admin_assets.status_code, 200, admin_assets.text)
        self.assertEqual({asset["name"] for asset in admin_assets.json()}, {"Project cover", "Peer asset"})

        forbidden_like = self.client.post(f"/assets/{peer_asset_id}/like", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(forbidden_like.status_code, 403)

        forbidden_bookmark = self.client.post(
            f"/assets/{peer_asset_id}/bookmark",
            headers={"Authorization": f"Bearer {designer_token}"},
        )
        self.assertEqual(forbidden_bookmark.status_code, 403)

        allowed_like = self.client.post(f"/assets/{peer_asset_id}/like", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(allowed_like.status_code, 200, allowed_like.text)

    def test_project_list_is_filtered_by_database_session_user(self) -> None:
        designer_token = self.login("designer", "designer-pass")
        response = self.client.get("/projects", headers={"Authorization": f"Bearer {designer_token}"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([project["code"] for project in response.json()], ["QMDH-001"])
        self.assertFalse(response.json()[0]["can_manage"])

        forbidden = self.client.get("/projects/QMDH-SEC/status", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(forbidden.status_code, 403)

    def test_designer_can_create_personal_project_container(self) -> None:
        designer_token = self.login("designer", "designer-pass")

        created = self.client.post(
            "/projects",
            headers={"Authorization": f"Bearer {designer_token}"},
            json={
                "name": "我的竞赛草案",
                "classification": "B",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        self.assertTrue(created.json()["code"].startswith("USR_DESIGNER_"))

        listed = self.client.get("/projects", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(listed.status_code, 200)
        self.assertIn(created.json()["code"], [project["code"] for project in listed.json()])
        personal_project = next(project for project in listed.json() if project["code"] == created.json()["code"])
        self.assertTrue(personal_project["can_manage"])

        with self.SessionLocal() as db:
            designer = db.scalar(select(User).where(User.name == "designer"))
            self.assertIsNotNone(designer)
            self.assertIn(created.json()["code"], designer.project_codes or [])
            created_project = db.scalar(select(Project).where(Project.code == created.json()["code"]))
            self.assertIsNotNone(created_project)
            self.assertEqual(created_project.owner_user_id, designer.id)

    def test_personal_project_owner_can_rename_and_delete_but_peer_cannot(self) -> None:
        designer_token = self.login("designer", "designer-pass")
        peer_token = self.login("peer.designer", "peer-pass")

        created = self.client.post(
            "/projects",
            headers={"Authorization": f"Bearer {designer_token}"},
            json={
                "name": "Designer draft",
                "classification": "B",
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        project_code = created.json()["code"]

        peer_rename = self.client.patch(
            f"/projects/{project_code}",
            headers={"Authorization": f"Bearer {peer_token}"},
            json={"name": "Peer rename"},
        )
        self.assertEqual(peer_rename.status_code, 403)

        owner_rename = self.client.patch(
            f"/projects/{project_code}",
            headers={"Authorization": f"Bearer {designer_token}"},
            json={"name": "Renamed draft"},
        )
        self.assertEqual(owner_rename.status_code, 200, owner_rename.text)
        self.assertEqual(owner_rename.json()["name"], "Renamed draft")
        self.assertTrue(owner_rename.json()["can_manage"])

        peer_delete = self.client.delete(
            f"/projects/{project_code}",
            headers={"Authorization": f"Bearer {peer_token}"},
        )
        self.assertEqual(peer_delete.status_code, 403)

        owner_delete = self.client.delete(
            f"/projects/{project_code}",
            headers={"Authorization": f"Bearer {designer_token}"},
        )
        self.assertEqual(owner_delete.status_code, 204, owner_delete.text)

        listed = self.client.get("/projects", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(listed.status_code, 200)
        self.assertNotIn(project_code, [project["code"] for project in listed.json()])

    def test_removed_member_management_endpoints_are_not_exposed(self) -> None:
        admin_token = self.login("admin", "admin-pass")

        users_brief = self.client.get("/users/brief", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(users_brief.status_code, 405)

        project_members = self.client.get("/projects/QMDH-001/members", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(project_members.status_code, 404)

        update_members = self.client.patch(
            "/projects/QMDH-001/members",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"add_user_ids": [], "remove_user_ids": []},
        )
        self.assertEqual(update_members.status_code, 404)

    def test_delete_project_archives_history_and_hides_project(self) -> None:
        admin_token = self.login("admin", "admin-pass")

        delete_response = self.client.delete(
            "/projects/QMDH-001",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        self.assertEqual(delete_response.status_code, 204, delete_response.text)

        projects_after = self.client.get("/projects", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(projects_after.status_code, 200)
        self.assertEqual([project["code"] for project in projects_after.json()], ["QMDH-SEC"])

        archived_status = self.client.get("/projects/QMDH-001/status", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(archived_status.status_code, 404)

        dashboard_after = self.client.get("/dashboard/stats", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(dashboard_after.status_code, 200)
        self.assertEqual(dashboard_after.json()["total_tasks"], 2)
        self.assertEqual(dashboard_after.json()["total_cost"], 1.25)

        with self.SessionLocal() as db:
            project = db.scalar(select(Project).where(Project.code == "QMDH-001"))
            self.assertIsNotNone(project)
            self.assertIsNotNone(project.archived_at)

            tasks = db.scalars(select(Task).where(Task.project_id == project.id).order_by(Task.id)).all()
            self.assertEqual(len(tasks), 2)
            self.assertTrue(all(task.deleted_at is not None for task in tasks))

            provider_calls = db.scalars(select(ProviderCall).where(ProviderCall.task_id.in_([task.id for task in tasks]))).all()
            self.assertEqual(len(provider_calls), 1)

            assets = db.scalars(select(Asset).where(Asset.source_task_id == tasks[0].id)).all()
            self.assertEqual(len(assets), 1)
            self.assertIsNone(assets[0].project_id)

            designer = db.scalar(select(User).where(User.name == "designer"))
            self.assertIsNotNone(designer)
            self.assertNotIn("QMDH-001", designer.project_codes or [])

            project_audit = db.scalar(
                select(AuditLog)
                .where(AuditLog.event_type == "project.deleted", AuditLog.project_code == "QMDH-001")
                .order_by(AuditLog.id.desc())
            )
            self.assertIsNotNone(project_audit)
            self.assertEqual(project_audit.details["task_count"], 2)
            self.assertEqual(project_audit.details["soft_deleted_task_count"], 2)
            self.assertEqual(project_audit.details["provider_call_count"], 1)
            self.assertEqual(project_audit.details["unlinked_asset_count"], 1)

            archives = db.scalars(select(TaskArchive).where(TaskArchive.project_code == "QMDH-001")).all()
            self.assertEqual(len(archives), 2)
            completed_archive = next(item for item in archives if item.requested_provider == "modelscope_free_image")
            self.assertEqual(completed_archive.archive_source, "project.archive")
            self.assertEqual(completed_archive.provider_call_count, 1)

            archived_calls = db.scalars(
                select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == completed_archive.id)
            ).all()
            self.assertEqual(len(archived_calls), 1)
            self.assertEqual(archived_calls[0].model_name, "MAILAND/majicflus_v1")

            task_ledgers = db.scalars(
                select(UsageLedger).where(
                    UsageLedger.entry_type == "task.finalized",
                    UsageLedger.project_code == "QMDH-001",
                )
            ).all()
            self.assertEqual(len(task_ledgers), 2)
            self.assertTrue(all(item.task_archive_id is not None for item in task_ledgers))

    def test_seed_initial_data_creates_local_dev_accounts_without_overwriting_passwords(self) -> None:
        with self.SessionLocal() as db:
            seed_initial_data(db)
            admin_user = db.query(User).filter_by(name="qmdh.admin").one()
            ops_user = db.query(User).filter_by(name="qmdh.ops").one()
            designer = db.query(User).filter_by(name="designer.arch").one()

        self.assertEqual(admin_user.role, "admin")
        self.assertEqual(admin_user.project_codes, ["*"])
        self.assertEqual(ops_user.role, "admin")
        self.assertEqual(ops_user.project_codes, ["*"])
        self.assertEqual(designer.role, "designer")
        self.assertEqual(designer.project_codes, ["QMDH-001"])

        admin_token = self.login("qmdh.admin", "qmdh-admin-2026")
        designer_token = self.login("designer.arch", "qmdh-arch-2026")

        admin_users = self.client.get("/users", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(admin_users.status_code, 200)

        designer_users = self.client.get("/users", headers={"Authorization": f"Bearer {designer_token}"})
        self.assertEqual(designer_users.status_code, 403)


if __name__ == "__main__":
    unittest.main()
