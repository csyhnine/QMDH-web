from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
from unittest.mock import patch

from fastapi import HTTPException, Request
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.feedback_public import consume_public_budget, origin_hash
from app.core.feedback_security import FeedbackBodyLimitMiddleware
from app.database import Base
from app.models import SkillFeedbackCredential, SkillFeedbackPublicQuota
from tests import test_feedback_api as feedback_tests


class PublicFeedbackTests(feedback_tests.FeedbackApiTests):
    def setUp(self):
        super().setUp()
        self.app.add_middleware(FeedbackBodyLimitMiddleware)
        self.skill_id = "qsk_" + "0" * 32

    def publish(self, active=True):
        if self.skill_id == "qsk_" + "0" * 32:
            response = self.client.post("/feedback/skills/admin/public-grants", headers=self._admin_headers(),
                json={"skill_name": "research", "is_active": active})
            if response.status_code == 201:
                self.skill_id = response.json()["skill_id"]
            return response
        return self.client.patch(f"/feedback/skills/admin/public-grants/{self.skill_id}", headers=self._admin_headers(),
            json={"skill_name": "research", "is_active": active})

    def session(self, **changes):
        return self.client.post("/feedback/skills/sessions", json={"skill_id": self.skill_id, "skill_name": "research", "skill_version": "1.0",
            "correlation_id": "task-1", "platform": "codex", "device_name": "external", **changes})

    def event(self, token, **changes):
        return self.client.post("/feedback/skills/events", headers={"X-QMDH-Feedback-Token": token}, json={
            "event_id": "e1", "correlation_id": "task-1", "platform": "codex", "skill_id": self.skill_id, "skill_name": "research", "skill_version": "1.0",
            "source": "human", "event_type": "problem", "problem_code": "missing_citation", "summary": "Missing citation",
            "occurred_at": datetime.now(timezone.utc).isoformat(), **changes})

    def test_opt_in_admin_only_and_no_account_needed(self):
        self.assertEqual(self.session().status_code, 403)
        self.assertEqual(self.client.post("/feedback/skills/admin/public-grants", headers=self._designer_headers(),
            json={"skill_name": "research"}).status_code, 403)
        self.assertEqual(self.publish().status_code, 201)
        result = self.session()
        self.assertEqual(result.status_code, 201, result.text)
        self.assertEqual(result.headers["cache-control"], "no-store")
        session = result.json()
        self.assertEqual(session["max_events"], 10)
        self.assertEqual(session["identity"], "anonymous_session")
        expires = datetime.fromisoformat(session["expires_at"])
        self.assertLessEqual(expires - datetime.now(timezone.utc), timedelta(hours=1))
        self.assertNotIn("id", session)
        self.assertEqual(self.session(skill_version="2.0").status_code, 201)
        self.assertEqual(self.session(skill_id="qsk_" + "f" * 32).status_code, 403)
        self.assertEqual(self.session(owner_id=1).status_code, 422)
        self.assertEqual(self.event(session["token"]).status_code, 200)
        self.assertEqual(self.client.get("/feedback/skills/admin/issues", headers=self._admin_headers()).json(), [])
        events = self.client.get("/feedback/skills/admin/events", headers=self._admin_headers()).json()
        self.assertEqual(events[0]["review_status"], "pending")
        self.assertEqual(events[0]["identity"], "anonymous_session")
        self.assertEqual(self.client.get("/feedback/skills/admin/events", headers={"X-QMDH-Feedback-Token": session["token"]}).status_code, 401)

    def test_bound_task_platform_and_version_and_disable_revokes(self):
        self.publish()
        token = self.session().json()["token"]
        self.assertEqual(self.event(token, correlation_id="different").status_code, 403)
        self.assertEqual(self.event(token, platform="workbuddy").status_code, 403)
        self.assertEqual(self.event(token, skill_version="2.0").status_code, 403)
        self.assertEqual(self.publish(False).status_code, 200)
        self.assertEqual(self.session().status_code, 403)
        self.assertEqual(self.event(token).status_code, 401)
        self.publish(True)
        self.assertEqual(self.event(token).status_code, 401)

    def test_expiry_origin_binding_and_total_budget_survives_new_windows(self):
        self.publish()
        token = self.session().json()["token"]
        with self.SessionLocal() as db:
            credential = db.scalar(select(SkillFeedbackCredential))
            credential.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            db.commit()
        self.assertEqual(self.event(token).status_code, 401)
        token = self.session().json()["token"]
        with self.SessionLocal() as db:
            credential = db.scalars(select(SkillFeedbackCredential).order_by(SkillFeedbackCredential.id.desc())).first()
            credential.origin_hash = "wrong-origin"
            db.commit()
        self.assertEqual(self.event(token).status_code, 401)
        token = self.session().json()["token"]
        with self.SessionLocal() as db:
            credential = db.scalars(select(SkillFeedbackCredential).order_by(SkillFeedbackCredential.id.desc())).first()
            credential.submission_count = 9
            # Daily rollover must not allow more than ten lifetime submissions.
            credential.minute_start = credential.day_start = datetime.now(timezone.utc) - timedelta(days=1)
            db.commit()
        self.assertEqual(self.event(token).status_code, 200)
        self.assertEqual(self.event(token, event_id="e2").status_code, 429)

    def test_repeated_minting_and_spoofed_headers_share_budget(self):
        self.publish()
        for number in range(5):
            self.assertEqual(self.session(correlation_id=f"task-{number}", device_name=f"device-{number}").status_code, 201)
        blocked = self.client.post("/feedback/skills/sessions", headers={"X-Forwarded-For": "203.0.113.99", "X-Real-IP": "203.0.113.99"},
            json={"skill_id": self.skill_id, "skill_name": "research", "skill_version": "1.0", "correlation_id": "new", "platform": "other", "device_name": "new"})
        self.assertEqual(blocked.status_code, 429)
        self.assertGreater(int(blocked.headers["retry-after"]), 0)
        with self.SessionLocal() as db:
            self.assertEqual(db.get(SkillFeedbackPublicQuota, "session:global").day_count, 5)

    def test_anonymous_sessions_do_not_become_independent_people(self):
        self.publish()
        for number in range(2):
            token = self.session().json()["token"]
            self.assertEqual(self.event(token, event_id=str(number)).status_code, 200)
        for event in self.client.get("/feedback/skills/admin/events?review_status=pending", headers=self._admin_headers()).json():
            reviewed = self.client.patch(f"/feedback/skills/admin/events/{event['id']}/review", headers=self._admin_headers(),
                json={"review_status": "accepted", "review_note": "Evidence independently checked"})
            self.assertEqual(reviewed.status_code, 200)
        issue = self.client.get("/feedback/skills/admin/issues", headers=self._admin_headers()).json()[0]
        self.assertEqual(issue["submitter_count"], 0)
        self.assertEqual(issue["anonymous_session_count"], 2)

    def test_session_body_limit_before_json_and_global_daily_limit(self):
        self.assertEqual(self.client.post("/feedback/skills/sessions", content=b"x" * 4097).status_code, 413)
        self.publish()
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            db.add(SkillFeedbackPublicQuota(key="session:global", hour_start=now, day_start=now, hour_count=0, day_count=200))
            db.commit()
        self.assertEqual(self.session().status_code, 429)
        with self.SessionLocal() as db:
            self.assertEqual(len(db.scalars(select(SkillFeedbackCredential)).all()), 0)

    def test_event_origin_budget_is_shared_across_new_sessions_and_normal_events_remain_statistics(self):
        self.publish()
        token = self.session().json()["token"]
        self.assertEqual(self.event(token, event_type="delivery", problem_code="", evaluation={"outcome": "completed"}).status_code, 200)
        rows = self.client.get("/feedback/skills/admin/events", headers=self._admin_headers()).json()
        self.assertEqual(rows[0]["review_status"], "not_required")
        now = datetime.now(timezone.utc)
        with self.SessionLocal() as db:
            credential = db.scalar(select(SkillFeedbackCredential))
            quota = db.get(SkillFeedbackPublicQuota, "event:" + credential.origin_hash)
            quota.hour_start = now
            quota.hour_count = 50
            db.commit()
        rotated = self.session().json()["token"]
        self.assertEqual(self.event(rotated, event_id="other").status_code, 429)
        with self.SessionLocal() as db:
            self.assertEqual(db.get(SkillFeedbackPublicQuota, "event:global").day_count, 1)

    def test_duplicate_names_get_distinct_ids_and_client_cannot_choose_registered_id(self):
        first = self.publish().json()
        second = self.client.post("/feedback/skills/admin/public-grants", headers=self._admin_headers(), json={"skill_name": "research"})
        self.assertEqual(second.status_code, 201)
        self.assertNotEqual(first["skill_id"], second.json()["skill_id"])
        self.assertRegex(first["skill_id"], r"^qsk_[a-f0-9]{32}$")
        self.assertEqual(self.client.post("/feedback/skills/admin/public-grants", headers=self._admin_headers(),
            json={"skill_name": "research", "skill_id": first["skill_id"]}).status_code, 422)
        self.assertEqual(self.client.patch(f"/feedback/skills/admin/public-grants/{first['skill_id']}", headers=self._designer_headers(),
            json={"skill_name": "changed", "is_active": False}).status_code, 403)

    def test_identity_groups_rename_but_separates_twins_and_versions(self):
        self.publish()
        first_id = self.skill_id
        twin = self.client.post("/feedback/skills/admin/public-grants", headers=self._admin_headers(), json={"skill_name": "research"}).json()
        submissions = [(first_id, "research", "1.0"), (first_id, "research-renamed", "1.0"),
            (first_id, "research-renamed", "2.0"), (twin["skill_id"], "research", "1.0")]
        renamed = self.client.patch(f"/feedback/skills/admin/public-grants/{first_id}", headers=self._admin_headers(), json={"skill_name": "research-renamed", "is_active": True})
        self.assertEqual(renamed.json()["skill_id"], first_id)
        for index, (skill_id, name, version) in enumerate(submissions):
            token = self.session(skill_id=skill_id, skill_name=name, skill_version=version).json()["token"]
            self.assertEqual(self.event(token, event_id=str(index), skill_id=skill_id, skill_name=name, skill_version=version).status_code, 200)
        for event in self.client.get("/feedback/skills/admin/events?review_status=pending", headers=self._admin_headers()).json():
            self.assertIn(event["skill_id"], {first_id, twin["skill_id"]})
            result = self.client.patch(f"/feedback/skills/admin/events/{event['id']}/review", headers=self._admin_headers(),
                json={"review_status": "accepted", "review_note": "Checked"})
            self.assertEqual(result.status_code, 200, result.text)
        issues = self.client.get("/feedback/skills/admin/issues", headers=self._admin_headers()).json()
        self.assertEqual(len(issues), 3)
        same = next(row for row in issues if row["skill_id"] == first_id and row["skill_version"] == "1.0")
        self.assertEqual(same["evidence_count"], 2)
        summary = self.client.get("/feedback/skills/admin/summary", headers=self._admin_headers()).json()
        self.assertEqual({row["skill_id"] for row in summary["by_skill"]}, {first_id, twin["skill_id"]})

    def test_temporary_credential_cannot_impersonate_other_skill_id_or_omit_id(self):
        self.publish()
        token = self.session().json()["token"]
        self.assertEqual(self.event(token, skill_id="qsk_" + "f" * 32).status_code, 403)
        self.assertEqual(self.event(token, skill_id=None).status_code, 403)
        self.assertEqual(self.event(token, skill_id="invalid").status_code, 422)


def test_public_quota_concurrency_and_ipv6_network_budget():
    requests = [Request({"type": "http", "client": (address, 1234), "headers": []}) for address in ("2001:db8::1", "2001:db8::2")]
    assert origin_hash(requests[0]) == origin_hash(requests[1])
    with tempfile.TemporaryDirectory() as folder:
        engine = create_engine("sqlite:///" + Path(folder, "public.db").as_posix(), connect_args={"check_same_thread": False, "timeout": 20})
        Base.metadata.create_all(engine)
        sessions = sessionmaker(bind=engine)
        def attempt(_):
            with sessions() as db:
                try:
                    consume_public_budget(db, "session", "one-origin")
                    db.commit()
                    return 201
                except HTTPException as error:
                    return error.status_code
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(20)))
        assert results.count(201) == 5
        assert results.count(429) == 15
        with sessions() as db:
            assert db.get(SkillFeedbackPublicQuota, "session:global").day_count == 5
        engine.dispose()


def test_forwarded_origin_is_used_only_from_explicit_trusted_peer():
    def request(peer, real_ip):
        return Request({"type": "http", "client": (peer, 1234), "headers": [(b"x-real-ip", real_ip.encode()), (b"x-forwarded-for", b"198.51.100.77")]})
    with patch("app.core.config.settings.feedback_trusted_proxy_cidrs", "10.0.0.2/32"):
        assert origin_hash(request("10.0.0.3", "203.0.113.1")) == origin_hash(request("10.0.0.3", "203.0.113.2"))
        assert origin_hash(request("10.0.0.2", "203.0.113.1")) != origin_hash(request("10.0.0.2", "203.0.113.2"))
        assert origin_hash(request("10.0.0.2", "invalid")) == origin_hash(request("10.0.0.2", "10.0.0.2"))
