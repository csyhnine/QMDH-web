"""R35: temporary 8x8 images, real FK SQLite and selected endpoint source only."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import copy
import importlib
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from PIL import Image, ImageDraw
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.orm.attributes import flag_modified

from app.models import CadExtract, User
from app.schemas import CadExtractOut, CadProgramApplyIn, CadRoomEditIn
from app.services import media_storage as media
from app.services.cad import room_edit as rooms
from app.services.cad.program_rearrange import apply_program_changes
from tests.test_review_agent_dispatch import load_functions


STROKES = [{"x": 0.1, "y": 0.1}, {"x": 0.8, "y": 0.1}, {"x": 0.1, "y": 0.8}]


class CadEditPreservationTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r35-offline-")))
        self.media_root = self.root / "media"
        self.enterContext(patch.object(media.settings, "media_root", str(self.media_root)))
        self.enterContext(patch.object(media.settings, "storage_backend", "local"))
        self.enterContext(patch.object(media.settings, "media_url_prefix", "/media"))
        self.engine = create_engine("sqlite:///" + (self.root / "cad.db").as_posix())
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for fk in table.foreign_keys:
                include(fk.column.table)
        include(CadExtract.__table__)
        CadExtract.metadata.create_all(self.engine, tables=list(tables))
        self.sessions = sessionmaker(self.engine, autoflush=False)
        with self.sessions() as db:
            user = User(name="r35-synthetic", role="designer")
            db.add(user)
            db.commit()
            self.user_id = user.id
        self.serial = 0
        self.persistence = None
        if (Path(__file__).parents[1] / "app/services/cad/edit_persistence.py").exists():
            self.persistence = importlib.import_module("app.services.cad.edit_persistence")
        ns = dict(copy=copy, select=select, CadExtract=CadExtract, HTTPException=HTTPException,
                  flag_modified=flag_modified, adjust_floor_room=rooms.adjust_floor_room, undo_floor_edit=rooms.undo_floor_edit,
                  apply_program_changes=apply_program_changes, Depends=lambda _: None, get_db=lambda: None,
                  get_current_auth_user=lambda: None, CadExtractOut=CadExtractOut, resolve_storage_path=media.resolve_storage_path)
        if self.persistence is not None:
            ns.update({name: getattr(self.persistence, name) for name in ("CadMediaEdit", "CadEditConflict", "cad_edit_source", "commit_cad_edit")})
        self.ns = load_functions("app/routers/cad.py", ["edit_cad_room", "apply_cad_program", "_to_cad_extract_out"], ns)

    def png(self, image):
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()

    def seed(self, *, undo=0, floors=1):
        self.serial += 1
        floor_rows = []
        for index in range(1, floors + 1):
            base = f"cad/extracts/r35-{self.serial}-floor-{index}"
            mask = Image.new("L", (8, 8), 0)
            ImageDraw.Draw(mask).rectangle((2, 2, 5, 5), fill=1)
            preview = Image.new("RGB", (8, 8), (12, 12, 12))
            lines = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
            ImageDraw.Draw(lines).line((0, 0, 0, 7), fill=(255, 255, 255, 255))
            for path, image in ((base + "-mask.png", mask), (base + ".png", preview), (base + "-lines.png", lines)):
                media.write_binary_asset(path, self.png(image))
            floor = {"floor_index": index, "label": f"floor {index}", "mask_file": base + "-mask.png", "line_file": base + "-lines.png",
                     "line_path": "/media/" + base + "-lines.png", "preview_path": "/media/" + base + ".png",
                     "square_meters_per_pixel": 1, "scheme_zh": "current", "preview_version": 0,
                     "rooms": [{"room_id": f"f{index}_r1", "marker": "1", "swatch": "#ff0000", "proposal": "current", "area_ratio": 1,
                                "area_m2": 16, "zoning": {"activity": "动"}}], "undo_stack": [], "undo_count": undo, "undo_seq": undo}
            for number in range(1, undo + 1):
                old_mask = Image.new("L", (8, 8), 0)
                old_mask.putpixel((1, 1), 1)
                mask_path, preview_path = base + f"-undo-{number}-mask.png", base + f"-undo-{number}.png"
                media.write_binary_asset(mask_path, self.png(old_mask))
                media.write_binary_asset(preview_path, self.png(preview))
                old_rooms = deepcopy(floor["rooms"])
                old_rooms[0]["proposal"] = f"old-{number}"
                floor["undo_stack"].append({"mask_file": mask_path, "preview_file": preview_path, "rooms": old_rooms, "scheme_zh": f"old-{number}"})
            floor_rows.append(floor)
        with self.sessions() as db:
            row = CadExtract(public_id=f"r35-{self.serial}", user_id=self.user_id, file_name="synthetic.dxf", source_format="dxf",
                             source_storage_path="synthetic-not-parsed.dxf", status="completed",
                             sha256=f"{self.serial:064x}", payload_json={"spaces": {"floors": floor_rows}, "untouched": {"keep": True}})
            db.add(row)
            db.commit()
            self.extract_id, self.record_id = row.public_id, row.id
        return self.payload()

    def payload(self):
        with self.sessions() as db:
            return deepcopy(db.get(CadExtract, self.record_id).payload_json)

    def files(self):
        return {p.relative_to(self.media_root).as_posix(): p.read_bytes() for p in self.media_root.rglob("*") if p.is_file()}

    def originals_unchanged(self, before):
        after = self.files()
        self.assertTrue(all(after.get(path) == content for path, content in before.items()))

    def edit(self, action="rename", *, db=None, **kwargs):
        payload = CadRoomEditIn(floor_index=kwargs.pop("floor_index", 1), room_id=kwargs.pop("room_id", "f1_r1"), action=action, **kwargs)
        def invoke(session):
            return self.ns["edit_cad_room"](self.extract_id, payload, session, SimpleNamespace(user_id=self.user_id))
        if db is not None:
            return invoke(db)
        with self.sessions() as session:
            return invoke(session)

    def program(self, names, *, db=None):
        items = [{"floor_index": index, "room_id": f"f{index}_r1", "proposal": name, "activity": "静"} for index, name in names]
        value = CadProgramApplyIn(items=items)
        def invoke(session):
            return self.ns["apply_cad_program"](self.extract_id, value, session, SimpleNamespace(user_id=self.user_id))
        if db is not None:
            return invoke(db)
        with self.sessions() as session:
            return invoke(session)

    def assert_references(self, payload=None):
        for floor in (payload or self.payload())["spaces"]["floors"]:
            mask = floor["mask_file"]
            preview = rooms._preview_relative(mask)
            self.assertTrue(media.get_local_storage().exists(mask))
            self.assertTrue(media.get_local_storage().exists(preview))
            self.assertTrue(media.get_local_storage().exists(floor["line_file"]))
            self.assertEqual(floor["line_file"], rooms._line_relative(mask))
            self.assertEqual(floor["preview_path"].split("?", 1)[0], "/media/" + preview)
            for snap in floor.get("undo_stack", []):
                self.assertTrue(media.get_local_storage().exists(snap["mask_file"]))
                self.assertTrue(media.get_local_storage().exists(snap["preview_file"]))

    def test_twenty_undo_blank_rename_rejects_without_deleting_history_or_creating_files(self):
        before_payload = self.seed(undo=20)
        before = self.files()
        with self.assertRaises(HTTPException) as caught:
            self.edit(proposal="  ")
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(self.payload(), before_payload)
        self.assertEqual(self.files(), before)

    def test_undo_commit_failure_keeps_active_images_and_snapshot_available_for_retry(self):
        before_payload = self.seed(undo=1)
        before = self.files()
        with self.sessions() as db, patch.object(db, "commit", side_effect=RuntimeError("synthetic commit failure")):
            with self.assertRaises(RuntimeError):
                self.edit("undo", db=db)
            db.rollback()
        self.assertEqual(self.payload(), before_payload)
        self.originals_unchanged(before)
        self.edit("undo")
        self.assertEqual(self.payload()["spaces"]["floors"][0]["rooms"][0]["proposal"], "old-1")
        self.assert_references()

    def test_successful_rename_paint_create_remove_and_undo_use_matching_new_version_references(self):
        self.seed()
        original = self.files()
        self.edit(proposal="renamed")
        self.edit("paint", strokes=STROKES)
        self.edit("create", room_id="", proposal="new room", strokes=[{"x": 0.7, "y": 0.7}, {"x": 1, "y": 0.7}, {"x": 0.7, "y": 1}])
        before_remove = self.payload()
        new_id = next(r["room_id"] for r in before_remove["spaces"]["floors"][0]["rooms"] if r["proposal"] == "new room")
        self.edit("remove", room_id=new_id)
        self.edit("undo")
        final = self.payload()
        self.assertEqual(final["spaces"]["floors"][0]["rooms"], before_remove["spaces"]["floors"][0]["rooms"])
        self.assertEqual(media.read_binary_asset(final["spaces"]["floors"][0]["mask_file"]), media.read_binary_asset(before_remove["spaces"]["floors"][0]["mask_file"]))
        self.assert_references(final)
        self.originals_unchanged(original)

    def test_invalid_action_floor_room_polygon_capacity_and_empty_create_have_no_media_effects(self):
        cases = [("rename", {"proposal": ""}), ("paint", {"strokes": []}), ("create", {"strokes": []}),
                 ("rename", {"proposal": "name", "floor_index": 99}), ("remove", {"room_id": "missing"}),
                 ("create", {"strokes": [{**point, "erase": True} for point in STROKES]})]
        for action, kwargs in cases:
            with self.subTest(action=action, kwargs=kwargs):
                payload = self.seed(undo=20)
                before = self.files()
                with self.assertRaises(HTTPException):
                    self.edit(action, **kwargs)
                self.assertEqual(self.payload(), payload)
                self.assertEqual(self.files(), before)
        for action, rooms_value in [("bad_action", None), ("create", [{"room_id": str(i), "marker": str(i)} for i in range(1, 251)])]:
            payload = self.payload()
            if rooms_value:
                payload["spaces"]["floors"][0]["rooms"] = rooms_value
            original = deepcopy(payload)
            before = self.files()
            with self.assertRaises(ValueError):
                rooms.adjust_floor_room(payload, floor_index=1, room_id="f1_r1", action=action, strokes=STROKES)
            self.assertEqual(payload, original)
            self.assertEqual(self.files(), before)

    def test_every_snapshot_and_active_media_write_failure_preserves_all_committed_data(self):
        original_create = media.create_binary_asset
        for action in ("rename", "remove", "paint", "create", "undo"):
            for fail_at in range(1, 4 if action == "undo" else 7):
                with self.subTest(action=action, fail_at=fail_at):
                    payload = self.seed(undo=20)
                    before = self.files()
                    count = 0
                    def fail(path, data):
                        nonlocal count
                        count += 1
                        if count == fail_at:
                            raise OSError("synthetic staged image failure")
                        return original_create(path, data)
                    kwargs = {"proposal": "changed"} if action == "rename" else {"strokes": STROKES} if action in {"paint", "create"} else {}
                    with patch.object(media, "create_binary_asset", side_effect=fail), self.assertRaises(OSError):
                        self.edit(action, **kwargs)
                    self.assertEqual(self.payload(), payload)
                    self.originals_unchanged(before)

    def test_flush_or_commit_failure_rolls_back_each_edit_and_retry_remains_usable(self):
        for action in ("rename", "remove", "paint", "create", "undo"):
            for failure in ("flush", "commit"):
                with self.subTest(action=action, failure=failure):
                    payload = self.seed(undo=1)
                    before = self.files()
                    kwargs = {"proposal": "changed"} if action == "rename" else {"strokes": STROKES} if action in {"paint", "create"} else {}
                    with self.sessions() as db, patch.object(db, failure, side_effect=RuntimeError("synthetic DB failure")):
                        with self.assertRaises(RuntimeError):
                            self.edit(action, db=db, **kwargs)
                        self.assertFalse(db.in_transaction())
                    self.assertEqual(self.payload(), payload)
                    self.originals_unchanged(before)
                    self.edit(action, **kwargs)
                    self.assert_references()

    def test_program_batch_failure_after_first_floor_keeps_original_json_and_all_files(self):
        payload = self.seed(undo=20, floors=2)
        before = self.files()
        real_read = rooms.read_binary_asset
        blocked = payload["spaces"]["floors"][1]["mask_file"]
        def fail_second(path):
            if path == blocked:
                raise FileNotFoundError("synthetic second floor missing")
            return real_read(path)
        with patch.object(rooms, "read_binary_asset", side_effect=fail_second), self.assertRaises(FileNotFoundError):
            self.program([(1, "first"), (2, "second")])
        self.assertEqual(self.payload(), payload)
        self.originals_unchanged(before)

    def test_successful_forty_change_batch_trims_logical_stack_and_reclaims_only_unpublished_drafts(self):
        self.seed(undo=20)
        before = self.files()
        self.program([(1, f"change-{i}") for i in range(40)])
        floor = self.payload()["spaces"]["floors"][0]
        self.assertEqual((floor["undo_count"], len(floor["undo_stack"]), floor["rooms"][0]["proposal"]), (20, 20, "change-39"))
        self.originals_unchanged(before)
        self.assertEqual(len(set(self.files()) - set(before)), 63)
        self.assert_references()

    def test_missing_legacy_line_layer_is_derived_in_memory_and_new_paths_match_existing_readers(self):
        payload = self.seed()
        line = payload["spaces"]["floors"][0]["line_file"]
        media.get_local_storage()._resolved_file(line).unlink()
        before = self.files()
        self.edit(proposal="changed")
        self.assertFalse(media.get_local_storage().exists(line))
        self.originals_unchanged(before)
        self.assert_references()
        stored = self.payload()
        files = self.files()
        self.assertFalse(rooms.ensure_line_layers(deepcopy(stored)))
        self.assertEqual(self.files(), files)
        # The existing binary reader also supports legacy /media-prefixed keys.
        # New version keys must keep that readable namespace rather than nesting media/media.
        with self.sessions() as db:
            row = db.get(CadExtract, self.record_id)
            legacy = deepcopy(row.payload_json)
            floor = legacy["spaces"]["floors"][0]
            floor["mask_file"] = "/media/" + floor["mask_file"]
            floor["line_file"] = "/media/" + floor["line_file"]
            row.payload_json = legacy
            db.commit()
        self.edit(proposal="legacy prefix remains readable")
        self.assert_references()
        self.originals_unchanged(files)

    def test_other_floor_and_non_edit_payload_fields_remain_unchanged(self):
        before = self.seed(floors=2)
        self.edit(proposal="changed")
        after = self.payload()
        self.assertEqual(after["spaces"]["floors"][1], before["spaces"]["floors"][1])
        self.assertEqual(after["untouched"], before["untouched"])

    def test_changed_source_payload_rejects_commit_without_overwriting_a_newer_database_value(self):
        self.seed()
        before = self.files()
        original = self.ns["commit_cad_edit"]
        def competing_commit(db, record, token, updated):
            with self.sessions() as other:
                row = other.get(CadExtract, self.record_id)
                row.payload_json = {**row.payload_json, "competing_value": "keep newer"}
                other.commit()
            return original(db, record, token, updated)
        with patch.dict(self.ns, commit_cad_edit=competing_commit), self.assertRaises(HTTPException) as caught:
            self.edit(proposal="must not win")
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(self.payload()["competing_value"], "keep newer")
        self.assertEqual(self.payload()["spaces"]["floors"][0]["rooms"][0]["proposal"], "current")
        self.originals_unchanged(before)

    def test_commit_ack_loss_keeps_complete_current_references_and_all_old_recovery_sources(self):
        self.seed(undo=1)
        before = self.files()
        with self.sessions() as db:
            original = db.commit
            def committed_then_lost():
                original()
                raise RuntimeError("synthetic lost commit acknowledgement")
            with patch.object(db, "commit", side_effect=committed_then_lost), self.assertRaises(RuntimeError):
                self.edit("undo", db=db)
        self.assertEqual(self.payload()["spaces"]["floors"][0]["rooms"][0]["proposal"], "old-1")
        self.assert_references()
        self.originals_unchanged(before)

    def test_fake_oss_failure_or_lost_put_leaves_old_local_files_and_database_unchanged(self):
        class Bucket:
            def __init__(self, after):
                self.after, self.calls, self.objects = after, [], {}
            def get_bucket_versioning(self):
                return SimpleNamespace(status=None)
            def put_object(self, key, data, headers):
                self.calls.append((key, bytes(data), dict(headers)))
                if self.after:
                    self.objects[key] = bytes(data)
                raise OSError("synthetic OSS failure")
        for after in (False, True):
            with self.subTest(accepted=after):
                payload = self.seed(undo=20)
                before = self.files()
                bucket = Bucket(after)
                remote = media.OSSStorage(endpoint="https://oss.invalid", bucket_name="fixture", access_key_id="unused", access_key_secret="unused", bucket=bucket)
                with patch.object(media.settings, "storage_backend", "oss"), patch.object(media, "get_storage_backend", return_value=remote), self.assertRaises(OSError):
                    self.edit(proposal="changed")
                self.assertEqual(self.payload(), payload)
                self.originals_unchanged(before)
                self.assertEqual(len(bucket.calls), 1)
                self.assertEqual(len(bucket.objects), int(after))

    def test_published_trimmed_history_borrowed_by_another_record_is_physically_retained(self):
        before_payload = self.seed(undo=20)
        borrowed = before_payload["spaces"]["floors"][0]["undo_stack"][0]
        with self.sessions() as db:
            db.add(CadExtract(public_id="r35-borrower", user_id=self.user_id, file_name="borrower", source_format="dxf", source_storage_path="unused",
                              status="completed", sha256="f" * 64, payload_json={"borrowed_snapshot": borrowed}))
            db.commit()
        before = self.files()
        self.edit(proposal="changed")
        self.assertEqual(self.payload()["spaces"]["floors"][0]["undo_count"], 20)
        self.originals_unchanged(before)
        self.assertTrue(media.get_local_storage().exists(borrowed["mask_file"]))

    def test_post_commit_draft_cleanup_failure_is_logged_without_breaking_saved_references(self):
        self.seed()
        with patch.object(self.persistence, "_discard_created_local", side_effect=OSError("synthetic cleanup failure")), self.assertLogs(self.persistence.logger, level="WARNING"):
            self.program([(1, "first"), (1, "second")])
        self.assertEqual(self.payload()["spaces"]["floors"][0]["rooms"][0]["proposal"], "second")
        self.assert_references()

    def test_missing_or_corrupt_snapshot_source_fails_before_any_media_write(self):
        for corrupt in (False, True):
            with self.subTest(corrupt=corrupt):
                payload = self.seed(undo=1)
                path = payload["spaces"]["floors"][0]["undo_stack"][-1]["mask_file"]
                target = media.get_local_storage()._resolved_file(path)
                if corrupt:
                    target.write_bytes(b"synthetic broken PNG")
                else:
                    target.unlink()
                before = self.files()
                with self.assertRaises(OSError):
                    self.edit("undo")
                self.assertEqual(self.payload(), payload)
                self.assertEqual(self.files(), before)

    def test_parallel_service_candidates_keep_input_original_and_have_distinct_media_versions(self):
        payload = self.seed()
        original = deepcopy(payload)
        before = self.files()
        with ThreadPoolExecutor(max_workers=4) as pool:
            updated = list(pool.map(lambda i: rooms.adjust_floor_room(payload, floor_index=1, room_id="f1_r1", action="rename", proposal=f"candidate-{i}"), range(4)))
        self.assertEqual(payload, original)
        self.assertEqual(len({row["spaces"]["floors"][0]["mask_file"] for row in updated}), 4)
        for row in updated:
            self.assert_references(row)
        self.originals_unchanged(before)

    def test_response_conversion_failure_after_commit_does_not_remove_saved_or_old_images(self):
        self.seed(undo=1)
        before = self.files()
        with patch.dict(self.ns, _to_cad_extract_out=Mock(side_effect=RuntimeError("synthetic response failure"))), self.assertRaises(RuntimeError):
            self.edit(proposal="saved before response failure")
        self.assertEqual(self.payload()["spaces"]["floors"][0]["rooms"][0]["proposal"], "saved before response failure")
        self.assert_references()
        self.originals_unchanged(before)
