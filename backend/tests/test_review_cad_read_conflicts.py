"""R37: selected real endpoints, temporary FK SQLite and synthetic 8x8 media."""
import ast
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import HTTPException, Query
from PIL import Image

from app.models import CadExtract, User
from app.schemas import CadPreparationIn, CadProgramReviewIn
from app.services import media_storage as media
from app.services.cad import room_edit as rooms
from app.services.cad.fitout import write_floor_fitout
from tests import test_review_cad_edit_preservation as previous
from tests.test_review_agent_dispatch import load_functions


class CadReadConflictTests(unittest.TestCase):
    def setUp(self):
        self.f = previous.CadEditPreservationTests(methodName="runTest")
        self.addCleanup(self.f.doCleanups)
        self.f.setUp()
        self.auth = SimpleNamespace(user_id=self.f.user_id)
        self.ns = dict(self.f.ns, Query=Query, ensure_line_layers=rooms.ensure_line_layers,
                       save_program_review=rooms.save_program_review, write_floor_fitout=write_floor_fitout)
        names = ["get_cad_extract", "list_cad_extracts", "save_cad_program_review", "prepare_cad_fitout",
                 "generate_cad_fitout", "_to_cad_extract_out"]
        source = (Path(__file__).parents[1] / "app/routers/cad.py").read_text(encoding="utf-8")
        names += [n.name for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)
                  and n.name in {"_persist_line_layers", "_cad_read_out"}]
        load_functions("app/routers/cad.py", names, self.ns)

    def legacy(self, *, floors=1, missing_file=False):
        self.f.seed(floors=floors)
        with self.f.sessions() as db:
            row = db.get(CadExtract, self.f.record_id)
            payload = deepcopy(row.payload_json)
            for floor in payload["spaces"]["floors"]:
                if missing_file:
                    media.get_local_storage()._resolved_file(floor["line_file"]).unlink()
                floor.pop("line_file")
                floor.pop("line_path")
            row.payload_json = payload
            db.commit()
        return self.f.payload()

    def read(self, kind="detail", *, db=None):
        def invoke(session):
            if kind == "detail":
                return self.ns["get_cad_extract"](self.f.extract_id, session, self.auth)
            return self.ns["list_cad_extracts"](session, self.auth, 20)
        if db is not None:
            return invoke(db)
        with self.f.sessions() as session:
            return invoke(session)

    def preparation(self):
        return CadPreparationIn(floor_index=1,
            calibration={"points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}], "meters": 1},
            room_kinds={"f1_r1": "empty"},
            routes=[{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}], "width_m": 1}])

    def write(self, kind, *, db=None):
        def invoke(session):
            if kind == "review":
                return self.ns["save_cad_program_review"](self.f.extract_id,
                    CadProgramReviewIn(notes={"f1_r1": "saved review"}), session, self.auth)
            if kind == "prepare":
                return self.ns["prepare_cad_fitout"](self.f.extract_id, self.preparation(), session, self.auth)
            return self.ns["generate_cad_fitout"](self.f.extract_id, 1, kind == "clear", session, self.auth)
        if db is not None:
            return invoke(db)
        with self.f.sessions() as session:
            return invoke(session)

    def interleave_read(self, kind, writer):
        saved = []
        actual = rooms.ensure_line_layers
        def ensure(payload):
            changed = actual(payload)
            if not saved:
                saved.append(None)  # Guard nested preparation/fitout compatibility calls.
                writer()
                saved[0] = self.f.payload()
            return changed
        with patch.dict(self.ns, ensure_line_layers=ensure):
            result = self.read(kind)
        self.assertIsNotNone(saved[0])
        self.assertEqual(self.f.payload(), saved[0])
        return result, saved[0]

    def test_detail_compatibility_read_cannot_overwrite_successful_rename(self):
        self.legacy()
        self.interleave_read("detail", lambda: self.f.edit(proposal="saved rename"))

    def test_list_compatibility_read_cannot_overwrite_successful_rename(self):
        self.legacy()
        self.interleave_read("list", lambda: self.f.edit(proposal="saved rename"))

    def test_complete_and_legacy_metadata_reads_only_change_response_copies(self):
        for legacy in (False, True):
            with self.subTest(legacy=legacy):
                before = self.legacy() if legacy else self.f.seed()
                files = self.f.files()
                for kind in ("detail", "list", "detail", "list"):
                    with self.f.sessions() as db, patch.object(db, "commit") as commit, patch.object(db, "flush") as flush:
                        result = self.read(kind, db=db)
                        self.assertFalse(db.dirty)
                        commit.assert_not_called()
                        flush.assert_not_called()
                    value = result if kind == "detail" else result[0]
                    floor = value.data["spaces"]["floors"][0]
                    self.assertTrue(floor["line_file"])
                    self.assertEqual(floor["line_path"], "/media/" + floor["line_file"])
                    self.assertEqual(self.f.payload(), before)
                    self.assertEqual(self.f.files(), files)

    def test_explicit_existing_line_identity_and_wall_pixels_are_preserved(self):
        self.f.seed()
        key = "cad/explicit-wall.png"
        wall = self.f.png(Image.new("RGBA", (8, 8), (8, 9, 10, 255)))
        media.write_binary_asset(key, wall)
        with self.f.sessions() as db:
            row = db.get(CadExtract, self.f.record_id)
            payload = deepcopy(row.payload_json)
            payload["spaces"]["floors"][0].update(line_file="/media/" + key, line_path="stale")
            row.payload_json = payload
            db.commit()
        before, files = self.f.payload(), self.f.files()
        floor = self.read().data["spaces"]["floors"][0]
        self.assertEqual(floor["line_file"], key)
        self.assertEqual(floor["line_path"], "/media/" + key)
        self.assertEqual(media.read_binary_asset(key), wall)
        self.assertEqual(self.f.payload(), before)
        self.assertEqual(self.f.files(), files)

    def test_missing_line_create_race_keeps_winning_wall_and_never_overwrites(self):
        before = self.legacy(missing_file=True)
        original = self.f.files()
        key = rooms._line_relative(before["spaces"]["floors"][0]["mask_file"])
        winner = self.f.png(Image.new("RGBA", (8, 8), (31, 41, 59, 255)))
        actual = media.write_binary_asset
        def racing_write(path, content, *, overwrite=True):
            self.assertEqual(path, key)
            self.assertFalse(overwrite)
            actual(path, winner, overwrite=False)
            return actual(path, content, overwrite=overwrite)
        with patch.object(rooms, "write_binary_asset", side_effect=racing_write) as write:
            response = self.read()
            self.read("list")
        self.assertEqual(write.call_count, 1)
        self.assertEqual(response.data["spaces"]["floors"][0]["line_file"], key)
        self.assertEqual(media.read_binary_asset(key), winner)
        self.assertEqual(self.f.payload(), before)
        self.f.originals_unchanged(original)

    def test_missing_preview_skips_and_other_cache_errors_never_commit_json(self):
        for failure in ("missing", "read", "write"):
            with self.subTest(failure=failure):
                before = self.legacy(missing_file=True)
                floor = before["spaces"]["floors"][0]
                if failure == "missing":
                    media.get_local_storage()._resolved_file(rooms._preview_relative(floor["mask_file"])).unlink()
                files = self.f.files()
                if failure == "missing":
                    self.read()
                else:
                    target = "read_binary_asset" if failure == "read" else "write_binary_asset"
                    with patch.object(rooms, target, side_effect=OSError("synthetic cache I/O")):
                        with self.assertRaises(OSError):
                            self.read("list")
                self.assertEqual(self.f.payload(), before)
                self.assertEqual(self.f.files(), files)

    def test_both_reads_preserve_interleaved_paint_review_preparation_and_fitout(self):
        for kind in ("detail", "list"):
            for action in ("paint", "review", "prepare", "fitout"):
                with self.subTest(read=kind, action=action):
                    self.legacy()
                    if action == "fitout":
                        self.write("prepare")
                        # Force response compatibility work without changing calibration state.
                        with self.f.sessions() as db:
                            row = db.get(CadExtract, self.f.record_id)
                            value = deepcopy(row.payload_json)
                            value["spaces"]["floors"][0].pop("line_path", None)
                            row.payload_json = value
                            db.commit()
                    writer = (lambda: self.f.edit("paint", strokes=previous.STROKES)) if action == "paint" else (lambda: self.write(action))
                    self.interleave_read(kind, writer)

    def test_gets_do_not_autoflush_or_commit_caller_pending_objects(self):
        self.legacy()
        for kind in ("detail", "list"):
            with self.subTest(read=kind), self.f.sessions() as db:
                db.autoflush = True
                pending = User(name="pending ordinary user", role="designer")
                db.add(pending)
                with patch.object(db, "commit") as commit, patch.object(db, "flush", wraps=db.flush) as flush:
                    self.read(kind, db=db)
                    commit.assert_not_called()
                    flush.assert_not_called()
                self.assertIsNone(pending.id)
                self.assertIn(pending, db.new)

    def test_three_json_writers_reject_changes_during_computation_and_keep_winner(self):
        actual = self.ns["commit_cad_edit"]
        for kind in ("review", "prepare", "clear"):
            with self.subTest(writer=kind):
                self.f.seed()
                saved = []
                def racing_commit(db, row, token, updated):
                    self.f.edit(proposal="concurrent winner")
                    saved.append(self.f.payload())
                    return actual(db, row, token, updated)
                with patch.dict(self.ns, commit_cad_edit=racing_commit):
                    with self.assertRaises(HTTPException) as caught:
                        self.write(kind)
                self.assertEqual(caught.exception.status_code, 409)
                self.assertEqual(self.f.payload(), saved[0])
                self.f.assert_references()

    def test_three_json_writer_flush_and_commit_failures_rollback_and_retry(self):
        for kind in ("review", "prepare", "clear"):
            for failure in ("flush", "commit"):
                with self.subTest(writer=kind, failure=failure):
                    before = self.f.seed()
                    files = self.f.files()
                    with self.f.sessions() as db, patch.object(db, failure, side_effect=RuntimeError("synthetic SQL failure")):
                        with self.assertRaises(RuntimeError):
                            self.write(kind, db=db)
                        self.assertFalse(db.in_transaction())
                    self.assertEqual(self.f.payload(), before)
                    self.assertEqual(self.f.files(), files)
                    self.write(kind)
                    self.assertNotEqual(self.f.payload(), before)

    def test_initial_stale_room_or_program_snapshot_conflicts_before_staging(self):
        for action, floor in (("room", 1), ("room", 2), ("program", 2)):
            with self.subTest(action=action, floor=floor):
                self.f.seed(floors=2)
                with self.f.sessions() as db:
                    stale = db.get(CadExtract, self.f.record_id)
                    self.f.edit(proposal="winner")
                    saved, files = self.f.payload(), self.f.files()
                    self.assertNotEqual(stale.payload_json, saved)
                    with self.assertRaises(HTTPException) as caught:
                        if action == "room":
                            self.f.edit(db=db, floor_index=floor, room_id=f"f{floor}_r1", proposal="loser")
                        else:
                            self.f.program([(floor, "loser")], db=db)
                    self.assertEqual(caught.exception.status_code, 409)
                    self.assertEqual(self.f.payload(), saved)
                    self.assertEqual(self.f.files(), files)

    def test_initial_stale_review_preparation_and_fitout_snapshots_conflict(self):
        for kind in ("review", "prepare", "clear"):
            with self.subTest(writer=kind):
                self.f.seed()
                with self.f.sessions() as db:
                    stale = db.get(CadExtract, self.f.record_id)
                    self.f.edit(proposal="new winner")
                    saved, files = self.f.payload(), self.f.files()
                    self.assertNotEqual(stale.payload_json, saved)
                    with self.assertRaises(HTTPException) as caught:
                        self.write(kind, db=db)
                    self.assertEqual(caught.exception.status_code, 409)
                    self.assertEqual(self.f.payload(), saved)
                    self.assertEqual(self.f.files(), files)

    def test_legacy_calibration_and_actual_empty_room_layout_work_without_prior_get(self):
        before = self.legacy(missing_file=True)
        response = self.write("prepare")
        floor = response.data["spaces"]["floors"][0]
        self.assertTrue(floor["preparation"]["current"])
        self.assertEqual(floor["rooms"][0]["layout_kind"], "empty")
        self.assertTrue(media.get_local_storage().exists(floor["line_file"]))
        laid_out = self.write("fitout").data
        self.assertEqual(len(laid_out["spaces"]["fitout"]["floors"]), 1)
        self.assertEqual(laid_out["untouched"], before["untouched"])
        self.assertEqual(laid_out["spaces"]["floors"][0]["mask_file"], before["spaces"]["floors"][0]["mask_file"])
        self.assertEqual(self.write("clear").data["spaces"]["fitout"]["floors"], [])

    def test_sequential_review_calibration_and_layout_keep_prior_saved_fields(self):
        self.f.seed(floors=2)
        other = self.f.payload()["spaces"]["floors"][1]
        self.f.edit(proposal="prior rename")
        self.write("review")
        self.write("prepare")
        saved = self.f.payload()
        self.write("fitout")
        self.read("list")
        final = self.f.payload()
        self.assertEqual(final["spaces"]["program_review"], saved["spaces"]["program_review"])
        self.assertEqual(final["spaces"]["floors"][0], saved["spaces"]["floors"][0])
        self.assertEqual(final["spaces"]["floors"][1], other)
        self.assertEqual(final["spaces"]["floors"][0]["undo_count"], 1)

    def test_same_or_different_floor_cas_conflict_retry_keeps_both_edits_and_one_undo(self):
        actual = self.f.ns["commit_cad_edit"]
        for second_floor in (1, 2):
            with self.subTest(second_floor=second_floor):
                self.f.seed(floors=2)
                def race(db, record, token, updated):
                    with patch.dict(self.f.ns, commit_cad_edit=actual):
                        self.f.edit(proposal="winner")
                    return actual(db, record, token, updated)
                with patch.dict(self.f.ns, commit_cad_edit=race):
                    with self.assertRaises(HTTPException) as caught:
                        self.f.edit(floor_index=second_floor, room_id=f"f{second_floor}_r1", proposal="retry")
                self.assertEqual(caught.exception.status_code, 409)
                self.assertEqual(self.f.payload()["spaces"]["floors"][0]["undo_count"], 1)
                self.f.edit(floor_index=second_floor, room_id=f"f{second_floor}_r1", proposal="retry")
                final = self.f.payload()["spaces"]["floors"]
                self.assertEqual(final[second_floor - 1]["rooms"][0]["proposal"], "retry")
                self.assertEqual([f["undo_count"] for f in final], [2, 0] if second_floor == 1 else [1, 1])
                if second_floor == 2:
                    self.assertEqual(final[0]["rooms"][0]["proposal"], "winner")
                self.f.assert_references()

    def test_parallel_legacy_cache_derivations_leave_one_complete_wall_and_no_database_edits(self):
        before = self.legacy(missing_file=True)
        payloads = [deepcopy(before) for _ in range(4)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            changed = list(pool.map(rooms.ensure_line_layers, payloads))
        self.assertTrue(all(changed))
        keys = {p["spaces"]["floors"][0]["line_file"] for p in payloads}
        self.assertEqual(len(keys), 1)
        with Image.open(media.get_local_storage()._resolved_file(keys.pop())) as wall:
            self.assertEqual(wall.size, (8, 8))
            wall.load()
        self.assertEqual(self.f.payload(), before)

    def test_invalid_preparation_or_fitout_keeps_saved_payload_and_existing_files(self):
        for kind in ("prepare", "fitout"):
            with self.subTest(writer=kind):
                before = self.f.seed()
                files = self.f.files()
                if kind == "prepare":
                    invalid = self.preparation().model_copy(update={"room_kinds": {}})
                    with self.f.sessions() as db, self.assertRaises(HTTPException) as caught:
                        self.ns["prepare_cad_fitout"](self.f.extract_id, invalid, db, self.auth)
                else:
                    with self.assertRaises(HTTPException) as caught:
                        self.write("fitout")
                self.assertEqual(caught.exception.status_code, 400)
                self.assertEqual(self.f.payload(), before)
                self.assertEqual(self.f.files(), files)

    def test_interleaved_read_snapshot_stays_readable_without_reverting_saved_undo(self):
        self.legacy()
        original_files = self.f.files()
        response, saved = self.interleave_read("detail", lambda: self.f.edit(proposal="new name"))
        old = response.data["spaces"]["floors"][0]
        self.assertEqual(old["rooms"][0]["proposal"], "current")
        self.assertEqual(saved["spaces"]["floors"][0]["undo_count"], 1)
        self.assertTrue(media.read_binary_asset(old["mask_file"]))
        self.assertTrue(media.read_binary_asset(old["line_file"]))
        self.f.originals_unchanged(original_files)
        self.f.edit("undo")
        self.assertEqual(self.f.payload()["spaces"]["floors"][0]["rooms"][0]["proposal"], "current")
