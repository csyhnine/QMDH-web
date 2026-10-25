"""R89: owned temporary files/ZIPs only; real media preparation is forbidden."""
import ast
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import zipfile

from app.services import inspiration_refresh as refresh
from app.services import inspiration_bundle_workspace as owned
from tests.test_review_agent_memory_completion import BACKEND, definitions


class InspirationBundleWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory(prefix="r89-offline-")
        self.root=Path(self.temporary.name).resolve()
        self.assertEqual(self.root.parent,Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.root.name.startswith("r89-offline-"))
        self.addCleanup(self.clean_fixture)
        self.output=self.root/"output"/"seed.zip";self.output.parent.mkdir()
        with zipfile.ZipFile(self.output,"w") as archive:archive.writestr("old.txt",b"original finished archive")
        self.original=self.output.read_bytes()
        self.media=self.root/"synthetic-media";(self.media/"seed").mkdir(parents=True)
        for name in ("a.jpg","b.svg","c.jpg"):(self.media/"seed"/name).write_bytes(b"synthetic-"+name.encode())
        self.notes=self.output.parent/"seed__bundle";self.notes.mkdir()
        (self.notes/"user-notes.txt").write_bytes(b"keep my existing notes")
        self.other=self.output.parent/"other-task-stage";self.other.mkdir()
        (self.other/"work.txt").write_bytes(b"another task owns this")
        self.workspaces=[];self.removed=[]
        original_rmtree=shutil.rmtree
        def safe_delete(path,*args,**kwargs):
            target=Path(path).resolve()
            self.assertTrue(target==self.root or target.is_relative_to(self.root),target)
            self.removed.append(target)
            return original_rmtree(path,*args,**kwargs)
        self.safe_delete=safe_delete
        self.enterContext(patch.object(owned.shutil,"rmtree",safe_delete))
        workspaces=self.workspaces
        class TracedWorkspace(owned.BundleWorkspace):
            def __init__(self,*args):
                super().__init__(*args);self.thread_id=threading.get_ident();workspaces.append(self)
        self.enterContext(patch.object(refresh,"BundleWorkspace",TracedWorkspace))
        self.entries=[refresh.SeedInspirationEntry(title=name,image_url="https://synthetic.invalid/"+name,
                      source_url="https://synthetic.invalid/source/"+name) for name in ("a.jpg","b.svg","c.jpg")]
        self.enterContext(patch.object(refresh,"SEED_INSPIRATION_ENTRIES",self.entries))
        self.enterContext(patch.object(refresh,"_preferred_seed_image_url",side_effect=lambda entry:entry.image_url))
        self.media_root=self.enterContext(patch.object(refresh,"media_root_path",return_value=self.media))
        def prepare(url,*,title,source_url,namespace,overwrite):
            self.assertEqual(namespace,"seed");self.assertTrue(overwrite)
            return "seed/"+title
        self.normal_prepare=prepare
        self.prepare=self.enterContext(patch.object(refresh,"prepare_inspiration_image",side_effect=prepare))

    def clean_fixture(self):
        target=Path(self.temporary.name).resolve()
        self.assertEqual(target,self.root)
        self.assertEqual(target.parent,Path(tempfile.gettempdir()).resolve())
        self.assertTrue(target.name.startswith("r89-offline-"))
        self.temporary.cleanup()

    def build(self,output=None):return refresh.build_seed_inspiration_bundle(str(output or self.output))

    def protected(self):
        self.assertEqual((self.notes/"user-notes.txt").read_bytes(),b"keep my existing notes")
        self.assertEqual((self.other/"work.txt").read_bytes(),b"another task owns this")

    def old_preserved(self):
        self.assertEqual(self.output.read_bytes(),self.original);self.protected()

    def assert_clean(self):
        for workspace in self.workspaces:
            if workspace.root is not None:self.assertFalse(workspace.root.exists())
            self.assertFalse(workspace.lock_path.exists())

    def test_original_fixed_staging_deletes_fixture_notes_new_build_preserves_them(self):
        namespace=dict(Path=Path,shutil=SimpleNamespace(copy2=shutil.copy2,rmtree=self.safe_delete),zipfile=zipfile,json=json,
            asdict=asdict,SeedBundleEntry=refresh.SeedBundleEntry,BuildSeedBundleResult=refresh.BuildSeedBundleResult,
            media_root_path=lambda:self.media,SEED_INSPIRATION_ENTRIES=self.entries,
            prepare_inspiration_image=self.prepare,_preferred_seed_image_url=lambda entry:entry.image_url)
        definitions("../docs/archive/f82-r89-2026-10-25/original/backend/app/services/inspiration_refresh.py",{"build_seed_inspiration_bundle"},namespace)
        for fail in (False,True):
            destination=self.root/("legacy-failure.zip" if fail else "legacy-success.zip")
            stage=destination.parent/(destination.stem+"__bundle");stage.mkdir();note=stage/"user-notes.txt";note.write_bytes(b"synthetic legacy note")
            if fail:
                previous=self.prepare.side_effect
                self.prepare.side_effect=RuntimeError("synthetic first media failure")
                try:
                    with self.assertRaises(RuntimeError):namespace["build_seed_inspiration_bundle"](str(destination))
                finally:self.prepare.side_effect=previous
            else:namespace["build_seed_inspiration_bundle"](str(destination))
            self.assertFalse(note.exists())
        self.build();self.protected();self.assert_clean()

    def test_healthy_bundle_has_complete_manifest_media_and_no_nested_artifact(self):
        result=self.build()
        self.assertEqual((result.total,result.restored,result.placeholders),(3,2,1))
        self.assertEqual((result.cleanup_warnings,result.retained_paths),([],[]))
        with zipfile.ZipFile(self.output) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(set(archive.namelist()),{"manifest.json","seed/a.jpg","seed/b.svg","seed/c.jpg"})
            entries=json.loads(archive.read("manifest.json"))["entries"]
            self.assertEqual([entry["title"] for entry in entries],["a.jpg","b.svg","c.jpg"])
            self.assertEqual(sum(entry["placeholder"] for entry in entries),1)
            self.assertEqual(archive.read("seed/a.jpg"),b"synthetic-a.jpg")
        self.protected();self.assert_clean()
        self.assertTrue(all(path.name.startswith(".qmdh-bundle-") for path in self.removed))

    def test_empty_source_is_a_valid_manifest_only_bundle(self):
        with patch.object(refresh,"SEED_INSPIRATION_ENTRIES",[]):result=self.build()
        self.assertEqual((result.total,result.restored,result.placeholders),(0,0,0));self.prepare.assert_not_called()
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(archive.namelist(),["manifest.json"])
            self.assertEqual(json.loads(archive.read("manifest.json")),{"entries":[]})
        self.protected();self.assert_clean()

    def test_first_and_middle_media_failure_preserve_original_archive_and_release_resources(self):
        for failing in (1,2):
            with self.subTest(failing=failing):
                count=[0]
                def prepare(*args,**kwargs):
                    count[0]+=1
                    if count[0]==failing:raise RuntimeError("synthetic media failure")
                    return self.normal_prepare(*args,**kwargs)
                with patch.object(refresh,"prepare_inspiration_image",side_effect=prepare):
                    with self.assertRaisesRegex(RuntimeError,"synthetic media failure"):self.build()
                self.assertEqual(count[0],failing);self.old_preserved();self.assert_clean()

    def test_copy_failure_preserves_original_then_retry_succeeds(self):
        with patch.object(refresh.shutil,"copy2",side_effect=OSError("synthetic copy failure")):
            with self.assertRaisesRegex(OSError,"copy failure"):self.build()
        self.old_preserved();self.assert_clean();self.assertEqual(self.build().total,3)

    def test_manifest_failure_preserves_original_archive(self):
        original=Path.write_text
        def fail(path,*args,**kwargs):
            if path.name=="manifest.json":raise OSError("synthetic manifest failure")
            return original(path,*args,**kwargs)
        with patch.object(Path,"write_text",fail):
            with self.assertRaisesRegex(OSError,"manifest failure"):self.build()
        self.old_preserved();self.assert_clean()

    def test_zip_open_write_and_close_failures_never_truncate_original_archive(self):
        original_class=zipfile.ZipFile;original_write=zipfile.ZipFile.write;original_close=zipfile.ZipFile.close
        for point in ("open","write","close"):
            with self.subTest(point=point):
                def factory(*args,**kwargs):
                    if point=="open":raise OSError("synthetic zip open failure")
                    return original_class(*args,**kwargs)
                def write(archive,*args,**kwargs):
                    if point=="write":raise OSError("synthetic zip write failure")
                    return original_write(archive,*args,**kwargs)
                def close(archive):
                    was_open=archive.fp is not None;original_close(archive)
                    if point=="close" and was_open:raise OSError("synthetic zip close failure")
                with patch.object(refresh.zipfile,"ZipFile",factory),patch.object(original_class,"write",write),patch.object(original_class,"close",close):
                    with self.assertRaisesRegex(OSError,"synthetic zip"):self.build()
                self.old_preserved();self.assert_clean()

    def test_replace_failure_preserves_original_and_subsequent_retry_works(self):
        with patch.object(owned.os,"replace",side_effect=OSError("synthetic publish failure")):
            with self.assertRaisesRegex(OSError,"publish failure"):self.build()
        self.old_preserved();self.assert_clean();self.assertEqual(self.build().total,3)

    def test_noncooperating_output_change_is_not_overwritten(self):
        def prepare(*args,**kwargs):
            self.output.write_bytes(b"another writer saved this")
            return self.normal_prepare(*args,**kwargs)
        with patch.object(refresh,"prepare_inspiration_image",side_effect=prepare):
            with self.assertRaisesRegex(FileExistsError,"output changed"):self.build()
        self.assertEqual(self.output.read_bytes(),b"another writer saved this");self.protected();self.assert_clean()

    def test_same_output_conflict_happens_before_second_media_or_staging(self):
        entered=threading.Event();gate=threading.Event()
        def prepare(*args,**kwargs):
            entered.set();gate.wait(5);return self.normal_prepare(*args,**kwargs)
        with patch.object(refresh,"prepare_inspiration_image",side_effect=prepare),ThreadPoolExecutor(max_workers=1) as pool:
            first=pool.submit(self.build)
            try:
                self.assertTrue(entered.wait(5));self.old_preserved()
                with self.assertRaisesRegex(FileExistsError,"owns this output"):self.build()
                self.assertEqual(self.media_root.call_count,1)
                self.assertEqual(sum(workspace.root is not None for workspace in self.workspaces),1)
            finally:gate.set()
            self.assertEqual(first.result(timeout=5).total,3)
        self.protected();self.assert_clean()

    def test_different_outputs_get_distinct_owned_workspaces(self):
        barrier=threading.Barrier(2);seen=set();mutex=threading.Lock()
        def prepare(*args,**kwargs):
            ident=threading.get_ident()
            with mutex:first=ident not in seen;seen.add(ident)
            if first:barrier.wait(timeout=5)
            return self.normal_prepare(*args,**kwargs)
        with patch.object(refresh,"prepare_inspiration_image",side_effect=prepare),ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(self.build,[self.output,self.output.parent/"second.zip"]))
        self.assertEqual([result.total for result in results],[3,3])
        self.assertEqual(len({workspace.root for workspace in self.workspaces}),2)
        for result in results:
            with zipfile.ZipFile(result.bundle_path) as archive:self.assertIsNone(archive.testzip())
        self.protected();self.assert_clean()

    def test_staging_cleanup_failure_reports_warning_without_losing_published_success(self):
        with patch.object(owned.shutil,"rmtree",side_effect=PermissionError("synthetic cleanup busy")):result=self.build()
        workspace=self.workspaces[-1]
        self.assertIn("staging_cleanup_failed",result.cleanup_warnings)
        self.assertEqual(result.retained_paths,[str(workspace.root)])
        self.assertTrue(workspace.root.exists());self.assertFalse(workspace.lock_path.exists())
        with zipfile.ZipFile(self.output) as archive:self.assertIsNone(archive.testzip())
        self.assertEqual(self.build().total,3)
        self.assertTrue(workspace.root.exists());self.protected()

    def test_cleanup_failure_does_not_mask_original_build_failure(self):
        with patch.object(refresh,"prepare_inspiration_image",side_effect=ValueError("synthetic primary failure")),patch.object(owned.shutil,"rmtree",side_effect=PermissionError("synthetic cleanup failure")):
            with self.assertRaisesRegex(ValueError,"primary failure") as caught:self.build()
        self.assertIn("staging_cleanup_failed"," ".join(caught.exception.__notes__))
        self.old_preserved();self.assertTrue(self.workspaces[-1].root.exists())
        self.assertFalse(self.workspaces[-1].lock_path.exists())

    def test_lock_cleanup_failure_is_reported_and_stale_lock_is_not_automatically_deleted(self):
        original=Path.unlink
        def unlink(path,*args,**kwargs):
            if path.name.endswith(".lock"):raise PermissionError("synthetic lock cleanup failure")
            return original(path,*args,**kwargs)
        with patch.object(Path,"unlink",unlink):result=self.build()
        workspace=self.workspaces[-1];self.assertIn("output_lock_cleanup_failed",result.cleanup_warnings)
        lock_bytes=workspace.lock_path.read_bytes();calls=self.prepare.call_count
        with self.assertRaises(FileExistsError):self.build()
        self.assertEqual(self.prepare.call_count,calls);self.assertEqual(workspace.lock_path.read_bytes(),lock_bytes)
        self.assertEqual(json.loads(lock_bytes)["destination"],str(self.output.resolve()))
        self.protected()

    def test_preexisting_lock_file_or_directory_is_preserved_before_any_media_call(self):
        for directory in (False,True):
            output=self.output.parent/("blocked-dir.zip" if directory else "blocked-file.zip")
            workspace=owned.BundleWorkspace(output)
            if directory:workspace.lock_path.mkdir();(workspace.lock_path/"notes").write_bytes(b"keep")
            else:workspace.lock_path.write_bytes(b"user owned lock-name file")
            with self.assertRaises(FileExistsError):self.build(output)
            if directory:self.assertEqual((workspace.lock_path/"notes").read_bytes(),b"keep")
            else:self.assertEqual(workspace.lock_path.read_bytes(),b"user owned lock-name file")
        self.prepare.assert_not_called();self.old_preserved()

    def test_staging_ownership_change_aborts_and_does_not_clean_replacement_directory(self):
        moved=[]
        def prepare(*args,**kwargs):
            workspace=self.workspaces[-1];target=workspace.root.with_name(workspace.root.name+"-moved")
            self.assertTrue(workspace.root.resolve().is_relative_to(self.root));self.assertTrue(target.resolve().is_relative_to(self.root))
            workspace.root.rename(target);workspace.root.mkdir();(workspace.root/"foreign-notes").write_bytes(b"keep replacement")
            moved.append(target)
            return self.normal_prepare(*args,**kwargs)
        with patch.object(refresh,"prepare_inspiration_image",side_effect=prepare):
            with self.assertRaisesRegex(RuntimeError,"ownership changed") as caught:self.build()
        workspace=self.workspaces[-1]
        self.assertEqual((workspace.root/"foreign-notes").read_bytes(),b"keep replacement")
        self.assertIn("staging_ownership_changed"," ".join(caught.exception.__notes__))
        self.assertTrue(moved[0].exists());self.old_preserved()

    def test_lock_ownership_change_aborts_publication_and_preserves_foreign_lock(self):
        def prepare(*args,**kwargs):
            workspace=self.workspaces[-1];os.close(workspace._lock_fd);workspace._lock_fd=None
            self.assertTrue(workspace.lock_path.resolve().is_relative_to(self.root))
            workspace.lock_path.unlink();workspace.lock_path.write_bytes(b"foreign lock notes")
            return self.normal_prepare(*args,**kwargs)
        with patch.object(refresh,"prepare_inspiration_image",side_effect=prepare):
            with self.assertRaisesRegex(RuntimeError,"lock ownership changed"):self.build()
        self.assertEqual(self.workspaces[-1].lock_path.read_bytes(),b"foreign lock notes")
        self.old_preserved();self.assertFalse(self.workspaces[-1].root.exists())

    def test_workspace_allocation_failure_releases_own_lock_and_preserves_original(self):
        with patch.object(owned.tempfile,"mkdtemp",side_effect=OSError("synthetic allocation failure")):
            with self.assertRaisesRegex(OSError,"allocation failure"):self.build()
        self.prepare.assert_not_called();self.old_preserved();self.assert_clean()

    def test_lock_metadata_failure_retains_unconfirmed_lock_and_primary_error(self):
        with patch.object(owned.os,"write",side_effect=OSError("synthetic metadata failure")):
            with self.assertRaisesRegex(OSError,"metadata failure") as caught:self.build()
        self.assertIn("output_lock_ownership_changed"," ".join(caught.exception.__notes__))
        self.assertTrue(self.workspaces[-1].lock_path.exists());self.prepare.assert_not_called();self.old_preserved()

    def test_lock_creation_failure_without_existing_lock_preserves_original_error(self):
        error=PermissionError("synthetic cannot create output lock")
        with patch.object(owned.os,"open",side_effect=error):
            with self.assertRaises(PermissionError) as caught:self.build()
        self.assertIs(caught.exception,error)
        self.prepare.assert_not_called();self.old_preserved();self.assert_clean()

    def test_prepared_target_outside_owned_payload_is_rejected_before_copy(self):
        with patch.object(refresh,"prepare_inspiration_image",return_value="../not-owned.svg"):
            with self.assertRaisesRegex(ValueError,"outside this build workspace"):self.build()
        self.old_preserved();self.assert_clean()

    def test_cli_build_output_includes_cleanup_status_without_executing_cli(self):
        tree=ast.parse((BACKEND/"app/cli.py").read_text(encoding="utf-8"))
        branch=next(n for n in ast.walk(tree) if isinstance(n,ast.If) and isinstance(n.test,ast.Compare)
                    and any(isinstance(v,ast.Constant) and v.value=="build_seed_inspiration_bundle" for v in n.test.comparators))
        payload=next(n for n in ast.walk(branch) if isinstance(n,ast.Dict))
        result=refresh.BuildSeedBundleResult("synthetic.zip",total=3,cleanup_warnings=["staging_cleanup_failed"],retained_paths=["synthetic owned path"])
        value=eval(compile(ast.Expression(payload),"r89-cli-output","eval"),{"result":result})
        self.assertEqual(set(value),{"bundle_path","total","restored","placeholders","cleanup_warnings","retained_paths"})
        self.assertEqual(value["cleanup_warnings"],result.cleanup_warnings)
        other=refresh.BuildSeedBundleResult("other.zip");self.assertEqual(other.cleanup_warnings,[])
