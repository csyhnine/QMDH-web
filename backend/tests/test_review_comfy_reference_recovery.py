"""R26 ordinary recovery: same accepted prompt, no source-file dependency or real GPU."""
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import httpx
from app import database
from app.core.config import ImageProviderProfile, settings
from app.models import Task, TaskDispatch, TaskStatus, ReferenceUpload, Workflow
from app.services.provider_adapters import comfyui as c
from tests.review_media_fixtures import PNG_BYTES
from tests.test_comfyui_adapter import ComfyUIAdapterTests, FakeRedis, PROMPT_ID
from tests.test_review_partial_image_progress import PartialImageProgressTests

CLIENT_ID="6ca7d7ae-4321-4321-8765-5b0490570081"
OTHER_ID="9e3ee7de-4e2d-4d27-bf75-8a6bd1019f64"


class ComfyReferenceRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.sql=PartialImageProgressTests("test_second_submit_failure_keeps_completed_output_usage_and_known_cost")
        self.sql.setUp();self.addCleanup(self.sql.doCleanups)
        # Restore the actual Comfy module over F10's deliberately synthetic import boundary.
        self.enterContext(patch.dict(sys.modules,{"app.services.provider_adapters.comfyui":c}))
        helper=ComfyUIAdapterTests("test_success_uses_exact_prompt_output_and_persists_before_submit")
        helper.setUp();self.addCleanup(helper.tearDown)
        self.root=self.sql.temporary;self.workflow_root=self.root/"workflows";self.workflow_root.mkdir()
        self.graph=json.loads(json.dumps(helper.graph));self.graph.update({"source":{"class_type":"LoadImage","inputs":{"image":"sample.png"}},"canvas":{"class_type":"Switch","inputs":{"switch":False}},"scale":{"class_type":"Scale","inputs":{"resolution":0}}})
        self.mapping={**helper.mapping,"filename":"edit.json","capability":"image.edit","image_loaders":["source"],"reference_input_count":1,"canvas_switch":["canvas","switch"],"resolution":["scale","resolution"]}
        raw=json.dumps(self.graph).encode();(self.workflow_root/"edit.json").write_bytes(raw);self.mapping["sha256"]=hashlib.sha256(raw).hexdigest()
        self.model="qwen_image_2_1_image_edit";(self.workflow_root/"workflow-map.json").write_text(json.dumps({self.model:self.mapping}),encoding="utf-8")
        self.profile=ImageProviderProfile("local-comfy","synthetic-unused",c.BASE_URL,self.model,adapter_kind="comfyui",timeout_seconds=10)
        self.definition=SimpleNamespace(provider_name="local-comfy",model_name=self.model,outbound=True,capabilities=["image.edit"])
        self.adapter=c.ComfyUIProviderAdapter(self.definition,self.profile)
        self.reference="uploads/r26-reference.png";self.payload={"prompt":"synthetic","reference_images":[self.reference],"aspect_ratio":"source","resolution":"2k","seed":0,"image_count":1}
        ReferenceUpload.__table__.create(self.sql.engine,checkfirst=True)
        with self.sql.sessions() as db:
            task=db.get(Task,self.sql.task_id);task.payload=dict(self.payload);task.requested_provider="local-comfy"
            db.get(Workflow,task.workflow_id).provider_capability="image.edit"
            db.add(ReferenceUpload(storage_path=self.reference,user_id=task.user_id,sha256=hashlib.sha256(PNG_BYTES).hexdigest()))
            db.add(TaskDispatch(task_id=task.id,user_id=task.user_id,lane="comfyui",state="leased",lease_owner="owner",lease_until=datetime.now(timezone.utc)+timedelta(minutes=5)));db.commit()
        self.calls=[];self.source_reads=[];self.writes=[];self.saved=[];self.prompt_contexts=[]
        self.source_error=FileNotFoundError("synthetic missing reference");self.pending_polls=0;self.terminal_error=False;self.matches=1;self.expire_on_history=False
        FakeRedis.values={};self.enterContext(patch.object(c,"Redis",FakeRedis))
        self.enterContext(patch.object(database,"SessionLocal",self.sql.sessions))
        self.enterContext(patch.object(settings,"comfyui_workflow_root",str(self.workflow_root)))
        self.enterContext(patch.object(c,"read_binary_asset",self.read));self.enterContext(patch.object(c,"write_binary_asset",self.write))
        self.enterContext(patch.object(c,"sleep",lambda *args:None))
        original=httpx.Client;self.enterContext(patch.object(c.httpx,"Client",side_effect=lambda **kwargs:original(transport=httpx.MockTransport(self.http),**kwargs)))
        self.sql.namespace.update(ComfyUIProviderAdapter=c.ComfyUIProviderAdapter,get_provider_adapter=lambda *args:self.adapter)

    def state(self,stage="submitted",prompt_id=PROMPT_ID,**extra):
        state={"stage":stage,"workflow_id":self.model,"workflow_sha256":self.mapping["sha256"],"seed":0,"client_id":CLIENT_ID,**({"prompt_id":prompt_id} if prompt_id else {}),**extra}
        with self.sql.sessions() as db:
            task=db.get(Task,self.sql.task_id);task.result={"comfyui":state};db.commit()
        FakeRedis.values[c.GPU_LOCK]=str(self.sql.task_id)
        return state

    def read(self,path):
        if path==self.reference:
            self.source_reads.append(path)
            if self.source_error is not None:raise self.source_error
            return PNG_BYTES
        target=(self.root/path).resolve();self.assertTrue(target.is_relative_to(self.root.resolve()));return target.read_bytes()

    def write(self,path,data):
        target=(self.root/path).resolve();self.assertTrue(target.is_relative_to(self.root.resolve()));target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);self.writes.append(path);return path

    def history(self):
        return {PROMPT_ID:{"status":{"completed":True,"status_str":"error" if self.terminal_error else "success"},"outputs":{"461":{"images":[{"filename":"fixture.png","subfolder":"qmdh","type":"output"}]}}}}

    def http(self,request):
        path=request.url.path;self.calls.append((request.method,path))
        if path=="/system_stats":return httpx.Response(200,json={"devices":[]})
        if path=="/upload/image":return httpx.Response(200,json={"name":"synthetic.png","subfolder":"qmdh"})
        if path=="/prompt":
            with self.sql.sessions() as db:state=db.get(Task,self.sql.task_id).result["comfyui"]
            self.assertEqual(state["stage"],"submitting");self.assertEqual(state["client_id"],json.loads(request.content)["client_id"])
            self.prompt_contexts.append(json.loads(json.dumps(state)))
            return httpx.Response(200,json={"prompt_id":PROMPT_ID,"node_errors":{}})
        if path=="/queue":
            entries=[[0,pid,{}, {"client_id":CLIENT_ID}] for pid in [PROMPT_ID,OTHER_ID][:self.matches]]
            return httpx.Response(200,json={"queue_running":entries,"queue_pending":[]})
        if path=="/history":return httpx.Response(200,json={})
        if path=="/history/"+PROMPT_ID:
            if self.expire_on_history:
                with self.sql.sessions() as db:job=db.get(TaskDispatch,self.sql.task_id);job.lease_until=datetime.now(timezone.utc)-timedelta(seconds=1);db.commit()
            if self.pending_polls:
                self.pending_polls-=1;return httpx.Response(200,json={PROMPT_ID:{"status":{"completed":False,"status_str":"running"}}})
            return httpx.Response(200,json=self.history())
        if path=="/view":return httpx.Response(200,content=PNG_BYTES)
        raise AssertionError((request.method,path))

    def save(self,state):
        self.saved.append(json.loads(json.dumps(state)))
        with self.sql.sessions() as db:task=db.get(Task,self.sql.task_id);task.result={"comfyui":state};db.commit()

    def direct(self):
        with self.sql.sessions() as db:state=db.get(Task,self.sql.task_id).result.get("comfyui",{})
        self.adapter.bind_task(self.sql.task_id,state,self.save);return self.adapter.execute("image.edit",dict(self.payload))

    def test_submitted_missing_source_recovers_same_prompt_and_materializes_assets(self):
        self.state();self.sql.execute();state=self.sql.snapshot()
        self.assertEqual(state.status,TaskStatus.completed);self.assertEqual(self.source_reads,[])
        self.assertEqual(self.calls,[("GET","/history/"+PROMPT_ID),("GET","/view")]);self.assertEqual(len(state.assets),1)
        self.assertEqual(state.result["upstream_task_id"],PROMPT_ID);self.assertEqual(len(state.calls),1);self.assertTrue(state.ledgers)
        self.assertNotIn(c.GPU_LOCK,FakeRedis.values)
        with self.sql.sessions() as db:self.assertEqual(db.get(Task,self.sql.task_id).payload,self.payload)

    def test_storage_outage_and_running_history_do_not_read_source_or_resubmit(self):
        self.state();self.source_error=OSError("synthetic storage outage");self.pending_polls=2;outcome=self.direct()
        self.assertEqual(self.source_reads,[]);self.assertEqual(outcome.result["upstream_task_id"],PROMPT_ID)
        self.assertEqual(self.calls.count(("GET","/history/"+PROMPT_ID)),3);self.assertFalse(any(method=="POST" for method,path in self.calls));self.assertNotIn(c.GPU_LOCK,FakeRedis.values)

    def test_lost_submit_response_reconciles_original_client_without_source_read(self):
        self.state(stage="submitting",prompt_id=None);outcome=self.direct()
        self.assertEqual(self.source_reads,[]);self.assertEqual(outcome.result["upstream_task_id"],PROMPT_ID)
        self.assertEqual(self.calls,[("GET","/queue"),("GET","/history"),("GET","/history/"+PROMPT_ID),("GET","/view")])
        self.assertTrue(any(row.get("prompt_id")==PROMPT_ID for row in self.saved));self.assertNotIn(c.GPU_LOCK,FakeRedis.values)

    def test_uncertain_zero_or_multiple_matches_keep_owner_without_new_prompt(self):
        for matches in [0,2]:
            with self.subTest(matches=matches):
                self.state(stage="submitting",prompt_id=None);self.matches=matches;self.calls.clear()
                with self.assertRaises(c.ComfyDeferred):self.direct()
                self.assertEqual(self.calls,[("GET","/queue"),("GET","/history")]);self.assertEqual(self.source_reads,[])
                self.assertEqual(FakeRedis.values.get(c.GPU_LOCK),str(self.sql.task_id));self.assertEqual(self.writes,[])

    def test_downloaded_hash_verified_file_uses_no_source_or_http(self):
        path=f"generated/comfyui/task-{self.sql.task_id}/{PROMPT_ID}.png";target=self.root/path;target.parent.mkdir(parents=True);target.write_bytes(PNG_BYTES)
        self.state(stage="downloaded",storage_path=path,output_sha256=hashlib.sha256(PNG_BYTES).hexdigest());self.sql.execute();state=self.sql.snapshot()
        self.assertEqual(state.status,TaskStatus.completed);self.assertEqual(state.assets[0][1],path);self.assertEqual(self.calls,[]);self.assertEqual(self.source_reads,[]);self.assertEqual(self.writes,[])
        self.assertNotIn(c.GPU_LOCK,FakeRedis.values)

    def test_fresh_submit_validates_source_and_saves_effective_context_before_post(self):
        self.source_error=None;outcome=self.direct();self.assertTrue(self.source_reads)
        self.assertEqual(len(self.prompt_contexts),1);context=self.prompt_contexts[0]["execution_context"]
        self.assertEqual(context["width"],2048);self.assertEqual(context["height"],2048);self.assertEqual(context["resolution"],"2k")
        self.assertEqual(context["workflow_sha256"],self.mapping["sha256"]);self.assertEqual(context["workflow_id"],self.model);self.assertEqual(context["seed"],0)
        self.assertEqual(self.calls.count(("POST","/prompt")),1);self.assertEqual(outcome.result["output_count"],1)
        with self.sql.sessions() as db:self.assertEqual(db.get(Task,self.sql.task_id).payload,self.payload)

    def test_fresh_missing_reference_never_submits_and_valid_retry_still_checks_source(self):
        with self.assertRaises(c.ComfyDeferred):self.direct()
        self.assertTrue(self.source_reads);self.assertFalse(any(method=="POST" for method,path in self.calls));self.assertNotIn(c.GPU_LOCK,FakeRedis.values)
        self.source_error=None;self.direct();self.assertEqual(self.calls.count(("POST","/prompt")),1);self.assertGreaterEqual(len(self.source_reads),2)

    def test_expired_lease_and_expiry_before_download_never_write_or_submit(self):
        self.state()
        with self.sql.sessions() as db:job=db.get(TaskDispatch,self.sql.task_id);job.lease_until=datetime.now(timezone.utc)-timedelta(seconds=1);db.commit()
        with self.assertRaises(c.ComfyDeferred):self.direct()
        self.assertEqual(self.calls,[]);self.assertEqual(self.writes,[]);self.assertEqual(self.source_reads,[])
        self.assertEqual(FakeRedis.values.get(c.GPU_LOCK),str(self.sql.task_id))
        with self.sql.sessions() as db:job=db.get(TaskDispatch,self.sql.task_id);job.lease_until=datetime.now(timezone.utc)+timedelta(minutes=5);db.commit()
        self.expire_on_history=True
        self.sql.execute("owner")  # Original executor rolls back and returns after lease loss.
        self.assertEqual(self.calls,[("GET","/history/"+PROMPT_ID)]);self.assertEqual(self.writes,[])
        state=self.sql.snapshot();self.assertEqual(state.status,TaskStatus.running);self.assertEqual(state.assets,[]);self.assertEqual(state.calls,[])
        self.assertEqual(state.result["comfyui"]["stage"],"submitted")

    def test_resumed_batch_retains_completed_output_but_next_image_needs_source(self):
        self.state();self.payload={**self.payload,"image_count":2}
        with self.sql.sessions() as db:task=db.get(Task,self.sql.task_id);task.payload=self.payload;db.commit()
        with self.assertRaises(c.ComfyDeferred):self.direct()
        self.assertEqual(self.calls,[("GET","/history/"+PROMPT_ID),("GET","/view"),("GET","/system_stats")])
        with self.sql.sessions() as db:state=db.get(Task,self.sql.task_id).result["comfyui"]
        self.assertEqual(len(state["batch_outputs"]),1);self.assertTrue((self.root/state["batch_outputs"][0]["storage_path"]).is_file())
        self.assertTrue(self.source_reads);self.assertFalse(any(method=="POST" for method,path in self.calls))

    def test_confirmed_upstream_failure_remains_failure_and_releases_only_terminal_owner(self):
        self.state();self.terminal_error=True;self.sql.execute();state=self.sql.snapshot()
        self.assertEqual(state.status,TaskStatus.failed);self.assertEqual(self.source_reads,[]);self.assertEqual(self.writes,[])
        self.assertEqual(self.calls,[("GET","/history/"+PROMPT_ID)]);self.assertNotIn(c.GPU_LOCK,FakeRedis.values)
        self.assertEqual(state.result["comfyui"]["stage"],"upstream_failed")
