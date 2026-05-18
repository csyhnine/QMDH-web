import unittest
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_session_token
from app.database import Base, get_db
from app.models import Asset, AssetType, AuditLog, AuthSession, DataClassification, Project, ProviderCall, ProviderCallArchive, Task, TaskArchive, TaskStatus, User, Workflow
from app.routers import dashboard, tasks


class TaskSoftDeleteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            project = Project(name="Demo Project", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="image-generate",
                name="Image Generate",
                description="Generate an image",
                category="image",
                priority="P1",
                provider_capability="image.generate",
                config={},
            )
            owner = User(
                name="owner.designer",
                display_name="Owner Designer",
                role="designer",
                password_hash="unused",
                is_active=True,
                project_codes=["QMDH-001"],
                monthly_quota=10.0,
            )
            teammate = User(
                name="other.designer",
                display_name="Other Designer",
                role="designer",
                password_hash="unused",
                is_active=True,
                project_codes=["QMDH-001"],
            )
            ops = User(
                name="ops.admin",
                display_name="Ops Admin",
                role="ops",
                password_hash="unused",
                is_active=True,
                project_codes=["*"],
            )
            db.add_all([project, workflow, owner, teammate, ops])
            db.flush()

            now = datetime.now(timezone.utc)
            db.add_all(
                [
                    AuthSession(
                        user_id=owner.id,
                        token_hash=hash_session_token("owner-token"),
                        expires_at=now + timedelta(days=1),
                    ),
                    AuthSession(
                        user_id=teammate.id,
                        token_hash=hash_session_token("other-token"),
                        expires_at=now + timedelta(days=1),
                    ),
                    AuthSession(
                        user_id=ops.id,
                        token_hash=hash_session_token("ops-token"),
                        expires_at=now + timedelta(days=1),
                    ),
                ]
            )

            self.task_keep = Task(
                title="Active task",
                status=TaskStatus.completed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=owner.id,
                requested_provider="openai_image",
                payload={},
                result={"summary": "ok"},
                classification=DataClassification.b,
                cost=1.5,
                cost_currency="CNY",
                latency_ms=800,
            )
            self.task_delete = Task(
                title="Delete me",
                status=TaskStatus.completed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=owner.id,
                requested_provider="openai_image",
                payload={},
                result={"summary": "delete me"},
                classification=DataClassification.b,
                cost=2.0,
                cost_currency="CNY",
                latency_ms=900,
            )
            self.task_other = Task(
                title="Other task",
                status=TaskStatus.failed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=teammate.id,
                requested_provider="jimeng",
                payload={},
                result={"error": "provider failed"},
                classification=DataClassification.b,
                cost=0.5,
                cost_currency="CNY",
                latency_ms=500,
            )
            db.add_all([self.task_keep, self.task_delete, self.task_other])
            db.flush()
            db.add(
                ProviderCall(
                    task_id=self.task_delete.id,
                    provider_name="openai_image",
                    model_name="gpt-image-1",
                    capability="image.generate",
                    cost=2.0,
                    cost_currency="CNY",
                    latency_ms=900,
                    outbound=True,
                    request_summary={"prompt": "delete me"},
                )
            )
            db.add(
                Asset(
                    name="Delete me output",
                    asset_type=AssetType.image,
                    project_id=project.id,
                    source_task_id=self.task_delete.id,
                    storage_path="media/delete-me.png",
                    prompt_text="delete me",
                    like_count=0,
                    share_count=0,
                    tags=["delete"],
                )
            )
            db.commit()
            self.task_keep_id = self.task_keep.id
            self.task_delete_id = self.task_delete.id
            self.task_other_id = self.task_other.id

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(tasks.router)
        self.app.include_router(dashboard.router)
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    @staticmethod
    def _auth_header(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def _delete(self, task_id: int, token: str, json: dict | None = None):
        return self.client.request(
            "DELETE",
            f"/tasks/{task_id}",
            headers=self._auth_header(token),
            json=json,
        )

    def test_soft_delete_idempotence_returns_404_without_duplicate_audit(self) -> None:
        first = self._delete(self.task_delete_id, "owner-token", json={"reason": "cleanup duplicate"})
        self.assertEqual(first.status_code, 204, first.text)

        with self.SessionLocal() as db:
            deleted_at_before = db.get(Task, self.task_delete_id).deleted_at
            audit_count_before = len(
                db.scalars(
                    select(AuditLog).where(
                        AuditLog.event_type == "task.soft_deleted",
                        AuditLog.target_id == self.task_delete_id,
                    )
                ).all()
            )

        second = self._delete(self.task_delete_id, "owner-token")
        self.assertEqual(second.status_code, 404)

        with self.SessionLocal() as db:
            task = db.get(Task, self.task_delete_id)
            audit_count_after = len(
                db.scalars(
                    select(AuditLog).where(
                        AuditLog.event_type == "task.soft_deleted",
                        AuditLog.target_id == self.task_delete_id,
                    )
                ).all()
            )

        self.assertEqual(task.deleted_at, deleted_at_before)
        self.assertEqual(audit_count_after, audit_count_before)

    def test_list_and_detail_hide_soft_deleted_tasks(self) -> None:
        delete_response = self._delete(self.task_delete_id, "owner-token", json={"reason": "hide from listings"})
        self.assertEqual(delete_response.status_code, 204)

        listing = self.client.get("/tasks", headers=self._auth_header("owner-token"))
        self.assertEqual(listing.status_code, 200)
        listed_ids = {item["id"] for item in listing.json()}
        self.assertIn(self.task_keep_id, listed_ids)
        self.assertNotIn(self.task_delete_id, listed_ids)

        detail = self.client.get(f"/tasks/{self.task_delete_id}", headers=self._auth_header("owner-token"))
        self.assertEqual(detail.status_code, 404)

    def test_delete_rejects_unauthorized_user_and_unknown_task(self) -> None:
        forbidden = self._delete(self.task_delete_id, "other-token")
        self.assertEqual(forbidden.status_code, 403)

        with self.SessionLocal() as db:
            self.assertIsNone(db.get(Task, self.task_delete_id).deleted_at)
            self.assertEqual(
                len(db.scalars(select(AuditLog).where(AuditLog.event_type == "task.soft_deleted")).all()),
                0,
            )

        missing = self._delete(999999, "owner-token")
        self.assertEqual(missing.status_code, 404)

    def test_dashboard_totals_and_quota_include_soft_deleted_tasks(self) -> None:
        delete_response = self._delete(self.task_delete_id, "owner-token", json={"reason": "quota still counts"})
        self.assertEqual(delete_response.status_code, 204)

        response = self.client.get("/dashboard/stats", headers=self._auth_header("ops-token"))
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()

        self.assertEqual(payload["total_tasks"], 3)
        self.assertEqual(payload["successful_tasks"], 2)
        self.assertEqual(payload["failed_tasks"], 1)
        self.assertEqual(payload["total_cost"], 4.0)

        owner_usage = next(row for row in payload["account_usage"] if row["name"] == "owner.designer")
        self.assertEqual(owner_usage["total_tasks"], 2)
        self.assertEqual(owner_usage["quota_used"], 3.5)
        self.assertEqual(owner_usage["quota_remaining"], 6.5)
        self.assertEqual(owner_usage["quota_status"], "ok")

    def test_audit_log_captures_reason_and_default_empty_reason(self) -> None:
        with self.SessionLocal() as db:
            workflow_id = db.scalar(select(Workflow.id).where(Workflow.key == "image-generate"))
            project_id = db.scalar(select(Project.id).where(Project.code == "QMDH-001"))
            owner_id = db.scalar(select(User.id).where(User.name == "owner.designer"))
            extra_task = Task(
                title="Delete without reason",
                status=TaskStatus.completed,
                workflow_id=workflow_id,
                project_id=project_id,
                user_id=owner_id,
                requested_provider="openai_image",
                payload={},
                result={"summary": "extra"},
                classification=DataClassification.b,
                cost=0.25,
                cost_currency="CNY",
                latency_ms=300,
            )
            db.add(extra_task)
            db.commit()
            extra_task_id = extra_task.id

        first = self._delete(self.task_delete_id, "owner-token", json={"reason": "obsolete output"})
        second = self._delete(extra_task_id, "owner-token")
        self.assertEqual(first.status_code, 204)
        self.assertEqual(second.status_code, 204)

        with self.SessionLocal() as db:
            logs = db.scalars(
                select(AuditLog)
                .where(AuditLog.event_type == "task.soft_deleted")
                .order_by(AuditLog.target_id.asc())
            ).all()

        by_target = {log.target_id: log for log in logs}
        reasoned = by_target[self.task_delete_id]
        blank = by_target[extra_task_id]

        self.assertEqual(reasoned.actor_name, "owner.designer")
        self.assertIsNotNone(reasoned.actor_id)
        self.assertEqual(reasoned.details["task_id"], self.task_delete_id)
        self.assertEqual(reasoned.details["reason"], "obsolete output")
        self.assertIn("deleted_at", reasoned.details)

        self.assertEqual(blank.details["reason"], "")

    def test_soft_delete_writes_structured_task_archive(self) -> None:
        response = self._delete(self.task_delete_id, "owner-token", json={"reason": "archive this history"})
        self.assertEqual(response.status_code, 204, response.text)

        with self.SessionLocal() as db:
            archive = db.scalar(select(TaskArchive).where(TaskArchive.task_id == self.task_delete_id))
            self.assertIsNotNone(archive)
            self.assertEqual(archive.project_code, "QMDH-001")
            self.assertEqual(archive.user_name, "owner.designer")
            self.assertEqual(archive.archive_source, "task.delete")
            self.assertEqual(archive.archive_reason, "archive this history")
            self.assertEqual(archive.provider_call_count, 1)
            self.assertEqual(archive.asset_count, 1)

            call_archives = db.scalars(
                select(ProviderCallArchive).where(ProviderCallArchive.task_archive_id == archive.id)
            ).all()
            self.assertEqual(len(call_archives), 1)
            self.assertEqual(call_archives[0].provider_name, "openai_image")


if __name__ == "__main__":
    unittest.main()
