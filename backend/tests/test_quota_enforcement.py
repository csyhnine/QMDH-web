import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.database import Base, get_db
from app.models import DataClassification, Project, ProviderProfile, TaskStatus, UsageLedger, User, Workflow
from app.routers import auth, chat, tasks


class QuotaEnforcementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            blocked_user = User(
                name="blocked.designer",
                display_name="Blocked Designer",
                role="designer",
                password_hash=hash_password("blocked-pass"),
                is_active=True,
                project_codes=["QMDH-001"],
                monthly_quota=1.0,
                billing_plan="standard",
                billing_status="active",
                quota_policy="hard_block",
                quota_reset_cycle="monthly",
            )
            warning_user = User(
                name="warn.designer",
                display_name="Warn Designer",
                role="designer",
                password_hash=hash_password("warn-pass"),
                is_active=True,
                project_codes=["QMDH-001"],
                monthly_quota=1.0,
                billing_plan="trial",
                billing_status="active",
                quota_policy="soft_warn",
                quota_reset_cycle="monthly",
            )
            db.add_all([blocked_user, warning_user])
            db.flush()

            db.add(Project(name="Demo", code="QMDH-001", classification=DataClassification.b))
            db.add(
                Workflow(
                    key="image-generate",
                    name="Image",
                    description="Image generation",
                    category="image",
                    priority="P1",
                    provider_capability="image.generate",
                    config={},
                )
            )
            db.add(
                ProviderProfile(
                    provider_name="chat_metered",
                    api_key="",
                    base_url="https://api.example.test/v1",
                    model_name="chat-metered-v1",
                    adapter_kind="openai_compatible",
                    capabilities=["chat.completions"],
                    enabled=True,
                )
            )
            db.flush()

            now = datetime.now(timezone.utc)
            for offset, user in enumerate((blocked_user, warning_user), start=1):
                db.add(
                    UsageLedger(
                        entry_type="task.finalized",
                        source_table="tasks",
                        source_id=offset,
                        ledger_source="test.seed",
                        recorded_at=now,
                        project_code="QMDH-001",
                        project_name="Demo",
                        workflow_key="image-generate",
                        workflow_name="Image",
                        user_id=user.id,
                        user_name=user.name,
                        requested_provider="jimeng",
                        provider_name="jimeng",
                        model_name="jimeng-v1",
                        capability="image.generate",
                        classification=DataClassification.b,
                        task_status=TaskStatus.completed,
                        cost=1.0,
                        cost_currency="CNY",
                        billable_units=1.0,
                        billing_unit="per_image",
                        output_count=1,
                        prompt_tokens=0,
                        completion_tokens=0,
                        total_tokens=0,
                        input_tokens=0,
                        output_tokens=0,
                        cached_input_tokens=0,
                        uncached_input_tokens=0,
                        usage_payload={},
                        latency_ms=0,
                        error_code="",
                        error_summary="",
                    )
                )
            db.commit()

        self.app = FastAPI()

        def override_get_db():
            with self.SessionLocal() as db:
                yield db

        self.app.dependency_overrides[get_db] = override_get_db
        self.app.include_router(auth.router)
        self.app.include_router(tasks.router)
        self.app.include_router(chat.router)
        self.client = TestClient(self.app)
        self.execution_patcher = patch("app.routers.tasks.execute_task")
        self.execution_patcher.start()

    def tearDown(self) -> None:
        self.execution_patcher.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def login(self, username: str, password: str) -> str:
        response = self.client.post("/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["token"]

    def test_hard_block_rejects_task_submission_but_soft_warn_allows_it(self) -> None:
        blocked_token = self.login("blocked.designer", "blocked-pass")
        warning_token = self.login("warn.designer", "warn-pass")
        payload = {
            "title": "Quota limited task",
            "workflow_key": "image-generate",
            "project_code": "QMDH-001",
            "requested_provider": "jimeng",
            "classification": "B",
            "payload": {"prompt": "Generate an image", "image_count": 1},
        }

        blocked_response = self.client.post(
            "/tasks",
            headers={"Authorization": f"Bearer {blocked_token}"},
            json=payload,
        )
        self.assertEqual(blocked_response.status_code, 403, blocked_response.text)
        self.assertIn("额度", blocked_response.json()["detail"])

        warning_response = self.client.post(
            "/tasks",
            headers={"Authorization": f"Bearer {warning_token}"},
            json=payload,
        )
        self.assertEqual(warning_response.status_code, 202, warning_response.text)

    def test_hard_block_rejects_chat_message_before_streaming(self) -> None:
        blocked_token = self.login("blocked.designer", "blocked-pass")
        headers = {"Authorization": f"Bearer {blocked_token}"}

        with self.SessionLocal() as db:
            provider = db.scalar(select(ProviderProfile).where(ProviderProfile.provider_name == "chat_metered"))
            self.assertIsNotNone(provider)
            assert provider is not None
            provider_id = provider.id

        created = self.client.post(
            "/chat/conversations",
            headers=headers,
            json={"model_provider_id": provider_id, "title": "Quota chat"},
        )
        self.assertEqual(created.status_code, 201, created.text)

        with (
            patch("app.routers.chat.provider_profile_has_usable_api_key", return_value=True),
            patch("app.routers.chat.snapshot_chat_provider_config", return_value=MagicMock(model_name="chat-metered-v1")),
        ):
            blocked_response = self.client.post(
                f"/chat/conversations/{created.json()['id']}/messages",
                headers={**headers, "Content-Type": "application/json"},
                json={"content": "hello"},
            )

        self.assertEqual(blocked_response.status_code, 403, blocked_response.text)
        self.assertIn("额度", blocked_response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
