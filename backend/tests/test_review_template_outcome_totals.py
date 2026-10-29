"""R31: template events belong to in-window intents, independently of session caches."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

from sqlalchemy import event, select

from app.models import GenerationIntent, GenerationSession, PromptTemplate, Task
from app.services import generation_analytics_dashboard_service as dashboard
from app.services.generation_intent_service import record_generation_intent_for_task, sync_generation_intent_from_task
from app.services.generation_outcome_service import record_generation_outcome
from tests.test_review_generation_session_clustering import GenerationSessionClusteringTests


WINDOW = datetime(2026, 10, 15, tzinfo=timezone.utc)


class TemplateOutcomeTotalsTests(unittest.TestCase):
    def setUp(self):
        self.fixture = GenerationSessionClusteringTests(methodName="runTest")
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.setUp()
        self.sessions, self.template = self.fixture.sessions, self.fixture.template_id
        self.enterContext(patch.object(dashboard, "_since", return_value=WINDOW))

    def another_template(self):
        with self.sessions() as db:
            template = PromptTemplate(user_id=self.fixture.users[0], label="second", title="Second template", prompt="other")
            db.add(template)
            db.commit()
            return template.id

    def task(self, minute, *, template="default", **kwargs):
        task_id = self.fixture.task(minute, **kwargs)
        with self.sessions() as db:
            task = db.get(Task, task_id)
            record_generation_intent_for_task(db, task=task, workflow_key="image-edit",
                                              template_id=self.template if template == "default" else template)
            sync_generation_intent_from_task(db, task)
            db.commit()
        return task_id

    def signal(self, task_id, kind="downloaded", count=1):
        with self.sessions() as db:
            for _ in range(count):
                record_generation_outcome(db, task_id=task_id, outcome_type=kind, asset_id=41)
            db.commit()

    def query(self, **kwargs):
        with self.sessions() as db:
            return dashboard.get_template_quality_scores(db, **kwargs)

    def rows(self, **kwargs):
        return {row["template_id"]: row for row in self.query(**kwargs)["items"]}

    def snapshot(self):
        result = self.fixture.snapshot()
        with self.sessions() as db:
            result["templates"] = [{c.name: deepcopy(getattr(row, c.name)) for c in PromptTemplate.__table__.columns}
                                   for row in db.scalars(select(PromptTemplate).order_by(PromptTemplate.id))]
        return result

    def test_three_same_template_intents_one_download_is_counted_once(self):
        ids = [self.task(minute) for minute in (0, 1, 2)]
        self.signal(ids[0])
        with self.sessions() as db:
            intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == ids[0]))
            self.assertEqual(intent.outcome_signals["downloaded"]["count"], 1)
            self.assertEqual(db.get(GenerationSession, intent.session_id).metrics["outcome_totals"]["downloaded"], 1)
        row = self.rows()[self.template]
        self.assertEqual((row["intent_count"], row["session_count"], row["outcome_totals"]), (3, 1, {"downloaded": 1}))

    def test_shared_session_mixed_templates_do_not_import_each_others_events(self):
        other = self.another_template()
        ids = [self.task(0), self.task(1), self.task(2, template=other)]
        self.signal(ids[0])
        self.signal(ids[-1], "bookmarked")
        rows = self.rows()
        self.assertEqual(rows[self.template]["outcome_totals"], {"downloaded": 1})
        self.assertEqual(rows[other]["outcome_totals"], {"bookmarked": 1})
        self.assertEqual((rows[self.template]["session_count"], rows[other]["session_count"]), (1, 1))

    def test_repeated_legal_events_on_one_intent_keep_the_actual_count(self):
        task_id, sibling = self.task(0), self.task(1)
        self.signal(task_id, count=3)
        self.signal(sibling, "bookmarked", count=2)
        row = self.rows()[self.template]
        self.assertEqual(row["outcome_totals"], {"downloaded": 3, "bookmarked": 2})
        self.assertEqual(row["settled_intent_count"], 2)
        with self.sessions() as db:
            intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == task_id))
            self.assertEqual(intent.outcome_signals["downloaded"]["asset_ids"], [41])

    def test_multiple_sessions_sum_owned_events_and_exclude_untemplated_intents(self):
        a, b, c, other = self.task(0), self.task(1), self.task(60), self.task(2, template=None)
        self.signal(a, count=2)
        self.signal(c, count=3)
        self.signal(other, count=20)
        row = self.rows()[self.template]
        self.assertEqual((row["intent_count"], row["session_count"]), (3, 2))
        self.assertEqual(row["outcome_totals"], {"downloaded": 5})

    def test_window_boundary_and_tracking_rollout_exclude_outside_intent_events(self):
        at = self.task(-7200)
        outside = self.task(-7200 - 1 / 60_000_000)
        self.signal(at)
        self.signal(outside, count=7)
        row = self.rows()[self.template]
        self.assertEqual((row["intent_count"], row["outcome_totals"]), (1, {"downloaded": 1}))
        # Even a requested longer lookback remains clipped at the existing rollout.
        with patch.object(dashboard, "_since", return_value=datetime(2026, 1, 1, tzinfo=timezone.utc)):
            with self.sessions() as db:
                intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == outside))
                intent.submitted_at = dashboard.GENERATION_ANALYTICS_TRACKING_SINCE - timedelta(microseconds=1)
                db.commit()
            row = self.rows(days=365)[self.template]
            self.assertEqual((row["intent_count"], row["outcome_totals"]), (1, {"downloaded": 1}))

    def test_intent_without_session_still_contributes_its_events(self):
        task_id = self.task(0)
        self.signal(task_id, count=3)
        with self.sessions() as db:
            db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == task_id)).session_id = None
            db.commit()
        row = self.rows()[self.template]
        self.assertEqual((row["intent_count"], row["session_count"], row["outcome_totals"]), (1, 0, {"downloaded": 3}))
        self.assertEqual((row["avg_gacha_score"], row["avg_settle_score"], row["completion_rate"], row["quality_score"]), (0, 0, 0, 0.1))

    def test_session_weighted_scores_and_rates_remain_the_existing_contract(self):
        ids = [self.task(minute) for minute in (0, 1, 2, 60)]
        self.signal(ids[0], "bookmarked")
        self.signal(ids[-1])
        with self.sessions() as db:
            task = db.get(Task, ids[-1])
            task.status = type(task.status).failed
            sync_generation_intent_from_task(db, task)
            db.commit()
        row = self.rows()[self.template]
        self.assertEqual((row["intent_count"], row["session_count"], row["settled_intent_count"]), (4, 2, 2))
        self.assertEqual((row["avg_gacha_score"], row["avg_explore_score"], row["avg_settle_score"], row["completion_rate"], row["quality_score"]),
                         (0.75, 0, 0.5, 0.75, 0.675))
        self.assertEqual(row["outcome_totals"], {"bookmarked": 1, "downloaded": 1})

    def test_template_aggregation_is_read_only_and_does_not_use_stale_session_event_cache(self):
        task_id = self.task(0)
        self.task(1)
        self.signal(task_id)
        with self.sessions() as db:
            session = db.scalar(select(GenerationSession))
            session.metrics = {**session.metrics, "outcome_totals": {"downloaded": 999}}
            db.commit()
        before = self.snapshot()
        sql = []
        def capture(connection, cursor, statement, params, context, executemany):
            sql.append(statement.lstrip().split(None, 1)[0].upper())
        event.listen(self.fixture.engine, "before_cursor_execute", capture)
        try:
            self.assertEqual(self.rows()[self.template]["outcome_totals"], {"downloaded": 1})
        finally:
            event.remove(self.fixture.engine, "before_cursor_execute", capture)
        self.assertTrue(sql)
        self.assertTrue(all(verb == "SELECT" for verb in sql), sql)
        self.assertEqual(self.snapshot(), before)

    def test_threshold_sort_metadata_and_response_shape_remain_unchanged(self):
        other = self.another_template()
        self.task(0)
        self.task(1)
        self.task(2, template=other, ref="B")
        response = self.query(days=7)
        self.assertEqual(set(response), {"window_days", "items"})
        self.assertEqual(response["window_days"], 7)
        self.assertEqual([row["template_id"] for row in response["items"]], [self.template, other])
        row = self.rows(min_intents=2)[self.template]
        self.assertEqual((row["label"], row["title"], row["category"], row["outcome_totals"]), ("fixture", "fixture", "", {}))
        self.assertEqual(len(self.query(min_intents=2)["items"]), 1)
        self.assertEqual(self.query(min_intents=3)["items"], [])
        self.assertEqual(set(row), {"template_id", "label", "title", "category", "intent_count", "session_count", "settled_intent_count",
                                   "avg_gacha_score", "avg_explore_score", "avg_settle_score", "completion_rate", "quality_score", "outcome_totals"})

    def test_submission_and_settled_metadata_are_not_events_and_empty_signals_stay_empty(self):
        task_id, empty = self.task(0), self.task(1)
        with self.sessions() as db:
            intent = db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == task_id))
            intent.outcome_signals = {"settled": True, "submission": {"count": 20, "prompt_polished": True},
                                      "downloaded": {"count": 2}, "legacy_note": "not an event", "bookmarked": None}
            db.scalar(select(GenerationIntent).where(GenerationIntent.task_id == empty)).outcome_signals = {}
            db.commit()
        row = self.rows()[self.template]
        self.assertEqual((row["outcome_totals"], row["settled_intent_count"]), ({"downloaded": 2}, 1))
