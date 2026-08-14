import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import (
    DataClassification,
    Project,
    ProviderCall,
    Task,
    TaskStatus,
    UsageLedger,
    User,
    Workflow,
)
from app.routers.dashboard import (
    USAGE_LOG_DEFAULT_ENTRY_TYPES,
    _usage_log_billable_entry_types,
    _usage_log_input_summary,
    _usage_log_output_summary,
    _usage_log_record,
)
from app.services.usage_ledger import (
    compose_task_input_summary,
    ensure_usage_ledger_for_task,
    resolve_task_usage_meta,
)


class UsageLogBillingTests(unittest.TestCase):
    def test_billable_entry_types_prefers_task_summary_when_enabled(self) -> None:
        allowed = list(USAGE_LOG_DEFAULT_ENTRY_TYPES)
        self.assertEqual(
            _usage_log_billable_entry_types(
                include_task_summary=True,
                entry_type=None,
                allowed_entry_types=allowed,
            ),
            ("task.finalized", "chat.message.completed"),
        )

    def test_billable_entry_types_uses_provider_calls_when_task_summary_disabled(self) -> None:
        allowed = [item for item in USAGE_LOG_DEFAULT_ENTRY_TYPES if item != "task.finalized"]
        self.assertEqual(
            _usage_log_billable_entry_types(
                include_task_summary=False,
                entry_type=None,
                allowed_entry_types=allowed,
            ),
            ("provider_call.recorded", "chat.message.completed"),
        )

    def test_billable_entry_types_respects_explicit_entry_type_filter(self) -> None:
        allowed = list(USAGE_LOG_DEFAULT_ENTRY_TYPES)
        self.assertEqual(
            _usage_log_billable_entry_types(
                include_task_summary=True,
                entry_type="provider_call.recorded",
                allowed_entry_types=allowed,
            ),
            ("provider_call.recorded",),
        )

    def test_summary_mode_excludes_provider_calls_to_avoid_double_rows(self) -> None:
        types = _usage_log_billable_entry_types(
            include_task_summary=True,
            entry_type=None,
            allowed_entry_types=list(USAGE_LOG_DEFAULT_ENTRY_TYPES),
        )
        self.assertIn("task.finalized", types)
        self.assertNotIn("provider_call.recorded", types)


class UsageLogDisplayTests(unittest.TestCase):
    def test_compose_task_input_summary_for_generate(self) -> None:
        self.assertEqual(
            compose_task_input_summary(
                capability="image.generate",
                aspect_ratio="16:9",
                resolution="2k",
            ),
            "16:9 · 2K",
        )

    def test_compose_task_input_summary_for_edit_follow_source(self) -> None:
        self.assertEqual(
            compose_task_input_summary(
                capability="image.edit",
                aspect_ratio="",
                resolution="1k",
                reference_count=1,
            ),
            "遵循原图 · 1K · 参考图 1",
        )

    def test_output_summary_uses_image_count(self) -> None:
        entry = SimpleNamespace(
            capability="image.generate",
            output_count=2,
            output_tokens=0,
            completion_tokens=0,
            entry_type="task.finalized",
        )
        self.assertEqual(_usage_log_output_summary(entry, capability="image.generate"), "2 张")

    def test_output_summary_uses_video_segment_count(self) -> None:
        entry = SimpleNamespace(
            capability="video.generate",
            output_count=0,
            output_tokens=0,
            completion_tokens=0,
            entry_type="task.finalized",
        )
        self.assertEqual(_usage_log_output_summary(entry, capability="video.generate"), "1 段")

    def test_output_summary_uses_chat_tokens(self) -> None:
        entry = SimpleNamespace(
            capability="chat.completions",
            output_count=1,
            output_tokens=80,
            completion_tokens=80,
            total_tokens=200,
            entry_type="chat.message.completed",
        )
        self.assertEqual(_usage_log_output_summary(entry, capability="chat.completions"), "200 tokens")

    def test_input_summary_prefers_usage_payload(self) -> None:
        entry = SimpleNamespace(
            capability="image.generate",
            usage_payload={"input_summary": "1:1 · 2K"},
            input_tokens=0,
            prompt_tokens=0,
        )
        self.assertEqual(_usage_log_input_summary(entry), "1:1 · 2K")


class UsageLedgerTaskMetaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def test_ensure_usage_ledger_fills_capability_and_input_summary(self) -> None:
        with self.SessionLocal() as db:
            user = User(name="tester", display_name="Tester", role="designer", password_hash="hash")
            project = Project(code="QMDH-001", name="Demo", owner_user_id=None)
            db.add(user)
            db.flush()
            project.owner_user_id = user.id
            workflow = Workflow(
                key="image.generate.demo",
                name="Generate",
                description="",
                provider_capability="image.generate",
            )
            db.add_all([project, workflow])
            db.flush()
            task = Task(
                title="demo",
                status=TaskStatus.completed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="gemini_image",
                payload={"aspect_ratio": "1:1", "resolution": "2k"},
                result={"output_count": 2},
                classification=DataClassification.b,
                cost=1.2,
                cost_currency="CNY",
                latency_ms=1200,
            )
            db.add(task)
            db.flush()
            db.add(
                ProviderCall(
                    task_id=task.id,
                    provider_name="gemini_image",
                    model_name="gemini-3.1-flash-image",
                    capability="image.generate",
                    cost=1.2,
                    cost_currency="CNY",
                )
            )
            db.flush()

            ensure_usage_ledger_for_task(db, task, ledger_source="test")
            db.commit()

            ledger = db.scalar(
                select(UsageLedger).where(
                    UsageLedger.source_table == "tasks",
                    UsageLedger.source_id == task.id,
                )
            )
            assert ledger is not None
            self.assertEqual(ledger.capability, "image.generate")
            self.assertEqual(ledger.model_name, "gemini-3.1-flash-image")
            self.assertEqual(ledger.provider_name, "gemini_image")
            self.assertEqual(ledger.output_count, 2)
            self.assertEqual(ledger.usage_payload.get("input_summary"), "1:1 · 2K")

            record = _usage_log_record(ledger, "设计组", "Tester")
            self.assertEqual(record.capability, "image.generate")
            self.assertEqual(record.input_summary, "1:1 · 2K")
            self.assertEqual(record.output_summary, "2 张")

    def test_resolve_task_usage_meta_falls_back_to_workflow_capability(self) -> None:
        workflow = SimpleNamespace(provider_capability="video.generate")
        task = SimpleNamespace(
            workflow=workflow,
            payload={"aspect_ratio": "16:9", "duration": "8", "resolution": "720p"},
            provider_calls=[],
        )
        capability, model_name, provider_name, usage_payload = resolve_task_usage_meta(task, [])
        self.assertEqual(capability, "video.generate")
        self.assertEqual(model_name, "")
        self.assertEqual(provider_name, "")
        self.assertEqual(usage_payload.get("input_summary"), "16:9 · 720p · 8s")


if __name__ == "__main__":
    unittest.main()
