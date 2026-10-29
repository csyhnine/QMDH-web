"""R25 ordinary close: real minimal API/SQLite/asset/ledger/intent transactions."""
import hashlib
import json
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import patch
from uuid import UUID

import httpx
import redis
from fastapi import APIRouter, Body, Depends, FastAPI, HTTPException
from sqlalchemy import event, select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from app.core.config import AuthUserProfile, settings
from app.models import AuditLog, Asset, AssetType, GenerationIntent, GenerationSession, Project, ProviderCall, Task, TaskDispatch, TaskStatus, UsageLedger, Workflow
from app.services.generation_intent_service import record_generation_intent_for_task
from app.services.provider_adapters import comfyui as comfy
from tests.review_media_fixtures import PNG_BYTES
from tests.test_review_partial_image_progress import PartialImageProgressTests, load

NOTE="checked synthetic fixture queue and remaining work"


class RedisFixture:
    values={}
    @classmethod
    def from_url(cls,*args,**kwargs):return cls()
    def eval(self,script,count,key,value):
        if self.values.get(key)==value:self.values.pop(key);return 1
        return 0
    def close(self):pass


class ComfyPartialCloseTests(unittest.TestCase):
    def setUp(self):
        self.sql=PartialImageProgressTests("test_second_submit_failure_keeps_completed_output_usage_and_known_cost")
        self.sql.setUp();self.addCleanup(self.sql.doCleanups);self.task_id=self.sql.task_id
        tables=set()
        def include(table):
            if table in tables:return
            tables.add(table)
            for fk in table.foreign_keys:include(fk.column.table)
        for model in (AuditLog,GenerationIntent,GenerationSession):include(model.__table__)
        Task.metadata.create_all(self.sql.engine,tables=list(tables))
        executor=ModuleType("app.services.task_executor");executor._materialize_assets=self.sql.namespace["_materialize_assets"]
        dispatch=ModuleType("app.services.task_dispatch");dispatch._lock=load("app/services/task_dispatch.py",{"text":text},functions=["_lock"])["_lock"]
        self.enterContext(patch.dict(sys.modules,{executor.__name__:executor,dispatch.__name__:dispatch,"app.services.provider_adapters.comfyui":comfy}))
        self.auth=AuthUserProfile(name="fixture-admin",role="admin",token="synthetic-unused")
        def get_db():
            with self.sql.sessions() as db:yield db
        def get_auth():return self.auth
        self.router=APIRouter(prefix="/tasks")
        namespace={"__name__":__name__,"router":self.router,"Body":Body,"Depends":Depends,"Session":Session,"AuthUserProfile":AuthUserProfile,
                   "get_db":get_db,"get_current_auth_user":get_auth,"HTTPException":HTTPException,"Task":Task,"TaskDispatch":TaskDispatch,"TaskStatus":TaskStatus,"AuditLog":AuditLog,"settings":settings}
        load("app/routers/tasks.py",namespace,functions=["recover_comfyui_task"])
        app=FastAPI();app.include_router(self.router);self.endpoint=namespace["recover_comfyui_task"]
        self.assertTrue(any(route.endpoint is self.endpoint for route in self.router.routes))
        self.queue={"queue_running":[],"queue_pending":[]};self.history={};self.requests=[]
        original=httpx.Client;self.enterContext(patch.object(httpx,"Client",side_effect=lambda **kwargs:original(transport=httpx.MockTransport(self.http),**kwargs)))
        RedisFixture.values={comfy.GPU_LOCK:str(self.task_id)};self.enterContext(patch.object(redis,"Redis",RedisFixture))
        self.paths=[];self.seed()

    def seed(self,count=1):
        outputs=[];self.paths=[]
        for i in range(count):
            prompt=str(UUID(int=i+1));path=f"generated/comfyui/task-{self.task_id}/{prompt}.png";target=self.sql.temporary/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(PNG_BYTES);self.paths.append(path)
            outputs.append({"storage_path":path,"storage_paths":[path],"output_count":1,"requested_image_count":1,"elapsed_ms":1,"output_width":1,"output_height":1,"upstream_task_id":prompt,"adapter_mode":"comfyui","billing":{"cost":0,"currency":"CNY","note":"Local GPU price not configured"}})
        self.checkpoint={"stage":"between_images","seed":count,"workflow_id":"qwen_image_2_1_t2i","workflow_sha256":"synthetic-saved-sha","prompt_id":None,"client_id":None,"batch_outputs":outputs}
        with self.sql.sessions() as db:
            task=db.get(Task,self.task_id);task.status=TaskStatus.pending;task.payload={"prompt":"synthetic","image_count":3,"resolution":"2k"};task.result={"adapter_mode":"comfyui","comfyui":self.checkpoint};task.requested_provider="local-comfy";task.cost=0
            job=db.get(TaskDispatch,self.task_id)
            if not job:job=TaskDispatch(task_id=task.id,user_id=task.user_id,lane="comfyui",state="review");db.add(job)
            else:job.state="review"
            record_generation_intent_for_task(db,task=task,workflow_key=task.workflow.key);db.commit()
        self.original=self.snapshot()

    def http(self,request):
        self.assertEqual(request.method,"GET");self.requests.append(request.url.path)
        if request.url.path=="/queue":return httpx.Response(200,json=self.queue)
        if request.url.path.startswith("/history"):return httpx.Response(200,json=self.history)
        raise AssertionError(request.url)

    def call(self,action="close"):
        with self.sql.sessions() as db:return self.endpoint(self.task_id,action,NOTE,db,self.auth)

    def close(self):return self.call()

    def assert_conflict(self):
        with self.assertRaises(HTTPException) as raised:self.close()
        self.assertEqual(raised.exception.status_code,409)

    def snapshot(self):
        with self.sql.sessions() as db:
            task=db.get(Task,self.task_id);job=db.get(TaskDispatch,self.task_id)
            return {"status":task.status.value,"job":job.state,"result":json.loads(json.dumps(task.result)),"cost":task.cost,"currency":task.cost_currency,
                    "assets":[(x.id,x.storage_path) for x in db.scalars(select(Asset).where(Asset.source_task_id==task.id).order_by(Asset.id))],
                    "ledgers":[(x.id,x.source_table,x.cost,x.cost_currency,x.output_count,x.task_status.value,x.error_summary,json.loads(json.dumps(x.usage_payload))) for x in db.scalars(select(UsageLedger).where(UsageLedger.task_id==task.id).order_by(UsageLedger.id))],
                    "intents":[(x.id,x.task_status,x.has_asset,x.completed_at is not None) for x in db.scalars(select(GenerationIntent).where(GenerationIntent.task_id==task.id))],
                    "audits":len(db.scalars(select(AuditLog).where(AuditLog.event_type=="comfyui.recovery")).all()),
                    "calls":[(x.id,x.cost,x.cost_currency) for x in db.scalars(select(ProviderCall).where(ProviderCall.task_id==task.id))]}

    def assert_closed(self,outputs):
        state=self.snapshot();self.assertEqual(state["status"],"failed");self.assertEqual(state["job"],"done")
        self.assertEqual(state["result"]["storage_paths"],self.paths);self.assertEqual(state["result"]["output_count"],outputs)
        self.assertEqual(state["result"]["partial_outputs"],bool(outputs));self.assertEqual(state["result"]["requested_image_count"],3)
        self.assertEqual(state["result"]["comfyui"],self.checkpoint);self.assertEqual(state["result"]["recovery_note"],NOTE)
        task_ledgers=[x for x in state["ledgers"] if x[1]=="tasks"];self.assertEqual(len(task_ledgers),1)
        self.assertEqual(task_ledgers[0][4],outputs);self.assertEqual(task_ledgers[0][5],"failed");self.assertTrue(task_ledgers[0][6])
        usage=task_ledgers[0][7];self.assertEqual(usage["billing"],state["result"]["billing"])
        self.assertEqual(usage["comfyui_partial_close"]["storage_paths"],self.paths)
        self.assertEqual(usage["comfyui_partial_close"]["output_count"],outputs)
        self.assertEqual(usage["comfyui_partial_close"]["requested_image_count"],3)
        self.assertEqual(len(state["intents"]),1);self.assertEqual(state["intents"][0][1:],("failed",bool(outputs),True))
        self.assertEqual(state["audits"],1)
        for path in self.paths:self.assertEqual((self.sql.temporary/path).read_bytes(),PNG_BYTES)
        return state

    def test_close_one_of_three_preserves_media_assets_ledger_and_intent(self):
        response=self.close();self.assertEqual(response["state"],"done");state=self.assert_closed(1)
        self.assertEqual([p for _,p in state["assets"]],self.paths);self.assertEqual(state["calls"],[])
        self.assertTrue(state["result"]["billing"]["additional_cost_unknown"]);self.assertFalse(state["result"]["billing"]["cost_known"])

    def test_two_outputs_reuse_existing_asset_and_preserve_unrelated_attachment(self):
        self.seed(2)
        with self.sql.sessions() as db:
            task=db.get(Task,self.task_id);first=Asset(name="existing output",asset_type=AssetType.image,project_id=task.project_id,source_task_id=task.id,storage_path=self.paths[0],tags=[])
            other=Asset(name="unrelated attachment",asset_type=AssetType.image,project_id=task.project_id,source_task_id=task.id,storage_path="uploads/attachment.png",tags=[]);db.add_all([first,other]);db.flush();first_id=first.id;other_id=other.id;db.commit()
        response=self.close();self.assertEqual(response["state"],"done");state=self.assert_closed(2)
        self.assertEqual(len(state["assets"]),3);self.assertEqual(state["result"]["asset_ids"][0],first_id);self.assertNotIn(other_id,state["result"]["asset_ids"])
        self.assertEqual(state["result"]["asset_storage_paths"],self.paths);self.assertEqual(len(set(state["result"]["asset_ids"])),2)

    def test_repeated_close_is_409_and_does_not_duplicate_data(self):
        self.assertEqual(self.close()["state"],"done");before=self.snapshot();self.assert_conflict();self.assertEqual(self.snapshot(),before)

    def test_empty_batch_can_close_without_fabricated_assets_or_free_gpu_cost(self):
        self.seed(0);response=self.close();self.assertEqual(response["state"],"done");state=self.assert_closed(0)
        self.assertEqual(state["assets"],[]);self.assertEqual(state["calls"],[]);self.assertEqual(state["cost"],0)
        self.assertFalse(state["result"]["billing"]["cost_known"])

    def test_downloaded_complete_batch_and_successful_history_still_reject_close(self):
        for variant in ["downloaded","complete","history"]:
            with self.subTest(variant=variant):
                self.seed(3 if variant=="complete" else 1)
                with self.sql.sessions() as db:
                    task=db.get(Task,self.task_id);result=json.loads(json.dumps(task.result))
                    if variant=="downloaded":result["comfyui"]["stage"]="downloaded"
                    if variant=="history":result["comfyui"]["prompt_id"]=str(UUID(int=99));self.history={str(UUID(int=99)):{"status":{"completed":True,"status_str":"success"}}}
                    task.result=result;db.commit()
                before=self.snapshot();self.assert_conflict();self.assertEqual(self.snapshot(),before);self.assertIn(comfy.GPU_LOCK,RedisFixture.values)

    def test_nonempty_upstream_queue_keeps_review_and_all_rows(self):
        for key in ["queue_running","queue_pending"]:
            with self.subTest(queue=key):
                self.queue={"queue_running":[],"queue_pending":[],key:[["synthetic active work"]]};before=self.snapshot();self.assert_conflict();self.assertEqual(self.snapshot(),before)
                self.assertIn(comfy.GPU_LOCK,RedisFixture.values)

    def test_known_cost_currency_and_existing_provider_call_are_preserved(self):
        with self.sql.sessions() as db:
            task=db.get(Task,self.task_id);task.cost=2.5;task.cost_currency="USD";task.result={**task.result,"billing":{"cost":2.5,"currency":"USD","cost_known":True,"additional_cost_unknown":False,"billable_units":1,"pricing_unit":"per_request"}}
            db.add(ProviderCall(task_id=task.id,provider_name="local-comfy",model_name="qwen_image_2_1_t2i",capability="image.generate",cost=2.5,cost_currency="USD",outbound=True,request_summary={}));db.commit()
        response=self.close();self.assertEqual(response["state"],"done");state=self.assert_closed(1)
        self.assertEqual(state["cost"],2.5);self.assertEqual(state["currency"],"USD");self.assertEqual(len(state["calls"]),1)
        self.assertTrue(all(row[2:4]==(2.5,"USD") for row in state["ledgers"]));self.assertTrue(state["result"]["billing"]["cost_known"])

    def test_asset_ledger_intent_audit_and_commit_errors_roll_back_all_database_rows(self):
        for phase in ["asset","ledger","intent","audit","commit"]:
            with self.subTest(phase=phase):
                before=self.snapshot();fired=[]
                def fail(session,*args):
                    pending=list(session.new)+list(session.dirty)
                    model={"asset":Asset,"ledger":UsageLedger,"intent":GenerationIntent,"audit":AuditLog}.get(phase)
                    if not fired and (phase=="commit" or any(isinstance(x,model) for x in pending)):
                        fired.append(True);raise OperationalError("synthetic failure",{},RuntimeError(phase))
                event_name="before_commit" if phase=="commit" else "before_flush";event.listen(self.sql.sessions,event_name,fail)
                try:
                    with self.assertRaises(OperationalError):self.close()
                finally:event.remove(self.sql.sessions,event_name,fail)
                self.assertTrue(fired);self.assertEqual(self.snapshot(),before)
                for path in self.paths:self.assertEqual((self.sql.temporary/path).read_bytes(),PNG_BYTES)
                RedisFixture.values[comfy.GPU_LOCK]=str(self.task_id)
        self.assertEqual(self.close()["state"],"done");self.assert_closed(1)

    def test_resume_remains_queued_pending_without_partial_finalization(self):
        response=self.call("resume");self.assertEqual(response["state"],"queued")
        state=self.snapshot();self.assertEqual(state["status"],"pending");self.assertEqual(state["job"],"queued");self.assertEqual(state["assets"],[]);self.assertEqual(state["ledgers"],[])
        self.assertEqual(state["result"],self.original["result"]);self.assertEqual(state["audits"],1);self.assertEqual(self.requests,[])

    def test_finalizer_upserts_without_duplicate_assets_ledger_or_intents(self):
        self.assertEqual(self.close()["state"],"done");before=self.snapshot()
        from app.services.comfy_partial_finalization import finalize_closed_comfy_task
        with self.sql.sessions() as db:finalize_closed_comfy_task(db,db.get(Task,self.task_id),note=NOTE);db.commit()
        self.assertEqual(self.snapshot(),before)

    def test_missing_intent_is_created_with_terminal_output_state_and_session(self):
        with self.sql.sessions() as db:
            for intent in db.scalars(select(GenerationIntent).where(GenerationIntent.task_id==self.task_id)):db.delete(intent)
            db.commit()
        response=self.close();self.assertEqual(response["state"],"done");self.assert_closed(1)
        with self.sql.sessions() as db:
            intent=db.scalar(select(GenerationIntent).where(GenerationIntent.task_id==self.task_id));self.assertIsNotNone(intent.session_id)
            self.assertEqual(db.get(GenerationSession,intent.session_id).submit_count,1)

    def test_inconsistent_normal_checkpoint_is_409_without_partial_database_changes(self):
        for variant in ["missing_path","contradictory_result"]:
            with self.subTest(variant=variant):
                self.seed()
                with self.sql.sessions() as db:
                    task=db.get(Task,self.task_id);result=json.loads(json.dumps(task.result))
                    if variant=="missing_path":result["comfyui"]["batch_outputs"]=[{}]
                    else:result["storage_paths"]=[f"generated/comfyui/task-{self.task_id}/{UUID(int=90)}.png"]
                    task.result=result;db.commit()
                before=self.snapshot();self.assert_conflict();self.assertEqual(self.snapshot(),before)
                self.assertIn(comfy.GPU_LOCK,RedisFixture.values)
