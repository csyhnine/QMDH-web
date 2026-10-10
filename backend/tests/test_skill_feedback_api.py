from datetime import datetime, timezone

from sqlalchemy import select

from app.core.auth import get_current_agent_auth
from app.core.config import AgentAuthProfile
from app.models import AgentClient, SkillFeedbackEvent, SkillFeedbackIssue
from tests import test_feedback_api as feedback_tests


class SkillFeedbackApiTests(feedback_tests.FeedbackApiTests):
    def setUp(self):
        super().setUp()
        with self.SessionLocal() as db:
            db.add(AgentClient(id=1, key="codex-test", token_hash="fake-test-only", user_id=1))
            db.commit()
        self.app.dependency_overrides[get_current_agent_auth] = lambda: AgentAuthProfile(client_id=1, key="codex-test", display_name="test", device_id="", environment="test", user_id=1, user_name="designer.arch", user_role="designer", project_codes=(), request_id="", external_execution_id="")

    def event(self, event_id="e1", **changes):
        return {"event_id": event_id, "correlation_id": "task-1", "platform": "codex", "skill_name": "research", "skill_version": "1.0", "source": "system", "event_type": "execution", "occurred_at": datetime(2026, 10, 10, tzinfo=timezone.utc).isoformat(), **changes}

    def ingest(self, **kwargs):
        return self.client.post("/feedback/skills/events", json=self.event(**kwargs))

    def test_normal_events_only_statistics(self):
        self.assertEqual(self.ingest().status_code, 200)
        headers = self._admin_headers()
        self.assertEqual(self.client.get("/feedback/skills/admin/issues", headers=headers).json(), [])
        self.assertEqual(self.client.get("/feedback/skills/admin/summary", headers=headers).json()["events"], 1)

    def test_real_intake_authentication_and_raw_event_access(self):
        from app.core.auth import hash_session_token
        self.app.dependency_overrides.pop(get_current_agent_auth)
        with self.SessionLocal() as db:
            db.get(AgentClient, 1).token_hash = hash_session_token("intake-test-token")
            db.commit()
        self.assertEqual(self.ingest().status_code, 401)
        self.assertEqual(self.client.post("/feedback/skills/events", json=self.event(), headers={"X-QMDH-Agent-Token": "intake-test-token", "X-QMDH-Agent-Key": "wrong"}).status_code, 403)
        self.assertEqual(self.client.post("/feedback/skills/events", json=self.event(), headers={"X-QMDH-Agent-Token": "intake-test-token"}).status_code, 200)
        self.assertEqual(self.client.get("/feedback/skills/admin/events").status_code, 401)
        self.assertEqual(self.client.get("/feedback/skills/admin/events", headers=self._designer_headers()).status_code, 403)

    def test_ai_inference_keeps_source_and_completed_delivery_is_statistics(self):
        self.assertEqual(self.ingest(event_type="delivery", evaluation={"outcome": "completed"}).status_code, 200)
        self.assertEqual(self.ingest(event_id="inferred", event_type="problem", source="ai_inference", problem_code="images_insufficient", evaluation={"score": 2, "rubric_version": "r1", "reason": "推断"}).status_code, 200)
        events = self.client.get("/feedback/skills/admin/events", headers=self._admin_headers()).json()
        self.assertEqual(events[0]["source"], "ai_inference")
        self.assertEqual(events[0]["evaluation"]["score"], 2)
        self.assertIsNone(events[1]["issue_id"])

    def test_dedup_aggregation_versions_and_task_link(self):
        first = self.ingest(event_type="problem", problem_code="images_insufficient", summary="图片不足")
        self.assertEqual(first.status_code, 200)
        self.assertTrue(self.ingest(event_type="problem", problem_code="images_insufficient", summary="图片不足").json()["duplicate"])
        self.assertEqual(self.ingest(summary="changed").status_code, 409)
        self.assertEqual(self.ingest(event_id="e2", event_type="user_correction", source="human", problem_code="images_insufficient", evidence=[{"quote": "请补充现场图片"}]).status_code, 200)
        self.assertEqual(self.ingest(event_id="e3", correlation_id="task-2", skill_version="2.0", event_type="problem", problem_code="images_insufficient").status_code, 200)
        issues = self.client.get("/feedback/skills/admin/issues", headers=self._admin_headers()).json()
        self.assertEqual(len(issues), 2)
        self.assertEqual(sorted(item["evidence_count"] for item in issues), [1, 2])
        events = self.client.get("/feedback/skills/admin/events?run_id=" + str(first.json()["run_id"]), headers=self._admin_headers()).json()
        self.assertEqual({item["source"] for item in events}, {"human", "system"})
        self.assertNotIn("payload_hash", events[0])

    def test_status_independent_and_reopen_on_correction(self):
        self.ingest(event_type="problem", problem_code="missing_citation")
        issue = self.client.get("/feedback/skills/admin/issues", headers=self._admin_headers()).json()[0]
        path = f"/feedback/skills/admin/issues/{issue['id']}"
        self.assertEqual(self.client.patch(path, json={"communication_status": "replied"}, headers=self._admin_headers()).status_code, 422)
        reply = self.client.patch(path, json={"communication_status": "replied", "admin_reply": "已收到"}, headers=self._admin_headers()).json()
        self.assertEqual(reply["improvement_status"], "pending_analysis")
        self.assertEqual(self.client.patch(path, json={"improvement_status": "resolved"}, headers=self._admin_headers()).status_code, 422)
        self.assertEqual(self.client.patch(path, json={"improvement_status": "resolved", "retest_result": "引用检查通过"}, headers=self._admin_headers()).status_code, 200)
        self.ingest(event_id="again", event_type="user_correction", source="human", problem_code="missing_citation")
        reopened = self.client.get("/feedback/skills/admin/issues", headers=self._admin_headers()).json()[0]
        self.assertEqual(reopened["communication_status"], "pending_reply")
        self.assertEqual(reopened["improvement_status"], "pending_analysis")

    def test_invalid_scope_and_sources(self):
        self.assertEqual(self.ingest(event_type="user_correction", problem_code="images_insufficient").status_code, 422)
        self.assertEqual(self.ingest(event_type="problem").status_code, 422)
        self.assertEqual(self.ingest().status_code, 200)
        self.assertEqual(self.ingest(event_id="other", skill_version="changed").status_code, 409)
        self.assertEqual(self.client.get("/feedback/skills/admin/issues", headers=self._designer_headers()).status_code, 403)
        self.assertEqual(self.ingest(event_id="large", evidence=[{"text": "a" * 70000}]).status_code, 413)

    def test_manual_improvement_does_not_reply(self):
        created = self.client.post("/feedback", json={"title": "人工建议", "message": "补充现场图片"}, headers=self._designer_headers()).json()
        response = self.client.patch(f"/feedback/admin/{created['id']}/improvement", json={"improvement_status": "pending_modification"}, headers=self._admin_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "open")
        self.assertEqual(response.json()["source"], "human")
        self.assertEqual(len(response.json()["messages"]), 1)
