"""R88a real local SDK model adapters, source bridges, and temporary telemetry."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import time
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.models import ChatTurnTelemetry
from app.services.chat_model_observation import ModelCallObservation, observe_model
from app.services.chat_telemetry_service import ChatTurnTracker, begin_chat_turn
from tests.test_review_agent_memory_completion import AgentMemoryCompletionTests, TimerOnlyLoop, definitions


class AgentModelObservationTests(AgentMemoryCompletionTests):
    def setUp(self):
        super().setUp()
        ChatTurnTelemetry.__table__.create(self.engine)
        self.turn=begin_chat_turn(self.db,conversation_id=self.conv_id,user_id=self.user_id,user_message_id=None,
            provider_name="synthetic",model_name="local-function",content_length=5,attachments=[],agent_mode=True)
        self.tracker=ChatTurnTracker(self.turn.id)

    def local(self, function, observation=None, *, tools=False):
        from pydantic_ai import Agent
        from pydantic_ai.models.function import FunctionModel
        observation=observation or ModelCallObservation(self.turn.id)
        def action(model_observation):
            agent=Agent(observe_model(FunctionModel(function),model_observation))
            if tools:
                @agent.tool_plain
                def synthetic_tool(value: int) -> int:
                    return value+1
            with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
                # Actual run_sync uses the configured loop, with no socket self-pipe.
                asyncio.set_event_loop(runner.get_loop())
                try:return agent.run_sync("private synthetic input")
                finally:asyncio.set_event_loop(None)
        return observation.run(action),observation

    def response(self, text="private synthetic output"):
        from pydantic_ai.messages import ModelResponse, TextPart
        return ModelResponse(parts=[TextPart(text)])

    def metadata(self):
        with self.sessions() as db:
            turn=db.get(ChatTurnTelemetry,self.turn.id)
            return turn,[e for e in turn.stage_events_json if e.get("label")=="model.observation"]

    def test_actual_sdk_run_sync_records_request_not_server_chunks(self):
        result,observation=self.local(lambda messages,info:self.response())
        self.assertEqual(result.output,"private synthetic output")
        data=observation.snapshot()
        self.assertEqual((data["capture_state"],data["call_count"],data["upstream_called"]),("complete",1,True))
        self.assertEqual(data["calls"][0]["status"],"succeeded")
        self.assertIsNotNone(data["first_response_ms"])
        self.assertIsNone(data["ttft_ms"])
        self.assertNotIn("private",json.dumps(data))

    def test_actual_sdk_tool_roundtrip_keeps_each_request_identity(self):
        from pydantic_ai.messages import ModelResponse, ToolCallPart
        invocations=[]
        def model(messages,info):
            invocations.append(messages)
            return ModelResponse(parts=[ToolCallPart("synthetic_tool",{"value":4},tool_call_id="local-tool")]) if len(invocations)==1 else self.response("done")
        result,observation=self.local(model,tools=True)
        data=observation.snapshot()
        self.assertEqual(result.output,"done")
        self.assertEqual(data["call_count"],2)
        self.assertEqual([c["sequence"] for c in data["calls"]],[1,2])
        self.assertEqual(len({c["call_id"] for c in data["calls"]}),2)
        self.assertTrue(all(c["status"]=="succeeded" for c in data["calls"]))

    def test_actual_adapter_error_is_observed_without_exception_body(self):
        observation=ModelCallObservation(self.turn.id)
        def fail(messages,info):raise RuntimeError("private synthetic credential and prompt")
        with self.assertRaisesRegex(RuntimeError,"private synthetic"):self.local(fail,observation)
        data=observation.snapshot()
        self.assertTrue(data["upstream_called"])
        self.assertEqual(data["calls"][0]["status"],"error")
        self.assertIsNone(data["first_response_ms"])
        self.assertNotIn("private",json.dumps(data))

    def test_actual_adapter_cancellation_records_cancelled_not_success(self):
        observation=ModelCallObservation(self.turn.id)
        async def cancelled(messages,info):raise asyncio.CancelledError()
        with self.assertRaises(asyncio.CancelledError):self.local(cancelled,observation)
        self.assertEqual(observation.snapshot()["calls"][0]["status"],"cancelled")
        self.assertTrue(observation.snapshot()["upstream_called"])

    def test_pre_model_failure_is_known_zero_only_after_worker_finishes(self):
        observation=ModelCallObservation(self.turn.id)
        self.assertIsNone(observation.snapshot()["upstream_called"])
        def fail(**kwargs):raise RuntimeError("synthetic policy failure")
        with self.assertRaises(RuntimeError):observation.run(fail)
        data=observation.snapshot()
        self.assertFalse(data["upstream_called"])
        self.assertEqual(data["call_count"],0)
        self.assertEqual(data["capture_state"],"complete")
        self.assertIsNone(data["request_duration_ms"])

    def test_completed_call_duration_excludes_tools_memory_and_delivery_delay(self):
        observation=ModelCallObservation(self.turn.id,started_at=0)
        now=[1.0]
        def action(model_observation):
            identity=model_observation.begin();now[0]=3.0;model_observation.end(identity,"succeeded")
            now[0]=20.0
        with patch("app.services.chat_model_observation.time.perf_counter",side_effect=lambda:now[0]):
            observation.run(action);data=observation.snapshot()
        self.assertEqual(data["request_duration_ms"],2000)
        self.assertEqual(data["first_response_ms"],3000)
        self.assertIsNone(data["ttft_ms"])

    def test_after_model_failure_preserves_called_and_completed_request(self):
        observation=ModelCallObservation(self.turn.id)
        def action(model_observation):
            identity=model_observation.begin();model_observation.end(identity,"succeeded")
            raise RuntimeError("synthetic memory error")
        with self.assertRaises(RuntimeError):observation.run(action)
        self.assertTrue(observation.snapshot()["upstream_called"])
        self.assertEqual(observation.snapshot()["calls"][0]["status"],"succeeded")

    def test_cancel_before_request_is_censored_unknown_not_known_false(self):
        import threading
        observation=ModelCallObservation(self.turn.id);entered=threading.Event();gate=threading.Event()
        def action(model_observation):
            entered.set();gate.wait(5)
            identity=model_observation.begin();model_observation.end(identity,"succeeded")
        with ThreadPoolExecutor(max_workers=1) as pool:
            future=pool.submit(observation.run,action)
            try:
                self.assertTrue(entered.wait(5));data=observation.snapshot(close=True)
                self.assertIsNone(data["upstream_called"]);self.assertEqual(data["capture_state"],"censored")
            finally:gate.set()
            future.result(timeout=5)
        self.assertEqual(observation.snapshot(),data)

    def test_cancel_in_request_freezes_snapshot_and_late_worker_cannot_rewrite(self):
        import threading
        observation=ModelCallObservation(self.turn.id);entered=threading.Event();gate=threading.Event()
        def action(model_observation):
            identity=model_observation.begin();entered.set();gate.wait(5);model_observation.end(identity,"succeeded")
        with ThreadPoolExecutor(max_workers=1) as pool:
            future=pool.submit(observation.run,action)
            try:
                self.assertTrue(entered.wait(5));data=observation.snapshot(close=True)
                self.assertTrue(data["upstream_called"]);self.assertFalse(data["duration_complete"])
                self.assertEqual(data["calls"][0]["status"],"censored")
            finally:gate.set()
            future.result(timeout=5)
        self.assertEqual(observation.snapshot(),data)
        data["calls"].clear()
        self.assertEqual(len(observation.snapshot()["calls"]),1)

    def test_duplicate_ack_and_identity_bound_do_not_inflate_count_or_hide_truncation(self):
        observation=ModelCallObservation(self.turn.id)
        def action(model_observation):
            for _ in range(257):
                ident=model_observation.begin();model_observation.end(ident,"succeeded");model_observation.end(ident,"error")
        observation.run(action);data=observation.snapshot()
        self.assertEqual(data["call_count"],257)
        self.assertEqual(len(data["calls"]),256)
        self.assertTrue(data["identities_truncated"])
        self.assertTrue(all(c["status"]=="succeeded" for c in data["calls"]))

    def test_tracker_persists_versioned_metadata_with_actual_request_count(self):
        observation=self.tracker.observe_agent()
        self.assertIs(self.tracker.observe_agent(),observation)
        self.local(lambda messages,info:self.response(),observation)
        self.tracker.finalize(self.db,outcome="agent_success")
        turn,events=self.metadata();event,=events
        self.assertTrue(turn.upstream_called)
        self.assertEqual((event["version"],event["turn_id"],event["call_count"]),(1,self.turn.id,1))
        self.assertEqual(turn.upstream_duration_ms,event["request_duration_ms"])
        self.assertEqual(turn.ttft_ms,0);self.assertIsNone(event["ttft_ms"])
        self.assertNotIn("private",json.dumps(event))

    def test_tracker_censored_zero_retains_unknown_instead_of_asserting_no_call(self):
        self.tracker.observe_agent()
        self.tracker.finalize(self.db,outcome="interrupted")
        turn,events=self.metadata()
        self.assertFalse(turn.upstream_called)  # Legacy bool cannot encode unknown.
        self.assertIsNone(events[0]["upstream_called"])
        self.assertFalse(events[0]["duration_complete"])

    def test_ordinary_tracker_marker_behavior_is_unchanged(self):
        self.tracker.started_at=time.perf_counter()-0.1
        self.tracker.mark_pack_start();self.tracker.mark_upstream_start();self.tracker.mark_first_token()
        self.tracker.finalize(self.db,outcome="success")
        turn,events=self.metadata()
        self.assertTrue(turn.upstream_called);self.assertGreater(turn.ttft_ms,0)
        self.assertEqual(events,[])

    def test_tracker_error_outcome_does_not_erase_successful_model_attempt(self):
        observation=self.tracker.observe_agent()
        self.local(lambda messages,info:self.response(),observation)
        self.tracker.finalize(self.db,outcome="agent_error",error_code="synthetic_after_model")
        turn,events=self.metadata()
        self.assertEqual(turn.outcome,"agent_error");self.assertTrue(turn.upstream_called)
        self.assertEqual(events[0]["calls"][0]["status"],"succeeded")

    def test_harness_forwards_observer_and_binds_existing_receipt_call_identity(self):
        observation=ModelCallObservation(self.turn.id)
        result=self.run_harness(model_observation=observation)
        self.assertIs(self.model.call_args.kwargs["model_observation"],observation)
        self.assertEqual(observation.run_id,result.call_id)

    def test_isolated_harness_forwards_same_observer(self):
        observation=ModelCallObservation(self.turn.id)
        with patch("app.database.SessionLocal",self.sessions):
            result=self.module.run_chat_agent_harness_isolated(recent_messages=[],new_content="synthetic",
                user_name="synthetic",user_id=self.user_id,conversation_id=self.conv_id,provider_id=None,
                policy_version=None,model_observation=observation)
        self.assertIs(self.model.call_args.kwargs["model_observation"],observation)
        self.assertEqual(observation.run_id,result.call_id)

    def studio(self, observation):
        from pydantic_ai import Agent
        from pydantic_ai.models.function import FunctionModel
        ns={"_PYDANTIC_AI_AVAILABLE":True,"Agent":Agent,"StudioToolContext":SimpleNamespace,
            "StudioAgentReply":self.module.StudioAgentReply,"StudioAgentUnavailableError":RuntimeError,
            "_resolve_provider":lambda *a:SimpleNamespace(model_name="local-function",base_url="http://unused.invalid"),
            "_provider_api_key":lambda p:"unused", "OpenAIProvider":lambda **k:None,
            "OpenAICompatibleModel":lambda *a,**k:FunctionModel(lambda messages,info:self.response()),
            "ModelSettings":dict,"STUDIO_AGENT_MAX_TOKENS":1024,"_register_chat_tools":Mock(),
            "resolve_effective_chat_policy":lambda *a,**k:SimpleNamespace(chat_tool_allowlist=(),system_prompt="synthetic",policy_version="synthetic"),
            "_emit_thinking_step":Mock(),"_usage_fields_from_run_result":lambda r:dict(prompt_tokens=0,completion_tokens=0,total_tokens=0,cached_input_tokens=0,usage_payload={})}
        ns["_resolve_provider"]=lambda *a:SimpleNamespace(model_name="local-function",provider_name="synthetic",base_url="http://unused.invalid")
        definitions("app/integrations/studio_agent/agent.py",{"run_studio_agent"},ns)
        def action(model_observation):
            with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
                asyncio.set_event_loop(runner.get_loop())
                try:return ns["run_studio_agent"](self.db,message="private synthetic input",user_name="synthetic",user_id=self.user_id,model_observation=model_observation)
                finally:asyncio.set_event_loop(None)
        return observation.run(action) if observation is not None else action(None)

    def test_actual_studio_source_wraps_sdk_adapter_with_observation(self):
        observation=ModelCallObservation(self.turn.id)
        result=self.studio(observation)
        self.assertEqual(result.text,"private synthetic output")
        self.assertEqual(observation.snapshot()["call_count"],1)

    def test_studio_default_without_observer_preserves_existing_behavior(self):
        with patch("app.services.chat_model_observation.observe_model",side_effect=AssertionError("not requested")):
            self.assertEqual(self.studio(None).text,"private synthetic output")

    def test_real_route_bridge_runs_observer_in_worker_and_preserves_ready_delivery(self):
        seen=[];original=ChatTurnTracker.observe_agent
        def observe(tracker):
            value=original(tracker);seen.append(value);return value
        with patch.object(ChatTurnTracker,"observe_agent",observe),asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
            output,effects,finalized,db=runner.run(self.consume_route("ready"))
        self.assertEqual(len(seen),1)
        self.assertEqual(seen[0].snapshot()["capture_state"],"complete")
        self.assertFalse(seen[0].snapshot()["upstream_called"])  # This fixture's harness is explicitly model-free.
        self.assertTrue(any(effect[0]=="stream" for effect in effects))
        self.assertTrue(finalized["done"])
