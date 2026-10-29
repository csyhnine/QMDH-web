"""R13: actual exclusive files, Agent Asset/Job rows and synthetic OSS semantics."""
from base64 import b64encode, b64decode
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
import mimetypes
from pathlib import Path
import re
from threading import Barrier, Lock
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from uuid import UUID
import uuid

from PIL import Image
from fastapi import HTTPException
from sqlalchemy import select
from app.core.audit import write_audit_log
from app.core.config import AgentAuthProfile, settings
from app.models import AgentClient, AgentJob, Asset, AssetType, AuditLog, Project, Task, TaskStatus, User
from app.schemas import AgentJobOut, AgentProjectArtifactCreate
from app.services import media_storage as media, gif_compression
from tests.test_review_partial_image_progress import PartialImageProgressTests, load


class FixedDate(datetime):
    @classmethod
    def now(cls,tz=None):return datetime(2026,10,22,12,0,tzinfo=timezone.utc).astimezone(tz) if tz else datetime(2026,10,22,12,0)


class ObjectExists(Exception):
    status=409
    code="FileAlreadyExists"


class BucketFixture:
    def __init__(self):self.objects={};self.calls=[];self.version_status=None;self.version_error=False;self.missing_status=False;self.fault=None;self.lock=Lock()
    def get_bucket_versioning(self):
        if self.version_error:raise OSError("synthetic metadata unavailable")
        return SimpleNamespace() if self.missing_status else SimpleNamespace(status=self.version_status)
    def put_object(self,path,data,headers):
        with self.lock:
            self.calls.append((path,bytes(data),dict(headers)))
            if path in self.objects and headers.get("x-oss-forbid-overwrite")=="true":raise ObjectExists()
            if self.fault=="before":raise OSError("synthetic object failure")
            self.objects[path]=bytes(data)
            if self.fault=="after":raise OSError("synthetic lost response")
        return SimpleNamespace(status=200)


class AgentArtifactIdentityTests(unittest.TestCase):
    def setUp(self):
        self.sql=PartialImageProgressTests("test_second_submit_failure_keeps_completed_output_usage_and_known_cost")
        self.sql.setUp();self.addCleanup(self.sql.doCleanups)
        tables=set()
        def include(table):
            if table in tables:return
            tables.add(table)
            for fk in table.foreign_keys:include(fk.column.table)
        for model in (AgentClient,AgentJob,AuditLog):include(model.__table__)
        Task.metadata.create_all(self.sql.engine,tables=list(tables))
        with self.sql.sessions() as db:
            task=db.get(Task,self.sql.task_id);project=db.get(Project,task.project_id);user=db.get(User,task.user_id)
            client=AgentClient(key="r13-client",token_hash="synthetic-unused",user_id=user.id,project_codes=[project.code]);db.add(client);db.flush()
            self.project_id=project.id;self.code=project.code
            self.auth=AgentAuthProfile(client.id,client.key,"fixture","fixture-device","test",user.id,user.name,"designer",(project.code,));db.commit()
        self.root=self.sql.temporary/"media";self.root.mkdir();self.root=self.root.resolve();self.enterContext(patch.object(settings,"media_root",str(self.root)));self.enterContext(patch.object(settings,"storage_backend","local"))
        self.ns={"__name__":__name__,"b64decode":b64decode,"datetime":FixedDate,"timezone":timezone,"mimetypes":mimetypes,"re":re,"uuid":uuid,
                 "router":SimpleNamespace(post=lambda *args,**kwargs:lambda fn:fn),"status":SimpleNamespace(HTTP_201_CREATED=201),
                 "get_db":lambda:None,"get_current_agent_auth":lambda:None,"Depends":lambda *args:None,
                 "AgentJobOut":AgentJobOut,"AgentProjectArtifactCreate":AgentProjectArtifactCreate,"AgentAuthProfile":AgentAuthProfile,
                 "HTTPException":HTTPException,"select":select,"AgentJob":AgentJob,"Asset":Asset,"User":User,"Project":Project,"Task":Task,"TaskStatus":TaskStatus,
                 "write_uploaded_asset":media.write_uploaded_asset,"resolve_storage_path":media.resolve_storage_path,"resolve_storage_payload":media.resolve_storage_payload,
                 "write_audit_log":write_audit_log}
        load("app/routers/agent.py",self.ns,patterns=True,functions=["_request_id","_project_codes","_ensure_agent_project_access","_resolve_project","_get_or_create_agent_user","_decode_data_url","_write_agent_artifact","_create_agent_job","_sync_job_from_task","_to_job_out","save_project_artifact"])
        self.bucket=BucketFixture();self.oss=media.OSSStorage(endpoint="oss.fixture.invalid",bucket_name="synthetic",access_key_id="synthetic",access_key_secret="synthetic",bucket=self.bucket)
        buffer=BytesIO();Image.new("RGB",(1,1),"red").save(buffer,format="GIF");self.gif=buffer.getvalue()

    def payload(self,name="report",data=b"first",mime="text/plain",**kwargs):
        return AgentProjectArtifactCreate(name=name,data_url="data:"+mime+";base64,"+b64encode(data).decode(),asset_type=AssetType.document,**kwargs)

    def save(self,name="report",data=b"first",mime="text/plain"):
        with self.sql.sessions() as db:
            request=SimpleNamespace(headers={"x-request-id":"fixture-"+uuid.uuid4().hex})
            return self.ns["save_project_artifact"](self.project_id,self.payload(name,data,mime),request,db,self.auth)

    def paths(self):
        with self.sql.sessions() as db:return [(a.id,a.name,a.storage_path) for a in db.scalars(select(Asset).where(Asset.project_id==self.project_id).order_by(Asset.id))]

    def counts(self):
        with self.sql.sessions() as db:return tuple(len(db.scalars(select(model)).all()) for model in (Asset,AgentJob,AuditLog))

    def candidate(self,identity=1,name="report",suffix=".txt"):
        return f"agent-artifacts/{self.code}/20261022-120000-{name}-{UUID(int=identity).hex}{suffix}"

    def identities(self,values):
        iterator=iter(values);self.ns["uuid"]=SimpleNamespace(uuid4=lambda:UUID(int=next(iterator)))

    def enable_oss(self):
        self.enterContext(patch.object(media,"_oss_enabled",lambda:True));self.enterContext(patch.object(media,"get_storage_backend",lambda:self.oss))

    def test_same_second_same_name_keeps_distinct_bytes_and_real_asset_job_links(self):
        first=self.save(data=b"first content");second=self.save(data=b"second content");rows=self.paths()
        self.assertNotEqual(rows[0][2],rows[1][2]);self.assertEqual((self.root/rows[0][2]).read_bytes(),b"first content");self.assertEqual((self.root/rows[1][2]).read_bytes(),b"second content")
        self.assertEqual(self.counts(),(2,2,2));self.assertEqual(rows[0][1],"report")
        with self.sql.sessions() as db:
            self.assertEqual(db.get(AgentJob,first.id).asset_id,rows[0][0]);self.assertEqual(db.get(AgentJob,second.id).asset_id,rows[1][0])

    def test_sanitized_and_truncated_names_still_have_independent_storage_identity(self):
        for names in [("same name","same-name"),("a"*100+"x","a"*100+"y")]:
            with self.subTest(names=names):
                before=len(self.paths());self.save(names[0],b"left");self.save(names[1],b"right");rows=self.paths()[before:]
                self.assertNotEqual(rows[0][2],rows[1][2]);self.assertEqual((self.root/rows[0][2]).read_bytes(),b"left");self.assertEqual((self.root/rows[1][2]).read_bytes(),b"right")

    def test_parallel_uploads_have_unique_files_and_correct_database_rows(self):
        barrier=Barrier(4)
        def upload(i):barrier.wait();job=self.save(data=f"content-{i}".encode());return job.id,f"content-{i}".encode()
        with ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(upload,range(4)))
        self.assertEqual(self.counts(),(4,4,4));self.assertEqual(len({p for _,_,p in self.paths()}),4)
        with self.sql.sessions() as db:
            for job_id,data in results:
                job=db.get(AgentJob,job_id);asset=db.get(Asset,job.asset_id);self.assertEqual((self.root/asset.storage_path).read_bytes(),data)

    def test_forced_identifier_collision_retries_without_overwriting_old_file(self):
        self.identities([1]);self.save(data=b"old");self.identities([1,2]);self.save(data=b"new")
        self.assertEqual((self.root/self.candidate(1)).read_bytes(),b"old");self.assertEqual((self.root/self.candidate(2)).read_bytes(),b"new");self.assertEqual(self.counts(),(2,2,2))

    def test_exhausted_collisions_fail_without_success_metadata_or_changed_bytes(self):
        self.identities([1]);self.save(data=b"old");self.identities([1]*5)
        with self.assertRaises(HTTPException) as error:self.save(data=b"new")
        self.assertEqual(error.exception.status_code,409);self.assertEqual(self.counts(),(1,1,1));self.assertEqual((self.root/self.candidate(1)).read_bytes(),b"old")

    def test_local_exclusive_create_race_has_one_winner_and_never_changes_winner(self):
        local=media.get_local_storage()
        for number in range(20):
            with self.subTest(race=number):
                barrier=Barrier(2);path=f"agent-artifacts/race-{number}.txt"
                def create(data):
                    barrier.wait()
                    try:local.create(path,data);return True,data
                    except FileExistsError:return False,data
                with ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(create,[b"one",b"two"]))
                winners=[data for success,data in results if success];self.assertEqual(len(winners),1);self.assertEqual((self.root/path).read_bytes(),winners[0])

    def test_io_and_short_writes_do_not_create_successful_assets_or_jobs(self):
        local=media.get_local_storage();local.write("agent-artifacts/old.txt",b"protected");original=Path.open
        for mode in ["error","short"]:
            with self.subTest(mode=mode):
                class FaultyFile:
                    def __init__(self,stream):self.stream=stream
                    def __enter__(self):return self
                    def __exit__(self,*args):self.stream.close()
                    def write(self,data):
                        self.stream.write(data[:1])
                        if mode=="error":raise OSError("synthetic interrupted write")
                        return 1
                def open_file(path,*args,**kwargs):
                    stream=original(path,*args,**kwargs)
                    return FaultyFile(stream) if args and args[0]=="xb" else stream
                with patch.object(Path,"open",open_file):
                    with self.assertRaises(OSError):self.save(data=b"new bytes")
                self.assertEqual(self.counts(),(0,0,0));self.assertEqual((self.root/"agent-artifacts/old.txt").read_bytes(),b"protected")

    def test_gif_original_and_compressed_derivative_are_both_new(self):
        original=self.gif+b"\0"*128
        with patch.object(gif_compression,"compress_gif",return_value=self.gif) as compressor:self.save(data=original,mime="image/gif")
        self.assertTrue(compressor.called)
        path=self.paths()[0][2];self.assertTrue(path.endswith(".compressed.gif"),path);self.assertEqual((self.root/path).read_bytes(),self.gif)
        source=path.replace(".compressed.gif",".gif");self.assertEqual((self.root/source).read_bytes(),original)

    def test_gif_derivative_collision_returns_new_original_and_preserves_old_derivative(self):
        self.identities([1]);path=self.candidate(1,suffix=".compressed.gif");media.get_local_storage().write(path,b"protected old derivative")
        original=self.gif+b"\0"*128
        with patch.object(gif_compression,"compress_gif",return_value=self.gif):self.save(data=original,mime="image/gif")
        stored=self.paths()[0][2];self.assertEqual(stored,self.candidate(1,suffix=".gif"));self.assertEqual((self.root/stored).read_bytes(),original);self.assertEqual((self.root/path).read_bytes(),b"protected old derivative")

    def test_oss_conditional_create_preserves_remote_only_collision_and_retries(self):
        self.enable_oss();old=self.candidate(1);self.bucket.objects[old]=b"remote old";self.identities([1,2]);self.save(data=b"new bytes")
        self.assertEqual(self.bucket.objects[old],b"remote old");self.assertFalse((self.root/old).exists());new=self.candidate(2)
        self.assertEqual(self.paths()[0][2],new);self.assertEqual(self.bucket.objects[new],b"new bytes");self.assertEqual((self.root/new).read_bytes(),b"new bytes")
        self.assertTrue(all(headers["x-oss-forbid-overwrite"]=="true" for _,_,headers in self.bucket.calls));self.assertEqual(self.counts(),(1,1,1))

    def test_oss_failure_and_lost_response_are_not_blindly_retried_or_reported_saved(self):
        self.enable_oss()
        for failure in ["before","after"]:
            with self.subTest(failure=failure):
                self.bucket.fault=failure;before=len(self.bucket.calls)
                with self.assertRaises(OSError):self.save(data=b"unknown upload")
                self.assertEqual(len(self.bucket.calls)-before,1);self.assertEqual(self.counts(),(0,0,0));self.assertFalse(self.paths())

    def test_oss_versioned_unknown_or_unreadable_capability_does_not_put(self):
        self.enable_oss()
        for value in ["Enabled","Suspended","unknown","missing","error"]:
            with self.subTest(versioning=value):
                self.bucket.version_status=value;self.bucket.missing_status=value=="missing";self.bucket.version_error=value=="error"
                with self.assertRaises(OSError):self.save()
                self.assertEqual(self.bucket.calls,[]);self.assertEqual(self.counts(),(0,0,0))

    def test_existing_storage_path_reference_is_passed_through_unchanged(self):
        path="agent-artifacts/legacy.txt";media.get_local_storage().write(path,b"existing")
        with self.sql.sessions() as db:
            project=db.get(Project,self.project_id);actual=self.ns["_write_agent_artifact"](project,AgentProjectArtifactCreate(name="reference",storage_path=path))
        self.assertEqual(actual,path);self.assertEqual((self.root/path).read_bytes(),b"existing")

    def test_default_upload_overwrite_and_async_mirror_contract_are_unchanged(self):
        path="ordinary-upload/existing.txt";media.write_uploaded_asset(path,b"one");media.write_uploaded_asset(path,b"two");self.assertEqual((self.root/path).read_bytes(),b"two")
        calls=[]
        class ThreadFixture:
            def __init__(self,**kwargs):calls.append(kwargs)
            def start(self):pass
        with patch.object(media,"_oss_enabled",lambda:True),patch.object(media.threading,"Thread",ThreadFixture):media.write_uploaded_asset(path,b"three")
        self.assertEqual((self.root/path).read_bytes(),b"three");self.assertEqual(len(calls),1);self.assertEqual(calls[0]["target"],media._mirror_to_oss);self.assertTrue(calls[0]["kwargs"]["overwrite"])
