import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base
from app.models import Project, Task, TaskStatus, User, Workflow
from app.services.task_stale_recovery import recover_stale_tasks


class TaskStaleRecoveryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            user = User(
                name="designer.arch",
                display_name="Designer",
                role="designer",
                password_hash=hash_password("qmdh-arch-2026"),
                is_active=True,
                project_codes=["QMDH-001"],
            )
            project = Project(code="QMDH-001", name="Demo", owner_user_id=None)
            workflow = Workflow(
                key="image-generate",
                name="Image Generate",
                description="Generate image",
                category="image",
                priority="P1",
                version="v1",
                provider_capability="image.generate",
            )
            db.add_all([user, project, workflow])
            db.commit()
            self.user_id = user.id
            self.project_id = project.id
            self.workflow_id = workflow.id

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def _create_task(self, *, status: TaskStatus, created_at: datetime, updated_at: datetime | None = None) -> int:
        with self.SessionLocal() as db:
            task = Task(
                title="Stale task",
                status=status,
                workflow_id=self.workflow_id,
                project_id=self.project_id,
                user_id=self.user_id,
                requested_provider="gpt-image-2",
                payload={"prompt": "test"},
                result={"queued_stage": status.value},
                created_at=created_at,
                updated_at=updated_at or created_at,
            )
            db.add(task)
            db.commit()
            return task.id

    def test_recovers_long_running_task(self) -> None:
        old = datetime.now(timezone.utc) - timedelta(minutes=20)
        task_id = self._create_task(status=TaskStatus.running, created_at=old, updated_at=old)

        with self.SessionLocal() as db:
            recovered = recover_stale_tasks(db, now=datetime.now(timezone.utc))

        self.assertEqual(recovered, 1)
        with self.SessionLocal() as db:
            task = db.get(Task, task_id)
            assert task is not None
            self.assertEqual(task.status, TaskStatus.failed)
            self.assertEqual(task.result["error_code"], "task_stale_running")

    def test_keeps_recent_running_task(self) -> None:
        recent = datetime.now(timezone.utc) - timedelta(minutes=3)
        task_id = self._create_task(status=TaskStatus.running, created_at=recent, updated_at=recent)

        with self.SessionLocal() as db:
            recovered = recover_stale_tasks(db, now=datetime.now(timezone.utc))

        self.assertEqual(recovered, 0)
        with self.SessionLocal() as db:
            task = db.get(Task, task_id)
            assert task is not None
            self.assertEqual(task.status, TaskStatus.running)

    def test_recovers_long_pending_task(self) -> None:
        old = datetime.now(timezone.utc) - timedelta(minutes=45)
        task_id = self._create_task(status=TaskStatus.pending, created_at=old, updated_at=old)

        with self.SessionLocal() as db:
            recovered = recover_stale_tasks(db, now=datetime.now(timezone.utc))

        self.assertEqual(recovered, 1)
        with self.SessionLocal() as db:
            task = db.get(Task, task_id)
            assert task is not None
            self.assertEqual(task.status, TaskStatus.failed)
            self.assertEqual(task.result["error_code"], "task_stale_pending")
