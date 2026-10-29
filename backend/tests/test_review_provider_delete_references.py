"""R11 normal model lifecycle; real SQLite foreign keys and narrow rollback handling."""
from pathlib import Path
import sqlite3
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import Depends, HTTPException, Response, status
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, sessionmaker
from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import has_admin_access
from app.core.config import AuthUserProfile
from app.models import AuditLog, ChatMessage, Conversation, PlatformSettings, ProviderPricingRule, ProviderProfile, User
from tests.test_review_partial_image_progress import load


class ProviderDeleteReferenceTests(unittest.TestCase):
    def setUp(self):
        root=Path(self.enterContext(TemporaryDirectory(prefix="r11-offline-")))
        self.engine=create_engine("sqlite:///"+str(root/"models.db"));self.addCleanup(self.engine.dispose)
        event.listen(self.engine,"connect",lambda connection,_:connection.execute("PRAGMA foreign_keys=ON"))
        tables=set()
        def include(table):
            if table in tables:return
            tables.add(table)
            for key in table.foreign_keys:include(key.column.table)
        for model in (ProviderProfile,ProviderPricingRule,Conversation,ChatMessage,PlatformSettings,AuditLog):include(model.__table__)
        ProviderProfile.metadata.create_all(self.engine,tables=list(tables));self.sessions=sessionmaker(self.engine)
        with self.sessions() as db:
            user=User(name="r11-admin",role="admin");profile=ProviderProfile(provider_name="r11-provider",api_key="synthetic-unused",base_url="https://fixture.invalid",model_name="r11-model")
            db.add_all([user,profile]);db.flush();self.user_id=user.id;self.profile_id=profile.id;db.commit()
            self.assertEqual(db.scalar(text("PRAGMA foreign_keys")),1)
        self.auth=AuthUserProfile(name="r11-admin",role="admin",token="synthetic-unused",user_id=self.user_id)
        self.namespace={"__name__":__name__,"router":SimpleNamespace(delete=lambda *args,**kwargs:lambda fn:fn),"Depends":Depends,"get_db":lambda:None,"get_current_auth_user":lambda:None,
                        "Session":Session,"AuthUserProfile":AuthUserProfile,"Response":Response,"status":status,"HTTPException":HTTPException,"select":select,"IntegrityError":IntegrityError,"sqlite3":sqlite3,
                        "ProviderProfile":ProviderProfile,"Conversation":Conversation,"has_admin_access":has_admin_access,"write_audit_log":write_audit_log,"AuditEventType":AuditEventType}
        load("app/routers/providers.py",self.namespace,functions=["_require_provider_admin","_provider_delete_reference_conflict","delete_provider_profile"])

    def add_reference(self,db=None):
        def add(session):
            row=Conversation(user_id=self.user_id,model_provider_id=self.profile_id,title="retained chat",context_summary="retained summary");session.add(row);session.flush()
            session.add_all([ChatMessage(conversation_id=row.id,role="user",content="keep question",token_count=7),ChatMessage(conversation_id=row.id,role="assistant",content="keep answer",token_count=11)])
        if db is not None:add(db)
        else:
            with self.sessions() as session:add(session);session.commit()

    def add_rule(self,db):
        db.add(ProviderPricingRule(provider_profile_id=self.profile_id,capability="chat.completions",metric="input_tokens",unit_price=1.25,currency="USD"))

    def snapshot(self):
        with self.sessions() as db:
            self.assertEqual(db.scalar(text("PRAGMA foreign_keys")),1)
            return {"profiles":[(x.id,x.provider_name,x.model_name,x.enabled) for x in db.scalars(select(ProviderProfile).order_by(ProviderProfile.id))],
                    "rules":[(x.id,x.provider_profile_id,x.unit_price,x.currency) for x in db.scalars(select(ProviderPricingRule).order_by(ProviderPricingRule.id))],
                    "conversations":[(x.id,x.model_provider_id,x.title,x.context_summary) for x in db.scalars(select(Conversation).order_by(Conversation.id))],
                    "messages":[(x.id,x.conversation_id,x.role,x.content,x.token_count) for x in db.scalars(select(ChatMessage).order_by(ChatMessage.id))],
                    "audits":[(x.event_type,x.target_id,x.target_name) for x in db.scalars(select(AuditLog).order_by(AuditLog.id))]}

    def delete(self,db,profile_id=None):return self.namespace["delete_provider_profile"](self.profile_id if profile_id is None else profile_id,db,self.auth)

    def assert_conflict(self,db):
        with self.assertRaises(HTTPException) as raised:self.delete(db)
        self.assertEqual(raised.exception.status_code,409);self.assertIn("停用",raised.exception.detail)
        return raised.exception

    def test_referenced_chat_model_is_409_and_keeps_model_history_pricing_and_audit(self):
        self.add_reference()
        with self.sessions() as db:self.add_rule(db);db.commit()
        before=self.snapshot()
        with self.sessions() as db:self.assert_conflict(db)
        self.assertEqual(self.snapshot(),before)
        with self.sessions() as db:profile=db.get(ProviderProfile,self.profile_id);profile.enabled=False;db.commit()
        before=self.snapshot()
        with self.sessions() as db:self.assert_conflict(db)
        self.assertEqual(self.snapshot(),before)

    def test_unreferenced_model_returns_204_with_original_delete_audit(self):
        with self.sessions() as db:response=self.delete(db);self.assertEqual(response.status_code,204)
        state=self.snapshot();self.assertEqual(state["profiles"],[]);self.assertEqual(state["audits"],[(AuditEventType.PROVIDER_DELETED,self.profile_id,"r11-provider")])

    def test_repeat_and_missing_delete_are_404_without_duplicate_audit(self):
        with self.sessions() as db:self.delete(db)
        before=self.snapshot()
        for profile_id in [self.profile_id,99999]:
            with self.subTest(profile_id=profile_id),self.sessions() as db:
                with self.assertRaises(HTTPException) as raised:self.delete(db,profile_id)
                self.assertEqual(raised.exception.status_code,404)
        self.assertEqual(self.snapshot(),before)

    def test_reference_created_after_check_causes_real_fk_conflict_and_rollback(self):
        with self.sessions() as db:
            original=db.scalar;inserted=[]
            def after_check(statement,*args,**kwargs):
                result=original(statement,*args,**kwargs)
                if not inserted and "conversations" in str(statement):
                    self.assertIsNone(result)
                    with self.sessions() as other:self.add_reference(other);other.commit()
                    inserted.append(True)
                return result
            with patch.object(db,"scalar",after_check):error=self.assert_conflict(db)
            self.assertIsInstance(error.__cause__,IntegrityError);self.assertEqual(error.__cause__.orig.sqlite_errorcode,sqlite3.SQLITE_CONSTRAINT_FOREIGNKEY)
            self.assertFalse(db.in_transaction())
        self.assertTrue(inserted);state=self.snapshot();self.assertEqual(len(state["profiles"]),1);self.assertEqual(len(state["conversations"]),1);self.assertEqual(len(state["messages"]),2);self.assertEqual(state["audits"],[])

    def test_pricing_reference_created_after_delete_cascade_load_is_controlled_fk(self):
        with self.sessions() as db:
            # Preload the empty relation before pending audit autoflush takes a
            # SQLite write lock; the competing insert still uses a real connection.
            profile=db.get(ProviderProfile,self.profile_id)
            self.assertEqual(list(profile.pricing_rules),[])
            original=db.delete;inserted=[]
            def after_delete(profile):
                original(profile)
                with self.sessions() as other:self.add_rule(other);other.commit()
                inserted.append(True)
            with patch.object(db,"delete",after_delete):error=self.assert_conflict(db)
            self.assertIsInstance(error.__cause__,IntegrityError);self.assertEqual(error.__cause__.orig.sqlite_errorcode,sqlite3.SQLITE_CONSTRAINT_FOREIGNKEY)
            self.assertFalse(db.in_transaction())
        self.assertTrue(inserted);state=self.snapshot();self.assertEqual(len(state["profiles"]),1);self.assertEqual(len(state["rules"]),1);self.assertEqual(state["audits"],[])

    def test_unrelated_real_unique_error_is_rolled_back_and_not_disguised_as_reference(self):
        with self.sessions() as db:
            def audit(*args,**kwargs):
                write_audit_log(*args,**kwargs)
                db.add(ProviderProfile(provider_name="r11-provider",api_key="synthetic-unused",base_url="https://fixture.invalid",model_name="duplicate"))
            with patch.dict(self.namespace,write_audit_log=audit):
                with self.assertRaises(IntegrityError) as raised:self.delete(db)
            self.assertEqual(raised.exception.orig.sqlite_errorcode,sqlite3.SQLITE_CONSTRAINT_UNIQUE);self.assertFalse(db.in_transaction())
        state=self.snapshot();self.assertEqual(len(state["profiles"]),1);self.assertEqual(state["audits"],[])

    def test_other_table_real_fk_error_is_not_disguised_as_provider_delete_conflict(self):
        with self.sessions() as db:
            def audit(*args,**kwargs):
                write_audit_log(*args,**kwargs)
                db.add(ProviderPricingRule(provider_profile_id=999999,capability="chat.completions",metric="input_tokens",unit_price=1))
            with patch.dict(self.namespace,write_audit_log=audit):
                with self.assertRaises(IntegrityError) as raised:self.delete(db)
            self.assertEqual(raised.exception.orig.sqlite_errorcode,sqlite3.SQLITE_CONSTRAINT_FOREIGNKEY);self.assertFalse(db.in_transaction())
        state=self.snapshot();self.assertEqual(len(state["profiles"]),1);self.assertEqual(state["rules"],[]);self.assertEqual(state["audits"],[])

    def test_commit_failure_rolls_back_delete_audit_and_keeps_session_usable(self):
        with self.sessions() as db:
            def fail(session):raise OperationalError("synthetic commit failure",{},RuntimeError("offline"))
            event.listen(db,"before_commit",fail)
            try:
                with self.assertRaises(OperationalError):self.delete(db)
            finally:event.remove(db,"before_commit",fail)
            self.assertFalse(db.in_transaction());self.assertIsNotNone(db.get(ProviderProfile,self.profile_id))
        self.assertEqual(self.snapshot()["audits"],[])

    def test_error_classifier_handles_driver_codes_only_for_provider_delete(self):
        predicate=self.namespace["_provider_delete_reference_conflict"]
        for attrs,statement,expected in [({"sqlstate":"23503"},"DELETE FROM provider_profiles WHERE id=1",True),({"pgcode":"23503"},'DELETE FROM "provider_profiles" WHERE id=1',True),({"sqlstate":"23505"},"DELETE FROM provider_profiles WHERE id=1",False),({"sqlite_errorcode":787},"DELETE FROM provider_profiles WHERE id=1",True),({"sqlite_errorcode":2067},"DELETE FROM provider_profiles WHERE id=1",False),({"sqlite_errorcode":787},"INSERT INTO provider_pricing_rules VALUES (1)",False),({"sqlstate":"23503"},"DELETE FROM other_table WHERE id=1",False),({"sqlstate":"23503"},None,False)]:
            with self.subTest(code=attrs,statement=statement):self.assertEqual(predicate(SimpleNamespace(orig=SimpleNamespace(**attrs),statement=statement)),expected)

    def test_pricing_cascade_settings_null_and_unrelated_conversations_keep_existing_contract(self):
        with self.sessions() as db:
            self.add_rule(db);other=ProviderProfile(provider_name="r11-other",api_key="synthetic-unused",base_url="https://fixture.invalid",model_name="other");db.add(other);db.flush();other_id=other.id
            db.add_all([PlatformSettings(id=1,prompt_polish_provider_id=self.profile_id,prompt_polish_enabled=True),Conversation(user_id=self.user_id,model_provider_id=other.id,title="other model"),Conversation(user_id=self.user_id,model_provider_id=None,title="no model")]);db.commit()
        with self.sessions() as db:self.assertEqual(self.delete(db).status_code,204)
        state=self.snapshot();self.assertEqual([x[0] for x in state["profiles"]],[other_id]);self.assertEqual(state["rules"],[])
        self.assertEqual([x[1] for x in state["conversations"]],[other_id,None])
        with self.sessions() as db:
            self.assertIsNone(db.get(PlatformSettings,1).prompt_polish_provider_id);self.assertTrue(db.get(PlatformSettings,1).prompt_polish_enabled)
