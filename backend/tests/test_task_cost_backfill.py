import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.encryption import encrypt_value
from app.database import Base
from app.models import (
    DataClassification,
    Project,
    ProviderCall,
    ProviderProfile,
    Task,
    TaskStatus,
    UsageLedger,
    User,
    Workflow,
)
from app.services.task_cost_backfill import backfill_task_costs


class TaskCostBackfillTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def _seed_image_task(self, *, resolution: str, old_cost: float) -> int:
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
            profile = ProviderProfile(
                provider_name="gemini_image",
                api_key=encrypt_value("test-key"),
                base_url="https://newapi.haodeya.xyz/v1",
                model_name="gemini-3.1-flash-image",
                adapter_kind="openai_compatible",
                capabilities=["image.generate"],
                pricing_unit="per_image",
                unit_price=0.67,
                adapter_config={"unit_price_1k": 0.1, "unit_price_2k": 0.2},
            )
            db.add_all([user, project, workflow, profile])
            db.flush()
            task = Task(
                title="demo",
                status=TaskStatus.completed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="gemini_image",
                payload={"resolution": resolution},
                result={"output_count": 1, "billing": {"resolution_tier": resolution}},
                cost=old_cost,
                cost_currency="CNY",
            )
            db.add(task)
            db.flush()
            db.add(
                ProviderCall(
                    task_id=task.id,
                    provider_name="gemini_image",
                    model_name="gemini-3.1-flash-image",
                    capability="image.generate",
                    cost=old_cost,
                    cost_currency="CNY",
                )
            )
            db.commit()
            return task.id

    def test_backfill_updates_image_task_and_usage_ledger(self) -> None:
        task_id = self._seed_image_task(resolution="2k", old_cost=0.67)
        with self.SessionLocal() as db:
            result = backfill_task_costs(db, dry_run=False)
            self.assertEqual(result.updated, 1)
            task = db.get(Task, task_id)
            assert task is not None
            self.assertEqual(task.cost, 0.95)
            ledger = db.scalar(
                select(UsageLedger).where(
                    UsageLedger.source_table == "tasks",
                    UsageLedger.source_id == task_id,
                )
            )
            assert ledger is not None
            self.assertEqual(ledger.cost, 0.95)

    def test_backfill_dry_run_does_not_persist(self) -> None:
        task_id = self._seed_image_task(resolution="1k", old_cost=0.1)
        with self.SessionLocal() as db:
            result = backfill_task_costs(db, dry_run=True)
            self.assertEqual(result.updated, 1)
            task = db.get(Task, task_id)
            assert task is not None
            self.assertEqual(task.cost, 0.1)


if __name__ == "__main__":
    unittest.main()
