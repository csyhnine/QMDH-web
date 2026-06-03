import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import DataClassification, Project, ProviderCall, Task, TaskStatus, UsageLedger, User, Workflow
from app.services.task_executor import ProviderExecutionError, RequestDiagnostics, execute_task


class TaskErrorReportingTests(unittest.TestCase):
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
                name="designer",
                display_name="Designer",
                role="designer",
                password_hash="unused",
                is_active=True,
                project_codes=["QMDH-001"],
            )
            project = Project(name="Demo", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="image-generate",
                name="Image Generate",
                description="Generate image",
                category="image",
                priority="P1",
                provider_capability="image.generate",
                config={},
            )
            db.add_all([user, project, workflow])
            db.flush()

            task = Task(
                title="Broken task",
                status=TaskStatus.pending,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="openai_image",
                payload={"prompt": "test"},
                result={},
                classification=DataClassification.b,
            )
            db.add(task)
            db.commit()
            self.task_id = task.id

    def tearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_execute_task_records_structured_failure_details(self) -> None:
        with patch("app.services.task_executor.SessionLocal", self.SessionLocal):
            with patch(
                "app.services.task_executor.get_provider_adapter",
                side_effect=ProviderExecutionError(
                    "Image generation failed with HTTP 404: <!DOCTYPE html><html>missing route</html>",
                    diagnostics=RequestDiagnostics(
                        strategy="chat_modalities_image",
                        endpoint_path="/chat/completions",
                        request_url="https://example.test/v1/chat/completions",
                        timeout_seconds=500.0,
                        adapter_mode="chat_modalities_image",
                        effective_capability="image.generate",
                    ),
                ),
            ):
                execute_task(self.task_id)

        with self.SessionLocal() as db:
            task = db.get(Task, self.task_id)
            self.assertIsNotNone(task)
            assert task is not None
            self.assertEqual(task.status, TaskStatus.failed)
            self.assertEqual(task.result["error_code"], "upstream_http_404")
            self.assertIn("上游接口或模型地址不存在", task.result["error_summary"])
            self.assertIn("HTML error page", task.result["error_detail"])
            self.assertEqual(task.result["request_strategy"], "chat_modalities_image")
            self.assertEqual(task.result["request_endpoint"], "/chat/completions")
            self.assertEqual(task.result["request_url"], "https://example.test/v1/chat/completions")
            self.assertEqual(task.result["request_timeout_seconds"], 500.0)
            self.assertEqual(task.result["execution_mode"], "background")

            provider_calls = list(db.scalars(select(ProviderCall).where(ProviderCall.task_id == self.task_id)).all())
            self.assertEqual(len(provider_calls), 1)
            self.assertEqual(
                provider_calls[0].request_summary["failure"]["error_code"],
                "upstream_http_404",
            )
            self.assertEqual(
                provider_calls[0].request_summary["request_diagnostics"]["request_url"],
                "https://example.test/v1/chat/completions",
            )

            task_ledger = db.scalar(
                select(UsageLedger).where(
                    UsageLedger.source_table == "tasks",
                    UsageLedger.source_id == self.task_id,
                )
            )
            self.assertIsNotNone(task_ledger)
            assert task_ledger is not None
            self.assertEqual(task_ledger.error_code, "upstream_http_404")


if __name__ == "__main__":
    unittest.main()
