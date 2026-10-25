"""R10 final PATCH invariants with real schema, issue row and audit persistence."""
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest

from fastapi import Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session, sessionmaker
from app.core.audit import write_audit_log
from app.core.auth import require_content_ops_access
from app.core.config import AuthUserProfile
from app.models import AuditLog, SkillFeedbackIssue, User
from app.skill_feedback_schemas import SkillIssueUpdate
from tests.test_review_partial_image_progress import load


class FeedbackPatchStateTests(unittest.TestCase):
    def setUp(self):
        root=Path(self.enterContext(TemporaryDirectory(prefix="r10-offline-")))
        self.engine=create_engine("sqlite:///"+str(root/"feedback.db"));self.addCleanup(self.engine.dispose)
        event.listen(self.engine,"connect",lambda connection,_:connection.execute("PRAGMA foreign_keys=ON"))
        SkillFeedbackIssue.metadata.create_all(self.engine,tables=[User.__table__,SkillFeedbackIssue.__table__,AuditLog.__table__]);self.sessions=sessionmaker(self.engine)
        with self.sessions() as db:
            user=User(name="r10-admin",role="admin");issue=SkillFeedbackIssue(skill_name="fixture",skill_version="1.0",problem_code="quality",title="ordinary fixture",aggregation_key="r10-fixture")
            db.add_all([user,issue]);db.flush();self.user_id=user.id;self.issue_id=issue.id;db.commit();self.assertEqual(db.scalar(text("PRAGMA foreign_keys")),1)
        self.auth=AuthUserProfile(name="r10-admin",role="admin",token="synthetic-unused",user_id=self.user_id)
        namespace={"__name__":__name__,"router":SimpleNamespace(patch=lambda *args,**kwargs:lambda fn:fn),"Depends":Depends,"get_db":lambda:None,"get_current_auth_user":lambda:None,
                   "SkillIssueUpdate":SkillIssueUpdate,"Session":Session,"SkillFeedbackIssue":SkillFeedbackIssue,"select":select,"HTTPException":HTTPException,
                   "require_content_ops_access":require_content_ops_access,"write_audit_log":write_audit_log,"datetime":datetime,"timezone":timezone}
        load("app/routers/skill_feedback.py",namespace,functions=["_ops","_serialize","update_issue"]);self.update=namespace["update_issue"];self.reset()

    def reset(self,**values):
        defaults={"communication_status":"replied","improvement_status":"resolved","admin_reply":"existing reply","retest_result":"existing retest","root_cause":"existing cause","modification_suggestion":"existing suggestion","updated_at":datetime(2026,1,1,tzinfo=timezone.utc)}
        with self.sessions() as db:
            issue=db.get(SkillFeedbackIssue,self.issue_id)
            for key,value in {**defaults,**values}.items():setattr(issue,key,value)
            db.commit()

    def snapshot(self):
        with self.sessions() as db:
            issue=db.get(SkillFeedbackIssue,self.issue_id);self.assertEqual(db.scalar(text("PRAGMA foreign_keys")),1)
            row={column.name:getattr(issue,column.name) for column in issue.__table__.columns}
            audits=[(x.id,x.event_type,x.target_id,x.actor_id,x.details) for x in db.scalars(select(AuditLog).order_by(AuditLog.id))]
            return row,audits

    def patch(self,changes,issue_id=None):
        payload=SkillIssueUpdate(**changes)
        with self.sessions() as db:return self.update(self.issue_id if issue_id is None else issue_id,payload,db,self.auth)

    def reject(self,changes):
        before=self.snapshot()
        with self.assertRaises(HTTPException) as raised:self.patch(changes)
        self.assertEqual(raised.exception.status_code,422);self.assertEqual(self.snapshot(),before)

    def test_explicit_terminal_status_and_empty_or_blank_proofs_are_rejected(self):
        for blank in [""," \t\n "]:
            with self.subTest(blank=repr(blank)):
                self.reset();self.reject({"communication_status":"replied","improvement_status":"resolved","admin_reply":blank,"retest_result":blank})

    def test_omitted_status_cannot_clear_either_required_final_text(self):
        for field in ["admin_reply","retest_result"]:
            for blank in [""," \t\n "]:
                with self.subTest(field=field,blank=repr(blank)):
                    self.reset();self.reject({field:blank})

    def test_independent_final_statuses_allow_only_their_nonrequired_text_to_clear(self):
        for pending_field,pending_value,clear_field,required_field in [("improvement_status","pending_analysis","retest_result","admin_reply"),("communication_status","pending_reply","admin_reply","retest_result")]:
            with self.subTest(pending_field=pending_field):
                self.reset(**{pending_field:pending_value});response=self.patch({clear_field:""});self.assertEqual(response[clear_field],"")
                self.reject({required_field:""})

    def test_valid_unrelated_patch_keeps_terminal_proofs_and_original_audit_details(self):
        before=self.snapshot();response=self.patch({"root_cause":"  clearer cause  ","modification_suggestion":" new suggestion "})
        self.assertEqual(response["root_cause"],"clearer cause");self.assertEqual(response["admin_reply"],"existing reply");self.assertEqual(response["retest_result"],"existing retest")
        row,audits=self.snapshot();self.assertEqual(row["communication_status"],"replied");self.assertEqual(row["improvement_status"],"resolved");self.assertNotEqual(row["updated_at"],before[0]["updated_at"])
        self.assertEqual(len(audits),1);self.assertEqual(audits[0][1:4],("skill_feedback.updated",self.issue_id,self.user_id));self.assertEqual(audits[0][4],{"root_cause":"clearer cause","modification_suggestion":"new suggestion"})

    def test_valid_proofs_or_existing_proofs_can_support_entering_terminal_states(self):
        self.reset(communication_status="pending_reply",improvement_status="pending_verification",admin_reply="",retest_result="")
        response=self.patch({"communication_status":"replied","improvement_status":"resolved","admin_reply":" actual reply ","retest_result":" actual retest "})
        self.assertEqual(response["admin_reply"],"actual reply");self.assertEqual(response["retest_result"],"actual retest")
        self.reset(communication_status="pending_reply",improvement_status="pending_verification")
        response=self.patch({"communication_status":"replied","improvement_status":"resolved"});self.assertEqual(response["admin_reply"],"existing reply");self.assertEqual(response["retest_result"],"existing retest")
        self.assertEqual(self.snapshot()[1][-1][4],{"communication_status":"replied","improvement_status":"resolved"})

    def test_reopening_states_then_clearing_proofs_preserves_existing_state_contract(self):
        response=self.patch({"communication_status":"pending_reply","improvement_status":"pending_analysis","admin_reply":"","retest_result":""})
        self.assertEqual(response["communication_status"],"pending_reply");self.assertEqual(response["improvement_status"],"pending_analysis");self.assertEqual(response["admin_reply"],"");self.assertEqual(response["retest_result"],"")
        self.reset();response=self.patch({"improvement_status":"pending_verification","retest_result":""});self.assertEqual(response["communication_status"],"replied");self.assertEqual(response["admin_reply"],"existing reply")

    def test_legacy_missing_proofs_reject_unrelated_patch_but_allow_explicit_repair(self):
        self.reset(admin_reply="",retest_result="");self.reject({"root_cause":"cannot leave inconsistent final state"})
        response=self.patch({"admin_reply":"verified reply","retest_result":"verified retest"});self.assertEqual(response["communication_status"],"replied");self.assertEqual(response["improvement_status"],"resolved")
        response=self.patch({"root_cause":"now consistent"});self.assertEqual(response["root_cause"],"now consistent")

    def test_null_empty_unknown_fields_statuses_and_missing_issue_keep_original_guards(self):
        self.reject({})
        for field in SkillIssueUpdate.model_fields:
            with self.subTest(null_field=field):self.reject({field:None})
        for invalid in [{"unknown_field":"ordinary extra"},{"communication_status":"unknown"},{"improvement_status":"unknown"}]:
            with self.subTest(invalid=invalid):
                before=self.snapshot()
                with self.assertRaises(ValidationError):SkillIssueUpdate(**invalid)
                self.assertEqual(self.snapshot(),before)
        before=self.snapshot()
        with self.assertRaises(HTTPException) as raised:self.patch({"root_cause":"fixture"},issue_id=99999)
        self.assertEqual(raised.exception.status_code,404);self.assertEqual(self.snapshot(),before)
