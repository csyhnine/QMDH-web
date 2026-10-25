"""R17: explicit memory preservation and reviewed legacy cleanup, offline only."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import ModuleType
import unittest
from unittest.mock import Mock, patch

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.models import AgentMemoryEntry, User
from app.services import agent_memory_service as memory
from tests.test_review_partial_image_progress import load


class LegacyMemoryScrubTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r17-offline-")))
        self.engine = create_engine("sqlite:///" + str(self.root / "memories.db"))
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"))
        tables = set()

        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)

        include(AgentMemoryEntry.__table__)
        AgentMemoryEntry.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        users = [User(name="r17-one"), User(name="r17-two")]
        self.db.add_all(users)
        self.db.commit()
        self.user_id, self.other_id = [user.id for user in users]
        self.index = ModuleType("app.integrations.search.agent_memory_index")
        self.index.index_agent_memory_entry = Mock()
        self.index.delete_agent_memory_entry = Mock()
        self.enterContext(patch.dict(sys.modules, {self.index.__name__: self.index}))

    def add(self, *, content="改成红色", kind="feedback", ref="conv:1:feedback", paused=False, user=None):
        row = AgentMemoryEntry(user_id=self.user_id if user is None else user, memory_type=kind, content=content, source_turn_ref=ref, is_paused=paused, created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
        self.db.add(row)
        self.db.commit()
        return row.id

    def rows(self):
        with self.sessions() as db:
            return [{col.name: getattr(row, col.name) for col in AgentMemoryEntry.__table__.columns} for row in db.scalars(select(AgentMemoryEntry).order_by(AgentMemoryEntry.id))]

    def preview(self, **kwargs):
        return memory.scrub_legacy_agent_memories(self.db, user_id=self.user_id, **kwargs)

    def approve(self, *ids):
        preview = self.preview()
        entries = [dict(candidate, legacy_evidence="synthetic fixture: verified old raw-extract batch v1, source rows retained in test") for candidate in preview.review_candidates if not ids or candidate["id"] in ids]
        return {"version": 1, "entries": entries}

    def apply(self, plan):
        return self.preview(dry_run=False, approved_plan=plan)

    def assert_no_index(self):
        self.index.index_agent_memory_entry.assert_not_called()
        self.index.delete_agent_memory_entry.assert_not_called()

    def test_all_explicit_tool_long_term_types_keep_original_text_without_keyword_reclassification(self):
        for type_index, kind in enumerate(sorted(memory.LONG_TERM_TYPES)):
            for index, text in enumerate(["amber cadence", "neutral English sentence", "蓝灰"]):
                result = memory.tool_memory_store(self.db, user_id=self.user_id, content=f"{text} {type_index}-{index}", memory_type=kind)
                self.assertTrue(result["ok"])
                self.assertEqual(result["memory_type"], kind)
        self.db.commit()
        self.index.index_agent_memory_entry.reset_mock()
        before = self.rows()
        stats = self.preview()
        self.assertEqual((stats.deleted_noise_durable, stats.distilled_durable), (0, 0))
        self.assertEqual(self.rows(), before)
        self.assert_no_index()
        self.apply({"version": 1, "entries": []})
        self.db.commit()
        self.assertEqual(self.rows(), before)
        self.assert_no_index()

    def test_manual_hitl_confirmed_and_oversized_explicit_rows_are_protected_before_all_types(self):
        for ref in ["manual", "manual_store", "manual:editor", "manual_note", "tool:memory_store", "conv:1:hitl:7"]:
            for kind in ["preference", "feedback", "thought", "experience", "fact", "summary"]:
                self.add(kind=kind, ref=ref, content="蓝灰。" * 100)
        self.add(kind="experience", ref="", content="用户已确认这个项目采用庭院布局")
        before = self.rows()
        stats = self.preview()
        self.assertEqual((stats.deleted_turn_summaries, stats.deleted_noise_durable, stats.distilled_durable), (0, 0, 0))
        self.assertEqual(self.rows(), before)
        self.assertEqual(stats.review_candidates, ())
        entries = [{"id": row["id"], "user_id": row["user_id"], "fingerprint": memory._legacy_memory_fingerprint(row), "result_fingerprint": None, "legacy_evidence": "synthetic accidental explicit-row selection"} for row in before]
        self.apply({"version": 1, "entries": entries})
        self.db.commit()
        self.assertEqual(self.rows(), before)
        self.assert_no_index()

    def test_paused_and_out_of_user_scope_rows_are_kept_even_with_approval(self):
        paused = self.add(paused=True)
        other = self.add(user=self.other_id)
        before = self.rows()
        stats = self.preview()
        self.assertEqual(stats.scanned, 1)
        self.assertEqual(stats.review_candidates, ())
        row = self.db.get(AgentMemoryEntry, paused)
        plan = {"version": 1, "entries": [{"id": paused, "user_id": self.user_id, "fingerprint": memory._legacy_memory_fingerprint(row), "result_fingerprint": None, "legacy_evidence": "fixture old batch"}]}
        self.apply(plan)
        self.db.commit()
        self.assertEqual(self.rows(), before)
        with self.assertRaises(ValueError):
            self.apply({"version": 1, "entries": [dict(plan["entries"][0], id=other, user_id=self.other_id)]})
        self.assert_no_index()

    def test_unbounded_dry_run_only_previews_unknown_period_and_never_autoflushes(self):
        self.add()
        self.add(ref="", kind="thought", content="amber cadence")
        before = self.rows()
        pending = AgentMemoryEntry(user_id=self.user_id, memory_type="feedback", source_turn_ref="manual", content="pending unrelated")
        self.db.add(pending)
        stats = self.preview()
        self.assertEqual(stats.review_required, 2)
        self.assertEqual(len(stats.review_candidates), 2)
        self.assertEqual(stats.deleted_noise_durable, 0)
        self.assertIsNone(pending.id)
        self.assertEqual(self.rows(), before)
        self.assert_no_index()
        with self.assertRaises(ValueError):
            self.apply({"version": 1, "entries": []})
        self.assertIsNone(pending.id)
        self.assertIn(pending, self.db.new)
        self.db.rollback()

    def test_apply_requires_reviewed_versioned_plan_and_rejects_invalid_inputs_before_changes(self):
        self.add()
        before = self.rows()
        plan = self.approve()
        invalid = [None, {}, {"version": 2, "entries": []}, {"version": True, "entries": []}, {"version": 1, "entries": "bad"},
                   {"version": 1, "entries": [dict(plan["entries"][0], legacy_evidence=" ")]},
                   {"version": 1, "entries": [dict(plan["entries"][0], fingerprint="bad")]},
                   {"version": 1, "entries": [dict(plan["entries"][0], result_fingerprint="0" * 64)]},
                   {"version": 1, "entries": [{key: value for key, value in plan["entries"][0].items() if key != "result_fingerprint"}]},
                   {"version": 1, "entries": [plan["entries"][0], plan["entries"][0]]}]
        for candidate in invalid:
            with self.subTest(plan=candidate), self.assertRaises(ValueError):
                self.apply(candidate)
            self.assertEqual(self.rows(), before)
        self.assert_no_index()

    def test_approved_legacy_noise_distillation_and_session_compaction_keep_old_rules(self):
        summary = self.add(kind="summary", ref="conv:1:chat", content="用户：帮我写口号；助手：好的")
        noise = self.add()
        preference = self.add(kind="preference", ref="conv:1:preference", content="请记住以后默认用 16:9，谢谢")
        short_fact = self.add(kind="fact", ref="conv:1:fact", content="OK")
        long_fact = self.add(kind="fact", ref="conv:1:fact", content="neutral durable statement " * 20)
        session = self.add(kind="summary", ref="conv:1:session_summary", content="\n".join(f"[chat] 用户:条件{i} | 助手:回复{i}" for i in range(12)))
        plan = self.approve()
        before = self.rows()
        dry = self.preview(approved_plan=plan)
        self.assertEqual((dry.deleted_turn_summaries, dry.deleted_noise_durable, dry.distilled_durable, dry.compacted_sessions), (1, 2, 2, 1))
        self.assertEqual(self.rows(), before)
        applied = self.apply(plan)
        self.assert_no_index()
        self.db.commit()
        remaining = {row["id"]: row for row in self.rows()}
        self.assertNotIn(summary, remaining)
        self.assertNotIn(noise, remaining)
        self.assertNotIn(short_fact, remaining)
        self.assertLessEqual(len(remaining[long_fact]["content"]), memory.DURABLE_FACT_MAX_CHARS)
        self.assertNotIn("记住", remaining[preference]["content"])
        self.assertIn("16:9", remaining[preference]["content"])
        self.assertNotEqual(remaining[session]["content"], before[-1]["content"])
        self.assertEqual(len(applied.index_updates), 3)
        self.assertEqual(set(applied.index_deletes), {summary, noise, short_fact})
        self.assert_no_index()

    def test_unknown_sources_are_preview_only_and_cannot_be_promoted_by_plan_text(self):
        for ref in ["", "import:unknown", "conv:1:unrecognized", "old_auto_without_version"]:
            self.add(ref=ref)
        before = self.rows()
        preview = self.preview()
        self.assertEqual(preview.review_required, 4)
        self.assertTrue(all(not row["eligible_source"] for row in preview.review_candidates))
        with self.assertRaises(ValueError):
            self.apply(self.approve())
        self.assertEqual(self.rows(), before)
        self.assert_no_index()

    def test_stale_fingerprint_user_change_and_guarded_write_conflict_rollback_all_actions(self):
        first = self.add()
        second = self.add(kind="preference", ref="conv:1:preference", content="请记住以后默认用 16:9，谢谢")
        plan = self.approve()
        self.db.get(AgentMemoryEntry, second).content = "concurrently revised"
        self.db.commit()
        before = self.rows()
        with self.assertRaises(ValueError):
            self.apply(plan)
        self.assertEqual(self.rows(), before)
        self.db.get(AgentMemoryEntry, second).user_id = self.other_id
        self.db.commit()
        owner_changed = self.rows()
        with self.assertRaises(ValueError):
            self.apply(plan)
        self.assertEqual(self.rows(), owner_changed)
        self.db.get(AgentMemoryEntry, second).user_id = self.user_id
        self.db.commit()
        # Make a new matching plan, then interleave a real second-session change after reads.
        plan = self.approve()
        fired = []
        def interleave(connection, clause, multiparams, params, options):
            if getattr(clause, "is_delete", False) and not fired:
                fired.append(True)
                with self.sessions() as other:
                    other.get(AgentMemoryEntry, second).is_paused = True
                    other.commit()
        event.listen(self.engine, "before_execute", interleave)
        try:
            with self.assertRaises(ValueError):
                self.apply(plan)
        finally:
            event.remove(self.engine, "before_execute", interleave)
        self.assertEqual(self.rows()[1]["is_paused"], True)
        self.assertEqual(self.rows()[0]["id"], first)
        self.assertEqual(len(self.rows()), 2)
        self.assert_no_index()

    def test_repeated_apply_is_idempotent_for_deleted_and_distilled_rows(self):
        self.add()
        self.add(kind="preference", ref="conv:1:preference", content="请记住以后默认用 16:9，谢谢")
        plan = self.approve()
        self.apply(plan)
        self.db.commit()
        before = self.rows()
        repeated = self.apply(plan)
        self.db.commit()
        self.assertEqual(self.rows(), before)
        self.assertEqual((repeated.deleted_noise_durable, repeated.distilled_durable), (0, 0))
        self.assert_no_index()

    def test_rollback_and_commit_failure_never_publish_uncommitted_index_changes(self):
        self.add()
        before = self.rows()
        self.apply(self.approve())
        self.db.rollback()
        self.assertEqual(self.rows(), before)
        self.assert_no_index()
        plan = self.approve()
        with patch.object(self.db, "flush", side_effect=RuntimeError("synthetic flush failure")):
            with self.assertRaises(RuntimeError):
                self.apply(plan)
        self.assertEqual(self.rows(), before)
        self.assert_no_index()
        self.apply(self.approve())
        with patch.object(self.db, "commit", side_effect=RuntimeError("synthetic commit failure")):
            with self.assertRaises(RuntimeError):
                self.db.commit()
        self.db.rollback()
        self.assertEqual(self.rows(), before)
        self.assert_no_index()

    def test_post_commit_index_sync_uses_snapshots_and_reports_failures_without_db_rollback(self):
        deleted = self.add()
        kept = self.add(kind="preference", ref="conv:1:preference", content="请记住以后默认用 16:9，谢谢")
        stats = self.apply(self.approve())
        self.db.commit()
        before = self.rows()
        self.index.delete_agent_memory_entry.side_effect = RuntimeError("synthetic index failure")
        result = memory.sync_legacy_agent_memory_index(stats)
        self.assertEqual(result["failed_ids"], [deleted])
        self.assertEqual(self.rows(), before)
        snapshot = self.index.index_agent_memory_entry.call_args.args[0]
        self.assertEqual(snapshot.id, kept)
        self.assertIn("16:9", snapshot.content)
        self.index.delete_agent_memory_entry.side_effect = None
        self.assertEqual(memory.sync_legacy_agent_memory_index(stats)["failed_ids"], [])
        self.assertEqual(self.rows(), before)

    def test_cli_requires_plan_and_round_trips_preview_then_syncs_only_after_successful_commit(self):
        from contextlib import redirect_stdout
        import io
        # app.scripts is startup-blocked by V00; execute only current main's source AST.
        cli = ModuleType("r17_fixture_cli")
        cli.__dict__.update(argparse=argparse, json=json, Path=Path, SessionLocal=self.sessions,
                            scrub_legacy_agent_memories=memory.scrub_legacy_agent_memories,
                            sync_legacy_agent_memory_index=memory.sync_legacy_agent_memory_index)
        load("app/scripts/scrub_agent_memory_legacy.py", cli.__dict__, functions=["main"])
        self.add()
        output = io.StringIO()
        # The current CLI main uses only the temporary Session factory in this namespace.
        with patch.object(cli, "SessionLocal", self.sessions), patch.object(sys, "argv", ["scrub", "--dry-run", "--user-id", str(self.user_id)]), redirect_stdout(output):
            self.assertEqual(cli.main(), 0)
        payload = json.loads(output.getvalue())
        plan = payload["plan"]
        self.assertEqual(plan["entries"][0]["legacy_evidence"], "")
        self.assert_no_index()
        with patch.object(cli, "SessionLocal", Mock(side_effect=AssertionError("must fail before DB"))), patch.object(sys, "argv", ["scrub", "--apply"]):
            with self.assertRaises(SystemExit) as raised:
                cli.main()
            self.assertEqual(raised.exception.code, 2)
        plan["entries"][0]["legacy_evidence"] = "synthetic old fixture scope confirmed"
        path = self.root / "approved-plan.json"
        path.write_text(json.dumps(plan), encoding="utf-8")
        def failing_session():
            session = self.sessions()
            session.commit = Mock(side_effect=RuntimeError("synthetic CLI commit failure"))
            return session
        before = self.rows()
        with patch.object(cli, "SessionLocal", failing_session), patch.object(cli, "sync_legacy_agent_memory_index", Mock()) as sync, patch.object(sys, "argv", ["scrub", "--apply", "--plan", str(path)]):
            with self.assertRaises(RuntimeError):
                cli.main()
            sync.assert_not_called()
        self.assertEqual(self.rows(), before)
        self.assert_no_index()
        self.index.delete_agent_memory_entry.side_effect = lambda _: self.assertEqual(self.rows(), [])
        with patch.object(cli, "SessionLocal", self.sessions), patch.object(sys, "argv", ["scrub", "--apply", "--user-id", str(self.user_id), "--plan", str(path)]), redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(), 0)
        self.assertEqual(self.rows(), [])
        self.index.delete_agent_memory_entry.assert_called_once()
