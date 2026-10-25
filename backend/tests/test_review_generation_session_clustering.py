"""R29: real temporary FK database, no analytics maintenance against user data."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from itertools import permutations
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, delete, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.models import DataClassification, GenerationIntent, GenerationSession, Project, PromptTemplate, Task, TaskStatus, User, Workflow
from app.services import generation_intent_service as intents_service
from app.services import generation_session_service as sessions_service
from app.services.generation_outcome_service import record_generation_outcome


BASE = datetime(2026, 10, 20, tzinfo=timezone.utc)


class GenerationSessionClusteringTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r29-offline-")))
        self.engine = create_engine("sqlite:///" + str(self.root / "analytics.db"))
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (GenerationIntent, GenerationSession):
            include(model.__table__)
        GenerationIntent.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine)
        with self.sessions() as db:
            users = [User(name=f"r29-{i}", role="designer") for i in range(2)]
            projects = [Project(code=f"R29-{i}", name=f"project {i}") for i in range(2)]
            workflow = Workflow(key="image-edit", name="edit", description="fixture", provider_capability="image.edit")
            db.add_all([*users, *projects, workflow])
            db.flush()
            template = PromptTemplate(user_id=users[0].id, label="fixture", title="fixture", prompt="fixture")
            db.add(template)
            db.commit()
            self.users = [user.id for user in users]
            self.projects = [project.id for project in projects]
            self.workflow_id, self.template_id = workflow.id, template.id

    def task(self, minute, *, ref="A", prompt="same", user=0, project=0, provider="fixture", deleted=False, derived_from=None):
        when = BASE + timedelta(minutes=minute)
        with self.sessions() as db:
            payload = {"edit_prompt": prompt, "reference_images": [ref] if ref else []}
            if derived_from is not None:
                payload["source_task_id"] = derived_from
            task = Task(title="synthetic", status=TaskStatus.completed, workflow_id=self.workflow_id,
                        user_id=self.users[user], project_id=self.projects[project], requested_provider=provider,
                        classification=DataClassification.b, payload=payload, result={"asset_storage_path": "synthetic/unused.png"},
                        created_at=when, updated_at=when, deleted_at=when if deleted else None)
            db.add(task)
            db.commit()
            return task.id

    def record(self, *task_ids):
        with self.sessions() as db:
            for task_id in task_ids:
                intents_service.record_generation_intent_for_task(db, task=db.get(Task, task_id), workflow_key="image-edit", template_id=self.template_id)
                intents_service.sync_generation_intent_from_task(db, db.get(Task, task_id))
            db.commit()

    def backfill(self, limit=1000):
        with self.sessions() as db:
            result = intents_service.backfill_generation_intents(db, limit=limit)
            db.commit()
            return result

    def recompute(self):
        with self.sessions() as db:
            result = sessions_service.recompute_all_generation_sessions(db)
            db.commit()
            return result

    def groups(self):
        with self.sessions() as db:
            groups = {}
            for row in db.scalars(select(GenerationIntent).order_by(GenerationIntent.id)):
                self.assertIsNotNone(row.session_id)
                groups.setdefault(row.session_id, []).append(row.task_id)
            sessions = list(db.scalars(select(GenerationSession)))
            self.assertEqual(set(groups), {row.id for row in sessions})
            self.assertEqual(sum(row.submit_count for row in sessions), sum(map(len, groups.values())))
            return {tuple(sorted(ids)): session_id for session_id, ids in groups.items()}

    def assert_members(self, *groups):
        self.assertEqual(set(self.groups()), {tuple(sorted(group)) for group in groups})

    def snapshot(self):
        with self.sessions() as db:
            return {model.__tablename__: [{col.name: deepcopy(getattr(row, col.name)) for col in model.__table__.columns}
                                         for row in db.scalars(select(model).order_by(model.id))]
                    for model in (Task, GenerationIntent, GenerationSession)}

    def clear_analytics(self):
        with self.sessions() as db:
            db.execute(delete(GenerationIntent))
            db.execute(delete(GenerationSession))
            db.commit()

    def test_reverse_backfill_zero_sixty_and_two_days_stays_three_sessions(self):
        ids = [self.task(minute) for minute in (0, 60, 2880)]
        self.assertEqual(self.backfill(), {"created": 3, "skipped": 0, "scanned": 3})
        self.assert_members([ids[0]], [ids[1]], [ids[2]])
        before = self.groups()
        self.recompute()
        self.assertEqual(self.groups(), before)

    def test_interleaved_a_b_a_retains_members_and_scores_during_recompute(self):
        ids = [self.task(0, ref="A"), self.task(5, ref="B"), self.task(10, ref="A")]
        self.record(*ids)
        self.assert_members([ids[0], ids[2]], [ids[1]])
        before = self.groups()
        with self.sessions() as db:
            self.assertEqual(db.get(GenerationSession, before[(ids[0], ids[2])]).gacha_score, 1)
        self.recompute()
        self.assertEqual(self.groups(), before)
        with self.sessions() as db:
            self.assertEqual(db.get(GenerationSession, before[(ids[0], ids[2])]).gacha_score, 1)

    def test_all_submission_orders_and_descending_backfill_match_canonical_members(self):
        ids = [self.task(minute) for minute in (0, 30, 60)]
        distant = self.task(91)
        for order in permutations(ids):
            with self.subTest(order=order):
                self.clear_analytics()
                self.record(distant, *order)
                self.assert_members(ids, [distant])
                before = self.groups()
                self.recompute()
                self.assertEqual(self.groups(), before)
        self.clear_analytics()
        self.backfill()
        self.assert_members(ids, [distant])

    def test_thirty_minutes_is_inclusive_and_chains_use_adjacent_gaps(self):
        ids = [self.task(minute) for minute in (0, 30, 60, 90 + 1 / 60_000_000)]
        self.record(*reversed(ids))
        self.assert_members(ids[:3], ids[3:])
        before = self.groups()
        self.recompute()
        self.assertEqual(self.groups(), before)

    def test_equal_timestamps_use_intent_id_order_for_scores_and_switches(self):
        ids = [self.task(0, prompt=prompt, provider=provider) for prompt, provider in [("a", "x"), ("b", "y"), ("a", "x")]]
        self.record(ids[2], ids[0], ids[1])
        self.assert_members(ids)
        session_id = self.groups()[tuple(ids)]
        for _ in range(2):
            self.recompute()
            with self.sessions() as db:
                session = db.get(GenerationSession, session_id)
                self.assertEqual((session.gacha_score, session.explore_score, session.provider_switch_count), (0.5, 0.5, 1))
                self.assertEqual(session.dominant_prompt_fingerprint, db.scalar(select(GenerationIntent).order_by(GenerationIntent.id)).prompt_fingerprint)

    def test_user_and_ref_keys_are_isolated_while_empty_ref_cross_project_is_shared(self):
        a = self.task(0, ref="", project=0)
        b = self.task(1, ref="", project=1, provider="another")
        c = self.task(2, ref="", user=1)
        d = self.task(3, ref="A")
        self.record(c, b, d, a)
        self.assert_members([a, b], [c], [d])
        before = self.groups()
        self.recompute()
        self.assertEqual(self.groups(), before)
        with self.sessions() as db:
            self.assertEqual(db.get(GenerationSession, before[(a, b)]).project_id, self.projects[0])

    def test_late_bridge_merges_sessions_into_existing_smallest_id_and_moves_loaded_references(self):
        left, right, bridge = [self.task(minute) for minute in (0, 60, 30)]
        self.record(right, left)
        old = self.groups()
        keep, retire = sorted(old.values())
        with self.sessions() as db:
            loaded = list(db.scalars(select(GenerationIntent)))
            for intent in loaded:
                self.assertTrue(intent.session.intents)
            intents_service.record_generation_intent_for_task(db, task=db.get(Task, bridge), workflow_key="image-edit")
            db.commit()
            self.assertTrue(all(intent.session_id == keep and intent.session.id == keep for intent in loaded))
            self.assertIsNone(db.get(GenerationSession, retire))
        self.assertEqual(self.groups(), {tuple(sorted([left, right, bridge])): keep})

    def test_prepend_append_and_isolated_future_do_not_replace_existing_component_ids(self):
        mid, future, early, late = [self.task(minute) for minute in (20, 3000, 0, 40)]
        self.record(mid, future)
        old = self.groups()
        self.record(early, late)
        self.assertEqual(self.groups(), {tuple(sorted([mid, early, late])): old[(mid,)], (future,): old[(future,)]})

    def test_partial_backfill_limit_deleted_tasks_and_repeated_calls_do_not_duplicate_outcomes(self):
        source = self.task(0)
        derived = self.task(1, derived_from=source)
        third = self.task(2)
        deleted = self.task(3, deleted=True)
        self.record(source)
        self.assertEqual(self.backfill(limit=1), {"created": 1, "skipped": 0, "scanned": 1})
        self.assertEqual(self.backfill(), {"created": 1, "skipped": 2, "scanned": 3})
        self.assert_members([source, derived, third])
        self.assertEqual(self.backfill(), {"created": 0, "skipped": 3, "scanned": 3})
        with self.sessions() as db:
            self.assertIsNone(db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == deleted)))
            intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == source))
            self.assertEqual(intent.outcome_signals["upscaled"]["count"], 1)

    def test_repeated_recompute_preserves_ids_tasks_intent_fields_and_outcome_signals(self):
        ids = [self.task(minute, prompt=prompt) for minute, prompt in [(0, "a"), (10, "b"), (90, "c")]]
        self.record(*ids)
        with self.sessions() as db:
            record_generation_outcome(db, task_id=ids[0], outcome_type="bookmarked", asset_id=41)
            record_generation_outcome(db, task_id=ids[1], outcome_type="downloaded", metadata={"fixture": True})
            db.commit()
        before = self.snapshot()
        groups = self.groups()
        for _ in range(2):
            result = self.recompute()
            self.assertEqual(result["intents_processed"], 3)
            self.assertEqual((result["sessions_created"], result["sessions_inserted"], result["sessions_reused"], result["sessions_removed"]), (2, 0, 2, 0))
            self.assertEqual(self.groups(), groups)
            after = self.snapshot()
            self.assertEqual(after["tasks"], before["tasks"])
            self.assertEqual(after["generation_intents"], before["generation_intents"])
            for left, right in zip(before["generation_sessions"], after["generation_sessions"], strict=True):
                self.assertEqual({k: v for k, v in left.items() if k != "computed_at"}, {k: v for k, v in right.items() if k != "computed_at"})

    def test_legacy_oversized_session_splits_chronologically_and_reuses_first_piece_id(self):
        ids = [self.task(minute) for minute in (0, 60, 2880)]
        self.record(*ids)
        with self.sessions() as db:
            rows = list(db.scalars(select(GenerationIntent).order_by(GenerationIntent.id)))
            keep = rows[0].session_id
            for intent in rows:
                intent.session_id = keep
            db.flush()
            db.execute(delete(GenerationSession).where(GenerationSession.id != keep))
            db.commit()
        self.recompute()
        self.assert_members([ids[0]], [ids[1]], [ids[2]])
        self.assertEqual(self.groups()[(ids[0],)], keep)
        before = self.groups()
        self.recompute()
        self.assertEqual(self.groups(), before)

    def test_existing_metrics_formulas_template_status_and_outcome_totals_are_preserved(self):
        ids = [self.task(minute, prompt=prompt, provider=provider) for minute, prompt, provider in [(0, "same", "a"), (1, "same", "b"), (2, "other", "b")]]
        self.record(*ids)
        with self.sessions() as db:
            intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == ids[-1]))
            intent.task_status, intent.has_asset = "failed", False
            record_generation_outcome(db, task_id=ids[0], outcome_type="bookmarked")
            db.commit()
        self.recompute()
        with self.sessions() as db:
            session = db.get(GenerationSession, next(iter(self.groups().values())))
            self.assertEqual((session.submit_count, session.prompt_variant_count, session.gacha_score, session.explore_score), (3, 2, 0.5, 0.5))
            self.assertEqual((session.completed_count, session.failed_count, session.provider_switch_count), (2, 1, 1))
            self.assertEqual(session.dominant_template_id, self.template_id)
            self.assertEqual(session.metrics, {"asset_count": 2, "template_ids": [self.template_id], "source_surfaces": ["studio"],
                                              "settle_count": 1, "settle_score": 0.3333, "outcome_totals": {"bookmarked": 1}})

    def test_online_assignment_does_not_touch_other_key_session_bytes(self):
        other = self.task(0, ref="B")
        one, two = self.task(0), self.task(5)
        self.record(other, one)
        before = self.snapshot()
        other_id = self.groups()[(other,)]
        old = next(row for row in before["generation_sessions"] if row["id"] == other_id)
        self.record(two)
        self.assertEqual(next(row for row in self.snapshot()["generation_sessions"] if row["id"] == other_id), old)

    def test_recompute_metrics_failure_restores_all_memberships_sessions_and_metrics(self):
        ids = [self.task(minute) for minute in (0, 60, 2880)]
        self.record(*ids)
        before = self.snapshot()
        original = sessions_service.recompute_session_metrics
        for mode in ("runtime", "database"):
            calls = 0
            def fail_second(db, session_id):
                nonlocal calls
                calls += 1
                result = original(db, session_id)
                if calls == 2:
                    if mode == "database":
                        db.add(GenerationSession(user_id=999999, ref_fingerprint="", session_started_at=BASE, session_ended_at=BASE))
                        db.flush()  # Real SQLite FK violation inside the maintenance savepoint.
                    raise RuntimeError("synthetic metrics failure")
                return result
            with self.subTest(mode=mode), self.sessions() as db, patch.object(sessions_service, "recompute_session_metrics", side_effect=fail_second):
                with self.assertRaises(IntegrityError if mode == "database" else RuntimeError):
                    sessions_service.recompute_all_generation_sessions(db)
                db.commit()  # Caught exceptions cannot commit partial maintenance.
            self.assertEqual(self.snapshot(), before)

    def test_online_bridge_failure_rolls_back_the_caller_transaction_and_original_sessions(self):
        left, right, bridge = [self.task(minute) for minute in (0, 60, 30)]
        self.record(left, right)
        before = self.snapshot()
        original = sessions_service.recompute_session_metrics
        def fail_metrics(db, session_id):
            original(db, session_id)
            raise RuntimeError("synthetic online bridge failure")
        with self.sessions() as db, patch.object(sessions_service, "recompute_session_metrics", side_effect=fail_metrics):
            with self.assertRaises(RuntimeError):
                intents_service.record_generation_intent_for_task(db, task=db.get(Task, bridge), workflow_key="image-edit")
            db.rollback()  # The new intent was created by the caller before assignment's savepoint.
        self.assertEqual(self.snapshot(), before)

    def test_backfill_failure_rolls_back_new_intents_sessions_and_existing_derived_outcome(self):
        source = self.task(0)
        self.record(source)
        self.task(1, derived_from=source)
        self.task(2)
        before = self.snapshot()
        original = intents_service.record_generation_intent_for_task
        calls = 0
        def fail_second(db, **kwargs):
            nonlocal calls
            calls += 1
            result = original(db, **kwargs)
            if calls == 2:
                raise RuntimeError("synthetic backfill failure")
            return result
        with self.sessions() as db, patch.object(intents_service, "record_generation_intent_for_task", side_effect=fail_second):
            with self.assertRaises(RuntimeError):
                intents_service.backfill_generation_intents(db)
            db.commit()
        self.assertEqual(self.snapshot(), before)

    def test_recompute_never_commits_early_and_caller_commit_failure_can_rollback(self):
        ids = [self.task(minute, ref=ref) for minute, ref in [(0, "A"), (5, "B"), (10, "A")]]
        self.record(*ids)
        before = self.snapshot()
        with self.sessions() as db:
            with patch.object(db, "commit", side_effect=RuntimeError("synthetic outer commit failure")) as commit:
                sessions_service.recompute_all_generation_sessions(db)
                commit.assert_not_called()
                self.assertTrue(db.connection().connection.driver_connection.in_transaction)
                self.assertEqual(self.snapshot(), before)
                with self.assertRaises(RuntimeError):
                    db.commit()
                db.rollback()
        self.assertEqual(self.snapshot(), before)

    def test_online_cross_key_corruption_is_rejected_and_explicit_recompute_repairs_it(self):
        a, b = self.task(0, ref="A"), self.task(1, ref="B")
        self.record(a, b)
        with self.sessions() as db:
            rows = list(db.scalars(select(GenerationIntent).order_by(GenerationIntent.id)))
            rows[1].session_id = rows[0].session_id
            db.commit()
        before = self.snapshot()
        with self.sessions() as db:
            intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == a))
            with self.assertRaises(ValueError):
                sessions_service.assign_intent_to_session(db, intent)
            db.commit()
        self.assertEqual(self.snapshot(), before)
        self.recompute()
        self.assert_members([a], [b])

    def test_session_cleanup_failure_after_reassignment_rolls_back_without_dangling_references(self):
        ids = [self.task(minute) for minute in (0, 10)]
        self.record(*ids)
        with self.sessions() as db:
            old = db.get(GenerationSession, next(iter(self.groups().values())))
            extra = GenerationSession(user_id=old.user_id, project_id=old.project_id, ref_fingerprint=old.ref_fingerprint,
                                      session_started_at=old.session_started_at, session_ended_at=old.session_ended_at)
            db.add(extra)
            db.flush()
            db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == ids[-1])).session_id = extra.id
            db.commit()
        before = self.snapshot()
        def fail_delete(connection, cursor, statement, params, context, executemany):
            if statement.lstrip().upper().startswith("DELETE FROM GENERATION_SESSIONS"):
                raise RuntimeError("synthetic cleanup failure")
        event.listen(self.engine, "before_cursor_execute", fail_delete)
        try:
            with self.sessions() as db:
                with self.assertRaises(RuntimeError):
                    sessions_service.recompute_all_generation_sessions(db)
                db.commit()
        finally:
            event.remove(self.engine, "before_cursor_execute", fail_delete)
        self.assertEqual(self.snapshot(), before)

    def test_shared_pure_clustering_normalizes_utc_and_empty_references(self):
        self.assertEqual(self.recompute(), {"intents_processed": 0, "sessions_created": 0, "sessions_inserted": 0,
                                            "sessions_reused": 0, "sessions_removed": 0})
        with self.sessions() as db:
            db.add(GenerationSession(user_id=self.users[0], ref_fingerprint="", session_started_at=BASE, session_ended_at=BASE))
            db.commit()
        self.assertEqual(self.recompute()["sessions_removed"], 1)
        self.assertEqual(self.groups(), {})
        rows = [SimpleNamespace(id=1, user_id=1, ref_fingerprint=None, submitted_at=BASE),
                SimpleNamespace(id=2, user_id=1, ref_fingerprint="", submitted_at=(BASE + timedelta(minutes=30)).astimezone(timezone(timedelta(hours=8)))),
                SimpleNamespace(id=3, user_id=1, ref_fingerprint="", submitted_at=(BASE + timedelta(minutes=61)).replace(tzinfo=None))]
        groups = sessions_service._cluster_generation_intents(list(reversed(rows)))
        self.assertEqual([[row.id for row in group] for group in groups], [[1, 2], [3]])
        with self.assertRaises(ValueError):
            sessions_service._cluster_generation_intents([SimpleNamespace(id=1, user_id=1, ref_fingerprint="", submitted_at=None)])
