"""R88b read-only model metrics and pure thresholds; never execute alert writes."""
import ast
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import event, select

from app.models import ChatTurnTelemetry
from app.services.chat_model_observation import ModelCallObservation
from app.services.chat_telemetry_service import ChatTurnTracker
from app.services.chat_telemetry_observation_service import read_model_observation, aggregate_model_observations
from app.services.chat_telemetry_dashboard_service import get_chat_experience_overview, list_chat_turns
from app.services import chat_telemetry_alert_service as alerts
from tests.test_review_agent_model_observation import AgentModelObservationTests
from tests.test_review_agent_memory_completion import BACKEND, definitions


class ChatModelMetricsTests(AgentModelObservationTests):
    def setUp(self):
        super().setUp()
        self.enterContext(patch.object(alerts.settings,"chat_telemetry_alert_min_turns",10))
        self.enterContext(patch.object(alerts.settings,"chat_telemetry_alert_upstream_call_rate_min",.9))
        self.rule=alerts._UpstreamCallRateLowRule("upstream_call_rate_low","critical","synthetic")

    def row(self, *, agent=True, called=False, outcome=None, ttft=0, stages=None, ago=None):
        row=ChatTurnTelemetry(correlation_id="synthetic",conversation_id=self.conv_id,user_id=self.user_id,
            outcome=outcome or ("agent_success" if agent else "success"),agent_mode=agent,upstream_called=called,
            ttft_ms=ttft,stage_events_json=stages or [],started_at=datetime.now(timezone.utc)-(ago or timedelta()),
            completed_at=datetime.now(timezone.utc),provider_name="synthetic",model_name="local")
        self.db.add(row);self.db.commit();return row

    def observed(self, *, count=1, complete=True, outcome="agent_success", response=42):
        row=self.row(outcome=outcome)
        observation=ModelCallObservation(row.id,started_at=0);clock=[0.0]
        def action(model_observation):
            for _ in range(count):
                ident=model_observation.begin();clock[0]+=.042;model_observation.end(ident,"succeeded")
        with patch("app.services.chat_model_observation.time.perf_counter",side_effect=lambda:clock[0]):
            if complete:observation.run(action)
            else:action(observation)
            data=observation.snapshot(close=True)
        if count:data["first_response_ms"]=response
        row.stage_events_json=[data];row.upstream_called=data["upstream_called"] is True
        self.db.commit();return row

    def metrics(self):
        return alerts.compute_chat_window_metrics(self.db,window_hours=1)

    def test_ten_real_sdk_agent_successes_have_rate_one_and_no_false_critical(self):
        for _ in range(10):
            row=self.row();tracker=ChatTurnTracker(row.id)
            self.local(lambda messages,info:self.response(),tracker.observe_agent())
            tracker.finalize(self.db,outcome="agent_success")
        data=self.metrics();overview=get_chat_experience_overview(self.db)
        self.assertEqual((data["turn_count"],data["upstream_known_turn_count"],data["upstream_call_rate"]),(10,10,1.0))
        self.assertEqual(overview["upstream_call_rate"],1.0)
        self.assertFalse(self.rule.is_triggered(data));self.assertTrue(self.rule.is_evaluable(data))
        self.assertIsNone(data["avg_ttft_ms"]);self.assertEqual(data["ttft_sample_count"],0)
        self.assertEqual(data["first_response_sample_count"],10)

    def test_original_window_counts_legacy_agent_missing_instrumentation_as_zero_new_is_unknown(self):
        for _ in range(10):self.row()
        namespace=dict(select=select,ChatTurnTelemetry=ChatTurnTelemetry,Counter=__import__('collections').Counter,
            _window_since=alerts._window_since,SUCCESS_OUTCOMES=alerts.SUCCESS_OUTCOMES,
            _merge_client_event_totals=alerts._merge_client_event_totals,_percentile=alerts._percentile)
        definitions("../docs/archive/f81-r88b-2026-10-25/original/backend/app/services/chat_telemetry_alert_service.py",{"compute_chat_window_metrics"},namespace)
        old=namespace["compute_chat_window_metrics"](self.db,window_hours=1)
        self.assertEqual((old["turn_count"],old["success_rate"],old["upstream_call_rate"]),(10,1.0,0.0))
        data=self.metrics()
        self.assertIsNone(data["upstream_call_rate"]);self.assertEqual(data["upstream_unknown_turn_count"],10)
        self.assertFalse(self.rule.is_evaluable(data));self.assertFalse(self.rule.is_triggered(data))

    def test_known_sample_minimum_is_not_inflated_by_unknown_turns(self):
        for _ in range(9):self.observed(count=0)
        for _ in range(10):self.row()
        data=self.metrics()
        self.assertEqual((data["turn_count"],data["upstream_known_turn_count"],data["upstream_call_rate"]),(19,9,0.0))
        self.assertFalse(self.rule.is_evaluable(data));self.assertFalse(self.rule.is_triggered(data))
        self.observed(count=0)
        self.assertTrue(self.rule.is_evaluable(self.metrics()));self.assertTrue(self.rule.is_triggered(self.metrics()))

    def test_mixed_known_true_false_and_legacy_unknown_use_same_dashboard_and_alert_denominator(self):
        for _ in range(8):self.observed()
        self.observed(count=0,outcome="agent_error")
        self.row(agent=False,outcome="attachment_error")
        for _ in range(4):self.row()
        self.row(agent=False,called=True,ttft=80,stages=[{"label":"upstream.start"},{"label":"upstream.first_token"}])
        a=self.metrics();b=get_chat_experience_overview(self.db)
        self.assertEqual((a["upstream_known_turn_count"],a["upstream_called_turn_count"],a["upstream_unknown_turn_count"]),(11,9,4))
        self.assertAlmostEqual(a["upstream_call_rate"],9/11,places=4)
        for key in aggregate_model_observations([]):self.assertEqual(a[key],b[key])
        self.assertTrue(self.rule.is_triggered(a))
        self.assertEqual((a["ttft_sample_count"],a["avg_ttft_ms"]),(1,80))
        self.assertIn("已知 11",self.rule.message(a));self.assertIn("未知 4",self.rule.message(a))

    def test_threshold_equality_and_unrounded_ratio_use_counts(self):
        def metric(called,known):return dict(upstream_metrics_version=1,turn_count=known,
            upstream_known_turn_count=known,upstream_unknown_turn_count=0,upstream_called_turn_count=called,
            upstream_call_rate=round(called/known,4))
        self.assertFalse(self.rule.is_triggered(metric(9,10)))
        self.assertTrue(self.rule.is_triggered(metric(8,10)))
        self.assertTrue(self.rule.is_triggered(metric(89999,100000)))
        self.assertFalse(self.rule.is_triggered(metric(90001,100000)))

    def test_empty_and_all_unknown_windows_have_null_samples_not_zero(self):
        data=self.metrics()
        self.assertEqual(data["turn_count"],0)
        for key in ("upstream_call_rate","avg_ttft_ms","p95_ttft_ms","avg_first_response_ms","p95_first_response_ms","model_call_count_total"):
            self.assertIsNone(data[key])
        self.assertFalse(self.rule.is_evaluable(data))
        self.row();self.assertIsNone(self.metrics()["upstream_call_rate"])

    def test_new_false_and_censored_zero_are_distinct_and_partial_count_not_full_total(self):
        known=self.observed(count=0,outcome="agent_error")
        unknown=self.observed(count=0,complete=False,outcome="interrupted")
        partial=self.observed(count=2,complete=False,outcome="interrupted")
        self.assertIs(read_model_observation(known)["upstream_called"],False)
        self.assertIsNone(read_model_observation(unknown)["upstream_called"])
        fact=read_model_observation(partial)
        self.assertTrue(fact["upstream_called"]);self.assertEqual(fact["model_call_count"],2)
        self.assertFalse(fact["model_call_count_complete"]);self.assertIsNone(fact["upstream_duration_ms"])
        data=self.metrics()
        self.assertEqual((data["upstream_known_turn_count"],data["upstream_unknown_turn_count"],data["upstream_call_rate"]),(2,1,.5))
        self.assertEqual((data["model_call_count_total"],data["model_call_count_sample_count"]),(0,1))

    def test_model_after_error_remains_called_and_multiple_attempts_are_not_multiple_turns(self):
        self.observed(count=3,outcome="agent_error")
        data=self.metrics()
        self.assertEqual((data["turn_count"],data["upstream_call_rate"],data["model_call_count_total"]),(1,1.0,3))
        self.assertEqual(data["success_rate"],0.0)

    def test_legacy_agent_needs_reliable_start_and_never_invents_streaming_ttft(self):
        unknown=self.row(called=True,ttft=900)
        known=self.row(called=True,ttft=900,stages=[{"label":"upstream.start"}])
        self.assertIsNone(read_model_observation(unknown)["upstream_called"])
        fact=read_model_observation(known)
        self.assertTrue(fact["upstream_called"]);self.assertIsNone(fact["model_call_count"]);self.assertIsNone(fact["ttft_ms"])

    def test_ordinary_measured_zero_ttft_and_new_full_response_zero_are_real_samples(self):
        self.row(agent=False,called=True,ttft=0,stages=[{"label":"upstream.first_token"}])
        self.observed(response=0)
        data=self.metrics()
        self.assertEqual((data["ttft_sample_count"],data["avg_ttft_ms"],data["p95_ttft_ms"]),(1,0,0))
        self.assertEqual((data["first_response_sample_count"],data["avg_first_response_ms"],data["p95_first_response_ms"]),(1,0,0))

    def test_invalid_future_duplicate_or_cross_turn_events_do_not_fall_back_to_false(self):
        row=self.observed();valid=deepcopy(row.stage_events_json[0])
        changes=[("version",2),("version",True),("turn_id",row.id+1),("run_id","bad"),("call_count",True),
                 ("call_count",-1),("upstream_called",False),("duration_complete",False),
                 ("request_duration_ms",-1),("first_response_ms",float("inf")),("ttft_ms",120),
                 ("mode","streaming"),("calls",[]),("identities_truncated",True),
                 ("capture_state",[]),("capture_state",{}),("first_response_ms",None)]
        for key,value in changes:
            with self.subTest(key=key,value=value):
                row.stage_events_json=[{**deepcopy(valid),key:value}]
                fact=read_model_observation(row)
                self.assertIsNone(fact["upstream_called"]);self.assertEqual(fact["upstream_observation"],"invalid")
        row.stage_events_json=[valid,deepcopy(valid)]
        self.assertIsNone(read_model_observation(row)["upstream_called"])
        self.db.rollback()

    def test_model_event_identity_errors_and_unknown_counters_are_rejected(self):
        row=self.observed(count=2);valid=deepcopy(row.stage_events_json[0])
        for call in ({"call_id":"bad"},{"sequence":True},{"status":"unrecognized"},{"status":"censored"},
                     {"status":[]},{"status":{}}):
            data=deepcopy(valid);data["calls"][0].update(call);row.stage_events_json=[data]
            self.assertIsNone(read_model_observation(row)["upstream_called"])
        data=deepcopy(valid);data["calls"][1]["call_id"]=data["calls"][0]["call_id"];row.stage_events_json=[data]
        self.assertIsNone(read_model_observation(row)["upstream_called"]);self.db.rollback()

    def test_metric_rule_invalid_counts_and_old_shape_cannot_clear_or_trigger(self):
        base=dict(upstream_metrics_version=1,turn_count=10,upstream_known_turn_count=10,
                  upstream_called_turn_count=0,upstream_unknown_turn_count=0,upstream_call_rate=0)
        for key,value in (("upstream_metrics_version",True),("upstream_known_turn_count",True),
                          ("upstream_known_turn_count",0),("upstream_called_turn_count",11),
                          ("upstream_unknown_turn_count",1),("turn_count",None)):
            with self.subTest(key=key,value=value):
                data={**base,key:value};self.assertFalse(self.rule.is_evaluable(data));self.assertFalse(self.rule.is_triggered(data))
        self.assertFalse(self.rule.is_evaluable({"turn_count":10,"upstream_call_rate":0}))

    def test_api_overview_and_list_preserve_nulls_and_measurement_basis(self):
        from types import ModuleType
        from pydantic import BaseModel
        module=ModuleType("r88b_schema_test")
        module.__dict__.update(BaseModel=BaseModel,datetime=datetime)
        with patch.dict("sys.modules",{module.__name__:module}):
            definitions("app/routers/chat_experience.py",{"ChatExperienceOverviewOut","ChatExperienceTurnRowOut"},module.__dict__)
        ChatExperienceOverviewOut=module.ChatExperienceOverviewOut
        ChatExperienceTurnRowOut=module.ChatExperienceTurnRowOut
        known=self.observed();unknown=self.row()
        overview=ChatExperienceOverviewOut(**get_chat_experience_overview(self.db)).model_dump()
        self.assertIsNone(overview["p95_ttft_ms"]);self.assertEqual(overview["upstream_unknown_turn_count"],1)
        rows={item["id"]:ChatExperienceTurnRowOut(**item).model_dump() for item in list_chat_turns(self.db)["items"]}
        self.assertTrue(rows[known.id]["upstream_called"]);self.assertEqual(rows[known.id]["first_response_ms"],42)
        self.assertIsNone(rows[unknown.id]["upstream_called"]);self.assertIsNone(rows[unknown.id]["ttft_ms"])

    def test_overview_windows_and_other_metrics_are_unchanged_and_no_history_writes(self):
        row=self.observed();row.attachment_count=1;row.pack_duration_ms=123;row.total_duration_ms=345
        row.client_events_json=[{"event":"chat.stream.client_error"}];self.db.commit()
        self.row(agent=False,called=False,outcome="interrupted",ago=timedelta(hours=2))
        self.row(ago=timedelta(days=31))
        before=[(r.id,json.dumps(r.stage_events_json,sort_keys=True),r.upstream_called,r.ttft_ms) for r in self.db.scalars(select(ChatTurnTelemetry))]
        writes=[]
        def guard(conn,cursor,sql,*args):
            if sql.lstrip().upper().startswith(("INSERT","UPDATE","DELETE","CREATE","DROP")):writes.append(sql)
        event.listen(self.engine,"before_cursor_execute",guard)
        try:
            a=self.metrics();b=get_chat_experience_overview(self.db,days=1);listing=list_chat_turns(self.db,days=1,limit=1)
        finally:event.remove(self.engine,"before_cursor_execute",guard)
        self.assertEqual((a["turn_count"],b["turn_count"],listing["total"]),(1,2,2))
        self.assertEqual((b["success_rate"],b["p95_pack_duration_ms"],b["avg_total_duration_ms"]),(.5,123,345))
        self.assertEqual(a["client_error_count"],1);self.assertEqual(writes,[])
        after=[(r.id,json.dumps(r.stage_events_json,sort_keys=True),r.upstream_called,r.ttft_ms) for r in self.db.scalars(select(ChatTurnTelemetry))]
        self.assertEqual(before,after)

    def test_evaluate_source_skips_insufficient_model_rule_before_persistence_without_running_it(self):
        tree=ast.parse((BACKEND/'app/services/chat_telemetry_alert_service.py').read_text(encoding="utf-8"))
        function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='evaluate_chat_telemetry_alerts')
        loop=next(n for n in function.body if isinstance(n,ast.For))
        self.assertIsInstance(loop.body[0],ast.If);self.assertIsInstance(loop.body[0].body[0],ast.Continue)
        self.assertEqual(loop.body[0].test.operand.func.attr,"is_evaluable")
        self.assertTrue(all(rule.is_evaluable({}) for rule in alerts.ALERT_RULES if rule.key!='upstream_call_rate_low'))
