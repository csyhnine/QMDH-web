"""R24: real request plans, effective tiers and durable billing in offline SQLite."""
import ast
from base64 import b64encode
from dataclasses import dataclass, replace
import json
from pathlib import Path
import struct
import unittest
from types import SimpleNamespace

from sqlalchemy import select
from app.models import Task, TaskStatus, Workflow, UsageLedger
from app.services import provider_strategy
from tests.review_media_fixtures import PNG_BYTES, PNG_BASE64
from tests.test_review_partial_image_progress import PartialImageProgressTests, load, BACKEND
from tests.test_review_async_image_recovery import HaodeyaImageRecoveryTests


class EffectiveImageResolutionTests(unittest.TestCase):
    def setUp(self):
        self.cases=[]

    def case(self, *, model="wan2.7-image-pro", resolution="4k", refs=True, flavor="wan_image", async_mode=False, supported=None, count=1):
        case=HaodeyaImageRecoveryTests("test_unknown_submit_without_receipt_is_never_posted_again") if async_mode else PartialImageProgressTests("test_second_submit_failure_keeps_completed_output_usage_and_known_cost")
        case.setUp(); self.addCleanup(case.doCleanups); self.cases.append(case)
        case.profile=replace(case.profile,model_name=model,capabilities=("image.generate","image.edit"),
            strategies={"image.generate":"haodeya_async_image" if async_mode else "haodeya_sync_image" if flavor=="deepkey" else "openai_images","image.edit":"haodeya_sync_image" if flavor=="deepkey" else "openai_image_edits"},
            adapter_config={"provider_flavor":flavor,"unit_price_1k":1,"unit_price_2k":2,"unit_price_4k":9,**({"supported_resolutions":supported} if supported is not None else {})})
        case.definition.capabilities=("image.generate","image.edit")
        payload={"prompt":"synthetic","resolution":resolution,"aspect_ratio":"1:1","image_count":count}
        if refs:payload["reference_images"]=["fixture-reference.png"]
        with case.sessions() as db:
            task=db.get(Task,case.task_id);task.payload=payload;db.commit()
        ns=case.namespace
        boundaries={key:ns[key] for key in ["get_provider_definition","ensure_usage_ledger_for_task","_submit_image_generation_request","_persist_generated_image"]}
        ns.update({key:value for key,value in vars(provider_strategy).items() if not key.startswith("__")})
        ns.update(__name__=__name__,dataclass=dataclass,replace=replace,struct=struct)
        # Pure aspect functions/constants; reference transport is never called.
        tree=ast.parse((BACKEND/"app/services/image_aspect_ratio.py").read_bytes())
        selected=[node for node in tree.body if isinstance(node,(ast.FunctionDef,ast.Assign,ast.AnnAssign))]
        exec(compile(ast.fix_missing_locations(ast.Module(body=[ast.ImportFrom(module="__future__",names=[ast.alias(name="annotations")],level=0),*selected],type_ignores=[])),"r24_actual_aspect","exec"),ns)
        tree=ast.parse((BACKEND/"app/services/task_executor.py").read_bytes())
        functions=[node.name for node in tree.body if isinstance(node,ast.FunctionDef) and (node.name not in {"execute_task","get_provider_adapter","_materialize_preview_asset"})]
        load("app/services/task_executor.py",ns,functions=functions,classes=["ImageRequestPlan"])
        selected=[node for node in tree.body if isinstance(node,(ast.Assign,ast.AnnAssign)) and not (isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="logger" for t in node.targets))]
        exec(compile(ast.fix_missing_locations(ast.Module(body=selected,type_ignores=[])),"r24_actual_constants","exec"),ns)
        ns.update(boundaries)
        ns["_load_reference_image_bytes"]=lambda ref:(PNG_BYTES,"reference.png","image/png")
        ns["_reference_image_to_public_url"]=lambda ref:"https://fixture.invalid/reference.png"
        case.sent=[];case.fail_second=False
        if not async_mode:
            def submit(**kwargs):
                case.sent.append(json.loads(json.dumps(kwargs["body"])))
                if case.fail_second and len(case.sent)==2:raise RuntimeError("synthetic second POST failure")
                return {"id":f"accepted-{len(case.sent)}","model":kwargs["body"]["model"],"usage":{"tokens":17},"data":[{"b64_json":PNG_BASE64}]}
            def persist(**kwargs):
                path=f"generated/r24-{len(case.persisted)+1}.png";target=case.temporary/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(PNG_BYTES);case.persisted.append(path);return path,(1,1)
            ns["_submit_image_generation_request"]=submit;ns["_persist_generated_image"]=persist
        else:
            original=case.submit_async
            def submit(**kwargs):case.sent.append(json.loads(json.dumps(kwargs["body"])));return original(**kwargs)
            ns["_submit_image_generation_request"]=submit
        # The old F10 helper boundary took only payload. New fixture uses the real
        # consumer instead; no production function or financial assertion mocked.
        case.make_adapter()
        return case,payload

    def plan(self,case,payload):
        return case.namespace["_build_image_request_plan"](profile=case.profile,definition=case.definition,capability="image.generate",payload=payload,prompt="synthetic")

    def assert_state(self,case,*,requested,effective,cost,size=None):
        state=case.snapshot();self.assertEqual(state.status,TaskStatus.completed);self.assertEqual(state.cost,cost)
        self.assertEqual(state.result["requested_resolution"],requested);self.assertEqual(state.result["effective_resolution"],effective)
        self.assertEqual(state.result["resolution"],effective);self.assertEqual(state.result["billing"]["resolution_tier"],effective);self.assertEqual(state.cost,cost)
        self.assertEqual(len(state.calls),1);self.assertEqual(state.calls[0][1],cost)
        self.assertEqual(state.calls[0][2]["execution"]["result"]["resolution"],effective)
        self.assertTrue(state.ledgers)
        for source,amount,usage,error in state.ledgers:
            self.assertEqual(amount,cost);self.assertEqual(usage["resolution"],effective)
            self.assertEqual(usage["requested_resolution"],requested);self.assertEqual(usage["effective_resolution"],effective)
            self.assertEqual(usage["billing"]["resolution_tier"],effective)
        with case.sessions() as db:self.assertEqual(db.get(Task,case.task_id).payload["resolution"],requested)
        if size:self.assertEqual(case.sent[0]["size"],size)
        return state

    def test_wan_pro_reference_4k_uses_2k_request_result_and_all_accounts(self):
        case,payload=self.case();case.execute();self.assert_state(case,requested="4k",effective="2k",cost=2,size="2048x2048")

    def test_non_pro_wan_4k_downgrades_but_legal_pro_text_4k_remains(self):
        for model,effective,cost,size in [("wan2.7-image","2k",2,"2048x2048"),("wan2.7-image-pro","4k",9,"4096x4096")]:
            with self.subTest(model=model):
                case,payload=self.case(model=model,refs=False);case.execute();self.assert_state(case,requested="4k",effective=effective,cost=cost,size=size)

    def test_normal_2k_and_supported_resolution_clamp_use_one_plan(self):
        for requested,supported,effective,cost,size in [("2k",None,"2k",2,"2048x2048"),("4k",["1k","2k"],"1k",1,"1024x1024"),("1k",["2k","4k"],"2k",2,"2048x2048")]:
            with self.subTest(requested=requested,supported=supported):
                case,payload=self.case(resolution=requested,refs=False,supported=supported);before=json.loads(json.dumps(payload));plan=self.plan(case,payload)
                self.assertEqual(payload,before);self.assertEqual(plan.resolution_plan["effective_resolution"],effective)
                case.execute();self.assert_state(case,requested=requested,effective=effective,cost=cost,size=size)

    def test_count_edits_fixed_1k_sku_and_price_are_explicit(self):
        case,payload=self.case(model="gpt-image-2-count-2k",flavor="deepkey",resolution="2k");case.execute()
        state=self.assert_state(case,requested="2k",effective="1k",cost=1,size="1024x1024")
        self.assertEqual(state.result["image_model_resolved"],"gpt-image-2-count");self.assertEqual(case.sent[0]["model"],"gpt-image-2-count")

    def test_seedream_and_grok_effective_tiers_match_existing_send_contracts(self):
        for model,flavor,requested,effective,cost,size in [("doubao-seedream-4","seedream","1k","2k",2,"2K"),("grok-imagine-image","grok_image","4k","1k",1,"1024x1024")]:
            with self.subTest(model=model):
                case,payload=self.case(model=model,flavor=flavor,resolution=requested,refs=False);case.execute();self.assert_state(case,requested=requested,effective=effective,cost=cost,size=size)

    def test_incompatible_supported_and_hard_limits_reject_without_post(self):
        for model,flavor,requested,supported,refs in [("wan2.7-image-pro","wan_image","4k",["4k"],True),("gpt-image-2-count","deepkey","2k",["2k"],True),("doubao-seedream-4","seedream","1k",["1k"],False)]:
            with self.subTest(model=model):
                case,payload=self.case(model=model,flavor=flavor,resolution=requested,supported=supported,refs=refs)
                with self.assertRaises(ValueError):self.plan(case,payload)
                self.assertEqual(case.sent,[])

    def test_payload_and_result_field_consumers_preserve_effective_resolution(self):
        case,payload=self.case();before=json.loads(json.dumps(payload));plan=self.plan(case,payload)
        self.assertEqual(payload,before)
        result={"effective_resolution":"2k","requested_resolution":"4k","resolution":"2k"}
        actual=case.namespace["_task_payload_result_fields"]({**payload,"resolution":result["effective_resolution"]})
        self.assertEqual(actual["resolution"],"2k");self.assertEqual(actual["prompt"],payload["prompt"])
        self.assertEqual(case.namespace["_task_payload_result_fields"](payload)["resolution"],"4k")
        self.assertEqual(plan.resolution_plan["image_size"],"2048x2048")
        for empty_result in [None,[]]:
            with self.subTest(initial_result=empty_result):
                case,payload=self.case()
                with case.sessions() as db:
                    task=db.get(Task,case.task_id);task.result=empty_result;db.commit()
                case.execute();self.assert_state(case,requested="4k",effective="2k",cost=2,size="2048x2048")

    def test_partial_failure_preserves_effective_price_and_original_request(self):
        case,payload=self.case(count=2);case.fail_second=True;case.execute();state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.failed);self.assertEqual(len(state.assets),1);self.assertEqual(state.cost,2)
        self.assertEqual(state.result["resolution"],"2k");self.assertEqual(state.result["requested_resolution"],"4k")
        self.assertTrue(state.result["billing"]["additional_cost_unknown"])
        self.assertEqual(state.calls[0][1],2);self.assertTrue(all(row[1]==2 and row[2]["resolution"]=="2k" for row in state.ledgers))
        original=state.result["generation_progress"]["resolution_plan"];case.profile=replace(case.profile,adapter_config={**case.profile.adapter_config,"unit_price_2k":88});case.make_adapter();case.execute()
        state=case.snapshot();self.assertEqual(len(case.sent),2);self.assertEqual(state.cost,2);self.assertEqual(state.result["generation_progress"]["resolution_plan"],original)

    def test_changed_plan_identity_stops_without_appending_new_paid_step(self):
        case,payload=self.case(count=2);case.execute();original=case.snapshot().result["generation_progress"]["resolution_plan"]
        with case.sessions() as db:
            task=db.get(Task,case.task_id);task.status=TaskStatus.pending;task.payload={**task.payload,"image_count":3,"resolution":"1k"};db.commit()
        case.make_adapter();case.execute();state=case.snapshot()
        self.assertEqual(len(case.sent),2);self.assertEqual(len(state.assets),2);self.assertEqual(state.cost,4)
        self.assertEqual(state.result["generation_progress"]["resolution_plan"],original);self.assertEqual(state.result["resolution"],"2k")
        self.assertIn("resolution",state.result["error_detail"].lower())

    def test_async_plan_price_and_retry_keep_saved_resolution_snapshot(self):
        case,payload=self.case(model="gpt-image-2-vip",flavor="haodeya_async_image",async_mode=True,resolution="4k",supported=["1k","2k"],refs=False,count=2)
        case.phase="poll";case.execute();state=case.snapshot();self.assertEqual(state.status,TaskStatus.pending)
        self.assertEqual(state.result["generation_progress"]["resolution_plan"]["effective_resolution"],"1k")
        original=state.result["generation_progress"]["resolution_plan"]
        with case.sessions() as db:
            task=db.get(Task,case.task_id);task.payload={**task.payload,"resolution":"2k"};db.commit()
        case.make_adapter();case.execute();state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.pending);self.assertEqual(case.submissions,[1]);self.assertEqual(len(case.requests),1)
        self.assertEqual(state.result["upstream_task_id"],"accepted-1");self.assertEqual(state.result["generation_progress"]["resolution_plan"],original)
        self.assertIn("resolution",state.result["error_detail"].lower())
        with case.sessions() as db:
            task=db.get(Task,case.task_id);task.payload={**task.payload,"resolution":"4k"};db.commit()
        case.phase=None;case.profile=replace(case.profile,adapter_config={**case.profile.adapter_config,"unit_price_1k":77});case.make_adapter();case.execute()
        state=self.assert_state(case,requested="4k",effective="1k",cost=2)
        self.assertEqual(case.submissions,[1]);self.assertEqual(case.sent[0]["model"],"gpt-image-2-vip")

    def test_legacy_progress_without_resolution_snapshot_requires_review(self):
        case,payload=self.case();case.execute()
        with case.sessions() as db:
            task=db.get(Task,case.task_id);result=json.loads(json.dumps(task.result));result["generation_progress"].pop("resolution_plan",None);task.result=result
            task.status=TaskStatus.pending;task.payload={**task.payload,"image_count":2};db.commit()
        case.make_adapter();case.execute();state=case.snapshot()
        self.assertEqual(len(case.sent),1);self.assertEqual(state.cost,2);self.assertEqual(len(state.assets),1)
        self.assertNotEqual(state.status,TaskStatus.completed);self.assertIn("resolution",state.result["error_detail"].lower())

        case,payload=self.case(model="gpt-image-2-vip",flavor="haodeya_async_image",async_mode=True,resolution="2k",refs=False,count=2)
        case.phase="poll";case.execute()
        with case.sessions() as db:
            task=db.get(Task,case.task_id);result=json.loads(json.dumps(task.result));result["generation_progress"].pop("resolution_plan");task.result=result;db.commit()
        case.phase=None;case.make_adapter();case.execute();state=case.snapshot()
        self.assertEqual(state.status,TaskStatus.pending);self.assertEqual(case.submissions,[1]);self.assertEqual(len(case.requests),1)
        self.assertEqual(state.result["upstream_task_id"],"accepted-1");self.assertEqual(state.cost,0);self.assertEqual(len(state.assets),0)
        self.assertIn("resolution",state.result["error_detail"].lower())

    def test_per_request_two_outputs_are_billed_once_at_effective_tier(self):
        case,payload=self.case(count=2);case.profile=replace(case.profile,pricing_unit="per_request");case.make_adapter();case.execute()
        state=self.assert_state(case,requested="4k",effective="2k",cost=2,size="2048x2048")
        self.assertEqual(state.result["billing"]["billable_units"],1);self.assertEqual(len(state.assets),2)
