from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.models import User, Project, Workflow, Task, TaskDispatch, TaskStatus, ReferenceUpload
from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.routers import tasks
from app.services import task_dispatch as dispatch
from app.services.task_stale_recovery import recover_stale_tasks


class DispatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.engine = create_engine(f"sqlite:///{Path(self.temp.name) / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(self.engine)
        with self.sessions() as db:
            user = User(name="dispatch-fixture", role="designer", password_hash="fixture", project_codes=["DISPATCH"])
            project = Project(code="DISPATCH", name="Synthetic", owner_user_id=None)
            workflow = Workflow(key="image-generate", name="Synthetic", description="", category="image", priority="P1", version="v1", provider_capability="image.generate")
            db.add_all([user, project, workflow]); db.commit()
            self.user, self.project, self.workflow = user.id, project.id, workflow.id
        self.patch = patch.object(dispatch, "SessionLocal", self.sessions); self.patch.start()

    def tearDown(self):
        self.patch.stop(); self.engine.dispose(); self.temp.cleanup()

    def job(self, comfy=True, **kwargs):
        with self.sessions() as db:
            task = Task(title="Synthetic", workflow_id=self.workflow, project_id=self.project, user_id=self.user,
                        requested_provider="comfy-fixture" if comfy else "cloud-fixture", payload={}, result={}, status=TaskStatus.pending)
            db.add(task); db.flush(); job = dispatch.add_dispatch(db, task, comfy=comfy)
            for key, value in kwargs.items(): setattr(job, key, value)
            db.commit(); return task.id

    def test_fifo_serial_gpu_does_not_block_cloud(self):
        first, second, cloud = self.job(), self.job(), self.job(False)
        claimed = dispatch.claim(); self.assertEqual(claimed[0], first)
        self.assertEqual(dispatch.claim()[0], cloud)
        self.assertIsNone(dispatch.claim())
        with self.sessions() as db:
            db.get(TaskDispatch, first).state = "done"; db.commit()
        self.assertEqual(dispatch.claim()[0], second)

    def test_expired_gpu_resumes_same_task_and_fences_old_owner(self):
        task_id = self.job(state="leased", lease_owner="old", lease_until=datetime.now(timezone.utc)-timedelta(seconds=1))
        task, token = dispatch.claim()
        self.assertEqual(task, task_id); self.assertNotEqual(token, "old")
        dispatch.heartbeat(task_id, "old")
        with self.sessions() as db:
            self.assertEqual(db.get(TaskDispatch, task).lease_owner, token)

    def test_expired_cloud_is_not_blindly_resubmitted(self):
        task = self.job(False, state="leased", lease_owner="dead", lease_until=datetime.now(timezone.utc)-timedelta(seconds=1))
        self.assertIsNone(dispatch.claim())
        with self.sessions() as db:
            self.assertEqual(db.get(TaskDispatch, task).state, "review")
            self.assertIn("请勿", db.get(Task, task).result["error"])

    def test_stale_recovery_preserves_queued_outbox(self):
        task = self.job()
        with self.sessions() as db:
            db.get(Task, task).created_at = datetime.now(timezone.utc)-timedelta(days=1); db.commit()
            self.assertEqual(recover_stale_tasks(db), 0)
            self.assertEqual(db.get(Task, task).status, TaskStatus.pending)

    def test_task_and_outbox_rollback_together(self):
        with self.sessions() as db:
            task = Task(title="Rollback", workflow_id=self.workflow, project_id=self.project, user_id=self.user,
                        requested_provider="fixture", payload={}, result={})
            db.add(task); db.flush(); task_id = task.id; dispatch.add_dispatch(db, task); db.rollback()
        with self.sessions() as db:
            self.assertIsNone(db.get(Task, task_id)); self.assertIsNone(db.get(TaskDispatch, task_id))

    def test_lost_http_response_reuses_task_and_changed_payload_conflicts(self):
        app = FastAPI(); app.include_router(tasks.router)
        def session():
            with self.sessions() as db: yield db
        app.dependency_overrides[get_db] = session
        app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="dispatch-fixture", user_id=self.user, role="designer", token="fixture", project_codes=("DISPATCH",))
        body = {"title": "Synthetic", "project_code": "DISPATCH", "workflow_key": "image-generate", "requested_provider": "jimeng", "payload": {"prompt": "fixture"}, "submission_key": "fixture_1234567890123456"}
        with patch.object(tasks.settings, "task_execution_mode", "redis"), patch.object(tasks, "enqueue_task", side_effect=RuntimeError("redis unavailable")):
            client = TestClient(app)
            one = client.post("/tasks", json=body); two = client.post("/tasks", json=body)
            self.assertEqual(one.status_code, 202, one.text)
            self.assertEqual(two.json()["id"], one.json()["id"])
            self.assertEqual(client.post("/tasks", json={**body, "payload": {"prompt": "changed"}}).status_code, 409)
        self.assertEqual(dispatch.claim()[0], one.json()["id"])

    def test_owned_image_checks_reject_other_user_and_external_url(self):
        from app.services.provider_adapters.comfyui import owned_references
        with self.sessions() as db:
            for value in ("https://example.com/x.png", "/media/references/someone-else.png"):
                with self.assertRaises(ValueError): owned_references(db, self.user, {"reference_images": [value, value]})
