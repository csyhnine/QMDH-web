from base64 import b64encode
import shutil
import tempfile
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password, hash_session_token
from app.database import Base, get_db
from app.models import AgentClient, AgentJob, Asset, DataClassification, Project, ProjectResearchNote, Task, TaskStatus, User, Workflow
from app.routers import agent, assets, inspiration


class AgentApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.mkdtemp(prefix="qmdh-agent-api-")
        self.storage_backend_patcher = patch("app.services.media_storage.settings.storage_backend", "local")
        self.media_root_patcher = patch("app.services.media_storage.settings.media_root", self.tempdir)
        self.media_prefix_patcher = patch("app.services.media_storage.settings.media_url_prefix", "/media")
        self.auth_users_patcher = patch(
            "app.core.config.settings.auth_users_json",
            (
                '[{"name":"designer.arch","token":"designer-token","role":"designer","project_codes":["QMDH-001"],"user_id":1},'
                '{"name":"admin.ops","token":"admin-token","role":"admin","project_codes":["*"],"user_id":2}]'
            ),
        )
        self.execution_mode_patcher = patch("app.routers.agent.settings.task_execution_mode", "sync")
        self.storage_backend_patcher.start()
        self.media_root_patcher.start()
        self.media_prefix_patcher.start()
        self.auth_users_patcher.start()
        self.execution_mode_patcher.start()

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            user = User(
                id=1,
                name="designer.arch",
                display_name="Designer",
                role="designer",
                password_hash=hash_password("designer-pass"),
                is_active=True,
                project_codes=["QMDH-001"],
            )
            admin_user = User(
                id=2,
                name="admin.ops",
                display_name="Admin",
                role="admin",
                password_hash=hash_password("admin-pass"),
                is_active=True,
                project_codes=["*"],
            )
            project = Project(id=1, name="QMDH Demo", code="QMDH-001", classification=DataClassification.b, owner_user_id=1)
            db.add_all(
                [
                    user,
                    admin_user,
                    project,
                    Workflow(
                        key="image-generate",
                        name="Image Generate",
                        description="Generate test images",
                        category="image",
                        priority="P1",
                        provider_capability="image.generate",
                        config={},
                    ),
                    Workflow(
                        key="image-edit",
                        name="Image Edit",
                        description="Edit test images",
                        category="image",
                        priority="P1",
                        provider_capability="image.edit",
                        config={},
                    ),
                    AgentClient(
                        key="openclaw-dev",
                        display_name="OpenClaw Dev",
                        device_id="DEVICE-001",
                        token_hash=hash_session_token("agent-token"),
                        user_id=1,
                        role="designer",
                        environment="test",
                        project_codes=["QMDH-001"],
                        capabilities=["image.generate", "image.edit", "inspiration.import", "project.asset", "research.note"],
                        client_metadata={},
                        is_active=True,
                    ),
                ]
            )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(agent.router)
        self.app.include_router(assets.router)
        self.app.include_router(inspiration.router)
        self.client = TestClient(self.app)
        self.execute_patcher = patch("app.routers.agent.execute_task")
        self.execute_patcher.start()

    def tearDown(self) -> None:
        self.execute_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        self.execution_mode_patcher.stop()
        self.auth_users_patcher.stop()
        self.storage_backend_patcher.stop()
        self.media_root_patcher.stop()
        self.media_prefix_patcher.stop()
        shutil.rmtree(self.tempdir, ignore_errors=True)

    def _agent_headers(self) -> dict[str, str]:
        return {
            "X-QMDH-Agent-Token": "agent-token",
            "X-QMDH-Agent-Key": "openclaw-dev",
            "X-QMDH-Execution-Id": "ocw-exec-001",
            "X-Request-ID": "req-agent-001",
        }

    def _admin_headers(self) -> dict[str, str]:
        return {
            "X-QMDH-Auth": "admin-token",
            "X-QMDH-User": "admin.ops",
        }

    def test_image_generate_creates_task_backed_job(self) -> None:
        response = self.client.post(
            "/agent/image-generate",
            headers=self._agent_headers(),
            json={
                "title": "Research render",
                "project_id": 1,
                "requested_provider": "jimeng",
                "payload": {"prompt": "Generate a waterfront concept", "image_count": 2},
            },
        )

        self.assertEqual(response.status_code, 202, response.text)
        payload = response.json()
        self.assertEqual(payload["job_type"], "image.generate")
        self.assertEqual(payload["status"], "accepted")
        self.assertEqual(payload["project_code"], "QMDH-001")
        self.assertEqual(payload["request_id"], "req-agent-001")
        self.assertTrue(payload["task_id"])

        job_lookup = self.client.get(f"/agent/jobs/{payload['id']}", headers=self._agent_headers())
        self.assertEqual(job_lookup.status_code, 200, job_lookup.text)
        self.assertEqual(job_lookup.json()["task_id"], payload["task_id"])

        with self.SessionLocal() as db:
            task = db.get(Task, payload["task_id"])
            self.assertIsNotNone(task)
            self.assertEqual(task.user_id, 1)
            self.assertEqual(task.project_id, 1)
            self.assertEqual(task.requested_provider, "jimeng")

    def test_redis_enqueue_failure_marks_agent_job_and_task_failed(self) -> None:
        with (
            patch("app.routers.agent.settings.task_execution_mode", "redis"),
            patch("app.routers.agent.enqueue_task", side_effect=RuntimeError("redis down")),
        ):
            response = self.client.post(
                "/agent/image-generate",
                headers=self._agent_headers(),
                json={
                    "title": "Agent queue failure",
                    "project_id": 1,
                    "requested_provider": "jimeng",
                    "payload": {"prompt": "Generate a waterfront concept"},
                },
            )

        self.assertEqual(response.status_code, 503, response.text)

        with self.SessionLocal() as db:
            task = db.scalar(select(Task).where(Task.title == "Agent queue failure"))
            self.assertIsNotNone(task)
            assert task is not None
            job = db.scalar(select(AgentJob).where(AgentJob.task_id == task.id))
            self.assertIsNotNone(job)
            assert job is not None
            self.assertEqual(task.status, TaskStatus.failed)
            self.assertEqual(task.result["error_stage"], "task_enqueue")
            self.assertEqual(job.status, "failed")
            self.assertEqual(job.result["error_stage"], "task_enqueue")
            self.assertIsNotNone(job.completed_at)

    def test_agent_can_import_inspiration(self) -> None:
        with patch("app.routers.agent.prepare_inspiration_image", return_value="inspiration/imports/agent-post.png"):
            response = self.client.post(
                "/agent/inspiration/import",
                headers=self._agent_headers(),
                json={
                    "project_id": 1,
                    "title": "Agent discovered facade",
                    "image_path": "https://example.test/facade.png",
                    "category": "Facade",
                    "tags": ["material", "lighting"],
                    "source_url": "https://example.test/article",
                    "source_name": "example.test",
                },
            )

        self.assertEqual(response.status_code, 201, response.text)
        payload = response.json()
        self.assertEqual(payload["job_type"], "inspiration.import")
        self.assertEqual(payload["status"], "completed")
        self.assertTrue(payload["inspiration_post_id"])

        listed = self.client.get(
            "/inspiration",
            headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer.arch"},
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json()[0]["image_path"], "/media/inspiration/imports/agent-post.png")

    def test_agent_project_artifact_is_visible_in_assets(self) -> None:
        response = self.client.post(
            "/agent/projects/1/artifacts",
            headers=self._agent_headers(),
            json={
                "name": "Site screenshot",
                "asset_type": "image",
                "data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yh3cAAAAASUVORK5CYII=",
                "tags": ["agent", "research"],
            },
        )

        self.assertEqual(response.status_code, 201, response.text)
        payload = response.json()
        self.assertEqual(payload["job_type"], "project.asset.save")
        self.assertEqual(payload["status"], "completed")
        self.assertTrue(payload["asset_id"])

        listed = self.client.get(
            "/assets",
            headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer.arch"},
        )
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual([asset["name"] for asset in listed.json()], ["Site screenshot"])

        with self.SessionLocal() as db:
            asset = db.get(Asset, payload["asset_id"])
            self.assertIsNotNone(asset)
            self.assertEqual(asset.project_id, 1)
            self.assertIsNone(asset.source_task_id)

    def test_reference_upload_rejects_oversized_payload(self) -> None:
        oversized_payload = b64encode(b"12345").decode("ascii")
        with patch("app.routers.assets.MAX_REFERENCE_IMAGE_BYTES", 4):
            response = self.client.post(
                "/assets/reference-upload",
                headers={"X-QMDH-Auth": "designer-token", "X-QMDH-User": "designer.arch"},
                json={
                    "file_name": "oversized.png",
                    "data_url": f"data:image/png;base64,{oversized_payload}",
                },
            )

        self.assertEqual(response.status_code, 413, response.text)
        self.assertIn("10MB or smaller", response.text)

    def test_workflow_intent_job_can_be_completed_with_research_note(self) -> None:
        created = self.client.post(
            "/agent/workflow-intents/research-to-image",
            headers=self._agent_headers(),
            json={
                "project_id": 1,
                "title": "Research -> image",
                "payload": {"query": "waterfront hotels in fog"},
            },
        )
        self.assertEqual(created.status_code, 202, created.text)
        job_id = created.json()["id"]

        completed = self.client.post(
            f"/agent/jobs/{job_id}/complete",
            headers=self._agent_headers(),
            json={"status": "completed", "result": {"summary": "Research finished"}},
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(completed.json()["status"], "completed")

        note_response = self.client.post(
            "/agent/projects/1/research-notes",
            headers=self._agent_headers(),
            json={
                "title": "Waterfront references",
                "summary": "Collected facade precedents",
                "content": "Three precedents with glass-heavy podiums.",
                "source_url": "https://example.test/research",
                "tags": ["waterfront", "facade"],
            },
        )
        self.assertEqual(note_response.status_code, 201, note_response.text)
        self.assertEqual(note_response.json()["status"], "completed")

        with self.SessionLocal() as db:
            note = db.scalar(select(ProjectResearchNote).where(ProjectResearchNote.project_id == 1))
            self.assertIsNotNone(note)
            self.assertEqual(note.title, "Waterfront references")

    def test_admin_can_view_agent_clients_and_skills(self) -> None:
        clients_response = self.client.get("/agent/admin/clients", headers=self._admin_headers())
        self.assertEqual(clients_response.status_code, 200, clients_response.text)
        self.assertEqual(clients_response.json()[0]["key"], "openclaw-dev")

        skills_response = self.client.get("/agent/admin/skills", headers=self._admin_headers())
        self.assertEqual(skills_response.status_code, 200, skills_response.text)
        skill_keys = {item["key"] for item in skills_response.json()}
        self.assertIn("qmdh-image-generate", skill_keys)

    def test_admin_can_create_and_update_skill_release(self) -> None:
        created = self.client.post(
            "/agent/admin/releases",
            headers=self._admin_headers(),
            json={
                "key": "qmdh-prod-pack",
                "display_name": "QMDH Prod Pack",
                "environment": "prod",
                "openclaw_version": "1.6.0",
                "skill_keys": ["qmdh-image-generate", "qmdh-save-project-asset"],
                "notes": "Approved for controlled production writes.",
                "is_active": True,
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        created_payload = created.json()
        self.assertEqual(created_payload["created_by_user_name"], "admin.ops")
        self.assertEqual(created_payload["environment"], "prod")

        updated = self.client.patch(
            f"/agent/admin/releases/{created_payload['id']}",
            headers=self._admin_headers(),
            json={
                "openclaw_version": "1.6.1",
                "notes": "Hotfix rollout",
                "is_active": False,
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        updated_payload = updated.json()
        self.assertEqual(updated_payload["openclaw_version"], "1.6.1")
        self.assertFalse(updated_payload["is_active"])


if __name__ == "__main__":
    unittest.main()
