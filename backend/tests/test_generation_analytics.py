import unittest
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AuditLog, DataClassification, GenerationIntent, GenerationSession, Project, PromptTemplate, Task, TaskStatus, User, Workflow
from app.core.audit import AuditEventType
from app.services.generation_fingerprints import prompt_fingerprint, ref_fingerprint
from app.services.generation_intent_service import record_generation_intent_for_task, sync_generation_intent_from_task
from app.services.generation_outcome_service import record_generation_outcome, record_generation_outcome_from_task_payload
from app.services.generation_analytics_dashboard_service import (
    compute_template_quality_score,
    get_download_usage_stats,
    get_generation_analytics_overview,
    get_prompt_polish_usage_stats,
    get_template_quality_scores,
)
from app.services.generation_session_service import recompute_all_generation_sessions, recompute_session_metrics


class GenerationFingerprintTests(unittest.TestCase):
    def test_prompt_fingerprint_normalizes_whitespace_and_case(self) -> None:
        left = prompt_fingerprint("  City   Night  ")
        right = prompt_fingerprint("city night")
        self.assertEqual(left, right)
        self.assertEqual(len(left), 16)

    def test_ref_fingerprint_is_order_invariant(self) -> None:
        left = ref_fingerprint(["/media/a.png", "/media/b.png"])
        right = ref_fingerprint(["/media/b.png", "/media/a.png"])
        self.assertEqual(left, right)


class GenerationSessionMetricsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            user = User(name="designer", role="designer", password_hash="unused", is_active=True, project_codes=["QMDH-001"])
            project = Project(name="Demo", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="image-edit",
                name="Image Edit",
                description="Edit image",
                category="demo",
                priority="P1",
                provider_capability="image.edit",
                config={},
            )
            db.add_all([user, project, workflow])
            db.flush()

            ref_paths = ["/media/ref-1.png"]
            now = datetime.now(timezone.utc)

            def make_task(prompt: str, *, offset_minutes: int) -> Task:
                payload = {"edit_prompt": prompt, "reference_images": ref_paths}
                task = Task(
                    title=f"Task {prompt}",
                    status=TaskStatus.pending,
                    workflow_id=workflow.id,
                    project_id=project.id,
                    user_id=user.id,
                    requested_provider="test-provider",
                    payload=payload,
                    result={"reference_image_storage_paths": ref_paths},
                    created_at=now + timedelta(minutes=offset_minutes),
                    updated_at=now + timedelta(minutes=offset_minutes),
                )
                db.add(task)
                db.flush()
                record_generation_intent_for_task(db, task=task, workflow_key=workflow.key, template_id=7)
                return task

            self.gacha_tasks = [
                make_task("same prompt", offset_minutes=0),
                make_task("same prompt", offset_minutes=1),
                make_task("same prompt", offset_minutes=2),
            ]
            self.explore_tasks = [
                make_task("prompt A", offset_minutes=40),
                make_task("prompt B", offset_minutes=41),
                make_task("prompt C", offset_minutes=42),
            ]
            for task in self.gacha_tasks + self.explore_tasks:
                task.status = TaskStatus.completed
                task.result = {
                    **task.result,
                    "asset_storage_path": "/media/out.png",
                }
                sync_generation_intent_from_task(db, task)
            db.commit()

    def test_gacha_session_scores_high_repeat(self) -> None:
        with self.SessionLocal() as db:
            session = db.query(GenerationSession).order_by(GenerationSession.id.asc()).first()
            self.assertIsNotNone(session)
            assert session is not None
            self.assertEqual(session.submit_count, 3)
            self.assertEqual(session.prompt_variant_count, 1)
            self.assertGreater(session.gacha_score, 0.9)
            self.assertLess(session.explore_score, 0.1)

    def test_explore_session_scores_high_variation(self) -> None:
        with self.SessionLocal() as db:
            sessions = db.query(GenerationSession).order_by(GenerationSession.id.asc()).all()
            self.assertGreaterEqual(len(sessions), 2)
            explore_session = sessions[-1]
            self.assertEqual(explore_session.submit_count, 3)
            self.assertEqual(explore_session.prompt_variant_count, 3)
            self.assertGreater(explore_session.explore_score, 0.9)
            self.assertLess(explore_session.gacha_score, 0.1)

    def test_recompute_all_sessions(self) -> None:
        with self.SessionLocal() as db:
            result = recompute_all_generation_sessions(db)
            db.commit()
            self.assertEqual(result["intents_processed"], 6)
            self.assertGreaterEqual(result["sessions_created"], 2)
            intent_count = db.query(GenerationIntent).count()
            assigned = db.query(GenerationIntent).filter(GenerationIntent.session_id.is_not(None)).count()
            self.assertEqual(intent_count, assigned)


class GenerationOutcomeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            user = User(name="designer", role="designer", password_hash="unused", is_active=True, project_codes=["QMDH-001"])
            project = Project(name="Demo", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="image-edit",
                name="Image Edit",
                description="Edit image",
                category="demo",
                priority="P1",
                provider_capability="image.edit",
                config={},
            )
            db.add_all([user, project, workflow])
            db.flush()

            ref_paths = ["/media/ref-1.png"]
            task = Task(
                title="Outcome task",
                status=TaskStatus.completed,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="test-provider",
                payload={"edit_prompt": "prompt", "reference_images": ref_paths},
                result={"reference_image_storage_paths": ref_paths, "asset_storage_path": "/media/out.png"},
            )
            db.add(task)
            db.flush()
            record_generation_intent_for_task(db, task=task, workflow_key=workflow.key)
            sync_generation_intent_from_task(db, task)
            db.commit()
            self.task_id = task.id

    def test_record_generation_outcome_marks_intent_settled(self) -> None:
        with self.SessionLocal() as db:
            intent = record_generation_outcome(
                db,
                task_id=self.task_id,
                outcome_type="bookmarked",
                asset_id=42,
            )
            db.commit()
            self.assertIsNotNone(intent)
            assert intent is not None
            signals = intent.outcome_signals
            self.assertTrue(signals.get("settled"))
            self.assertEqual(signals["bookmarked"]["count"], 1)
            self.assertIn(42, signals["bookmarked"]["asset_ids"])

    def test_record_download_outcome_marks_intent_settled(self) -> None:
        with self.SessionLocal() as db:
            intent = record_generation_outcome(
                db,
                task_id=self.task_id,
                outcome_type="downloaded",
                asset_id=99,
            )
            db.commit()
            self.assertIsNotNone(intent)
            assert intent is not None
            signals = intent.outcome_signals
            self.assertTrue(signals.get("settled"))
            self.assertEqual(signals["downloaded"]["count"], 1)

    def test_upscale_payload_records_source_task_outcome(self) -> None:
        with self.SessionLocal() as db:
            user = db.query(User).one()
            project = db.query(Project).one()
            workflow = db.query(Workflow).one()
            upscale_task = Task(
                title="Upscale",
                status=TaskStatus.pending,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="test-provider",
                payload={"source_task_id": self.task_id, "source_asset_id": 7},
            )
            db.add(upscale_task)
            db.flush()
            record_generation_outcome_from_task_payload(db, task=upscale_task)
            db.commit()

            source_intent = db.query(GenerationIntent).filter(GenerationIntent.task_id == self.task_id).one()
            signals = source_intent.outcome_signals
            self.assertTrue(signals.get("settled"))
            self.assertEqual(signals["upscaled"]["count"], 1)

    def test_session_metrics_include_settle_score(self) -> None:
        with self.SessionLocal() as db:
            record_generation_outcome(db, task_id=self.task_id, outcome_type="applied_to_composer")
            intent = db.query(GenerationIntent).filter(GenerationIntent.task_id == self.task_id).one()
            recompute_session_metrics(db, intent.session_id)
            db.commit()

            session = db.get(GenerationSession, intent.session_id)
            self.assertIsNotNone(session)
            assert session is not None
            self.assertEqual(session.metrics.get("settle_count"), 1)
            self.assertEqual(session.metrics.get("settle_score"), 1.0)
            self.assertEqual(session.metrics.get("outcome_totals", {}).get("applied_to_composer"), 1)


class GenerationAnalyticsDashboardTests(unittest.TestCase):
    def test_compute_template_quality_score_prefers_gacha_and_settle(self) -> None:
        high = compute_template_quality_score(
            avg_gacha=0.9,
            avg_explore=0.1,
            avg_settle=0.8,
            completion_rate=0.9,
        )
        low = compute_template_quality_score(
            avg_gacha=0.2,
            avg_explore=0.9,
            avg_settle=0.1,
            completion_rate=0.4,
        )
        self.assertGreater(high, low)

    def test_overview_and_template_quality_aggregate(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)

        with SessionLocal() as db:
            user = User(name="designer", role="designer", password_hash="unused", is_active=True, project_codes=["QMDH-001"])
            project = Project(name="Demo", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="image-edit",
                name="Image Edit",
                description="Edit image",
                category="demo",
                priority="P1",
                provider_capability="image.edit",
                config={},
            )
            template = PromptTemplate(
                user=user,
                scope="shared",
                label="立面",
                title="立面模板",
                prompt="facade prompt",
                style="modern",
                aspect_ratio="16:9",
                resolution="1k",
            )
            db.add_all([user, project, workflow, template])
            db.flush()

            ref_paths = ["/media/ref-1.png"]
            now = datetime.now(timezone.utc)

            def make_task(prompt: str, *, offset_minutes: int) -> Task:
                payload = {"edit_prompt": prompt, "reference_images": ref_paths}
                task = Task(
                    title=f"Task {prompt}",
                    status=TaskStatus.pending,
                    workflow_id=workflow.id,
                    project_id=project.id,
                    user_id=user.id,
                    requested_provider="test-provider",
                    payload=payload,
                    result={"reference_image_storage_paths": ref_paths},
                    created_at=now + timedelta(minutes=offset_minutes),
                    updated_at=now + timedelta(minutes=offset_minutes),
                )
                db.add(task)
                db.flush()
                record_generation_intent_for_task(
                    db,
                    task=task,
                    workflow_key=workflow.key,
                    template_id=template.id,
                )
                return task

            tasks = [
                make_task("same prompt", offset_minutes=0),
                make_task("same prompt", offset_minutes=1),
                make_task("same prompt", offset_minutes=2),
            ]
            for task in tasks:
                task.status = TaskStatus.completed
                task.result = {
                    **task.result,
                    "asset_storage_path": "/media/out.png",
                }
                sync_generation_intent_from_task(db, task)
            record_generation_outcome(db, task_id=tasks[0].id, outcome_type="bookmarked", asset_id=1)
            template_id = template.id
            db.commit()

        with SessionLocal() as db:
            overview = get_generation_analytics_overview(db, days=30)
            self.assertEqual(overview["intent_count"], 3)
            self.assertGreaterEqual(overview["session_count"], 1)
            self.assertGreater(overview["avg_gacha_score"], 0.8)
            self.assertGreaterEqual(overview["settled_intent_count"], 1)

            quality = get_template_quality_scores(db, days=30)
            self.assertEqual(len(quality["items"]), 1)
            row = quality["items"][0]
            self.assertEqual(row["template_id"], template_id)
            self.assertEqual(row["intent_count"], 3)
            self.assertGreater(row["quality_score"], 0.5)


class DownloadUsageStatsTests(unittest.TestCase):
    def test_overview_includes_download_metrics(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)

        with SessionLocal() as db:
            user = User(name="designer", role="designer", password_hash="unused", is_active=True, project_codes=["QMDH-001"])
            project = Project(name="Demo", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="image-generate",
                name="Generate",
                description="Generate",
                category="demo",
                priority="P1",
                provider_capability="image.generate",
                config={},
            )
            db.add_all([user, project, workflow])
            db.flush()

            def make_task(title: str) -> Task:
                task = Task(
                    title=title,
                    status=TaskStatus.pending,
                    workflow_id=workflow.id,
                    project_id=project.id,
                    user_id=user.id,
                    requested_provider="test-provider",
                    payload={"prompt": title},
                    result={},
                )
                db.add(task)
                db.flush()
                record_generation_intent_for_task(db, task=task, workflow_key=workflow.key)
                return task

            download_only = make_task("download only")
            bookmark_and_download = make_task("bookmark and download")
            no_outcome = make_task("no outcome")
            record_generation_outcome(db, task_id=download_only.id, outcome_type="downloaded", asset_id=1)
            record_generation_outcome(db, task_id=download_only.id, outcome_type="downloaded", asset_id=1)
            record_generation_outcome(db, task_id=bookmark_and_download.id, outcome_type="downloaded", asset_id=2)
            record_generation_outcome(db, task_id=bookmark_and_download.id, outcome_type="bookmarked", asset_id=2)
            db.commit()

        with SessionLocal() as db:
            stats = get_download_usage_stats(db, days=30)
            self.assertEqual(stats["download_event_count"], 3)
            self.assertEqual(stats["downloaded_intent_count"], 2)
            self.assertAlmostEqual(stats["download_rate"], 2 / 3, places=4)
            self.assertEqual(stats["download_only_settled_count"], 1)
            self.assertAlmostEqual(stats["download_settle_share"], 0.5, places=4)

            overview = get_generation_analytics_overview(db, days=30)
            self.assertEqual(overview["download_event_count"], 3)
            self.assertEqual(overview["outcome_totals"].get("downloaded"), 3)
            self.assertGreaterEqual(overview["settled_intent_count"], 2)


class PromptPolishUsageStatsTests(unittest.TestCase):
    def test_overview_includes_polish_metrics(self) -> None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)

        with SessionLocal() as db:
            user = User(name="designer", role="designer", password_hash="unused", is_active=True, project_codes=["QMDH-001"])
            project = Project(name="Demo", code="QMDH-001", classification=DataClassification.b)
            workflow = Workflow(
                key="image-generate",
                name="Generate",
                description="Generate",
                category="demo",
                priority="P1",
                provider_capability="image.generate",
                config={},
            )
            db.add_all([user, project, workflow])
            db.flush()

            db.add(
                AuditLog(
                    event_type=AuditEventType.STUDIO_PROMPT_POLISH,
                    actor_name=user.name,
                    actor_id=user.id,
                    details={"source_surface": "studio", "creation_mode": "generate"},
                )
            )
            db.add(
                AuditLog(
                    event_type=AuditEventType.STUDIO_PROMPT_POLISH,
                    actor_name=user.name,
                    actor_id=user.id,
                    details={"source_surface": "canvas", "creation_mode": "edit"},
                )
            )

            task = Task(
                title="Polished task",
                status=TaskStatus.pending,
                workflow_id=workflow.id,
                project_id=project.id,
                user_id=user.id,
                requested_provider="test-provider",
                payload={"prompt": "polished prompt"},
                result={},
            )
            db.add(task)
            db.flush()
            record_generation_intent_for_task(
                db,
                task=task,
                workflow_key=workflow.key,
                prompt_polished=True,
            )
            db.commit()

        with SessionLocal() as db:
            stats = get_prompt_polish_usage_stats(db, days=30)
            self.assertEqual(stats["polish_event_count"], 2)
            self.assertEqual(stats["polish_unique_users"], 1)
            self.assertEqual(stats["polish_studio_count"], 1)
            self.assertEqual(stats["polish_canvas_count"], 1)
            self.assertEqual(stats["polished_intent_count"], 1)
            self.assertEqual(stats["polish_adoption_rate"], 1.0)

            overview = get_generation_analytics_overview(db, days=30)
            self.assertEqual(overview["polish_event_count"], 2)
            self.assertEqual(overview["polished_intent_count"], 1)


if __name__ == "__main__":
    unittest.main()
