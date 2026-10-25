"""R87a: actual CRUD/outbox/SQLite transactions and asynchronous index substitute."""
import ast
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime
import importlib.util
import io
from pathlib import Path
from tempfile import TemporaryDirectory
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Response, status
from sqlalchemy import create_engine, delete, event, func, select, MetaData, Table, Column, Integer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from alembic import command
from alembic.migration import MigrationContext
from alembic.operations import Operations
import sqlalchemy as sa

from app.core.config import AuthUserProfile
from app.models import AuditLog, InspirationPost, PromptTemplate, PromptTemplateEvent, SearchIndexDomain, SearchIndexIntent, User
from app.schemas import InspirationPostCreate, InspirationPostOut, InspirationPostUpdate, PromptTemplateCreate, PromptTemplateOut, PromptTemplateUpdate
from app.services import search_index_outbox_service as outbox
from tests.test_review_agent_dispatch import load_functions, BACKEND
from tests.test_review_chat_partial_stream import TimerOnlyLoop
from tests.test_review_sqlite_agent_time_defaults import SQLiteAgentTimeDefaultsTests, NEW as OLD_HEAD
import asyncio


class FakeIndex:
    def __init__(self, client, name):
        self.client, self.name = client, name

    def update_documents(self, docs, primary_key=None):
        assert primary_key == "id"
        return self.client.submit(self.name, "upsert", deepcopy(docs[0]))

    def delete_document(self, entity_id):
        return self.client.submit(self.name, "delete", entity_id)


class FakeClient:
    def __init__(self):
        self.tasks, self.documents, self.submissions, self.lookups = {}, {}, [], []
        self.default_status = "succeeded"
        self.on_submit = None
        self.missing_uid = False
        self.submit_error = None

    def index(self, name):
        return FakeIndex(self, name)

    def submit(self, name, operation, data):
        self.submissions.append((name, operation, data))
        if self.submit_error:
            raise self.submit_error
        uid = len(self.tasks)
        self.tasks[uid] = {"uid": uid, "indexUid": name, "status": self.default_status, "operation": operation, "data": data}
        if self.on_submit:
            self.on_submit(uid)
        return {"indexUid": name, "status": "enqueued", **({} if self.missing_uid else {"taskUid": uid})}

    def get_task(self, uid):
        self.lookups.append(uid)
        task = self.tasks[uid]
        if task["status"] == "succeeded":
            docs = self.documents.setdefault(task["indexUid"], {})
            if task["operation"] == "upsert":
                docs[task["data"]["id"]] = deepcopy(task["data"])
            else:
                docs.pop(task["data"], None)
        return {key: task[key] for key in ("uid", "indexUid", "status")}


class SearchIndexOutboxTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(TemporaryDirectory(prefix="r87a-offline-")))
        self.engine = create_engine("sqlite:///" + (self.root / "outbox.db").as_posix())
        self.addCleanup(self.engine.dispose)
        event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        tables = set()
        def include(table):
            if table in tables:
                return
            tables.add(table)
            for key in table.foreign_keys:
                include(key.column.table)
        for model in (InspirationPost, PromptTemplate, PromptTemplateEvent, AuditLog, SearchIndexDomain, SearchIndexIntent):
            include(model.__table__)
        InspirationPost.metadata.create_all(self.engine, tables=list(tables))
        metadata = MetaData()
        self.guard = Table("r87_guard", metadata, Column("id", Integer, primary_key=True))
        metadata.create_all(self.engine)
        with self.engine.begin() as c:
            c.execute(self.guard.insert().values(id=1))
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        self.db = self.sessions()
        self.addCleanup(self.db.close)
        self.user = User(name="synthetic-r87", role="admin", project_codes=[])
        self.db.add_all([self.user, SearchIndexDomain(domain="inspiration"), SearchIndexDomain(domain="templates")])
        self.db.commit()
        self.auth = AuthUserProfile(name="synthetic-r87", role="admin", token="unused", user_id=self.user.id)
        self.client = FakeClient()
        self.permission = Mock()
        self.media = Mock(side_effect=lambda path, **kwargs: path)
        self.ns = {"__name__": "r87a_crud", "Session": Session, "BackgroundTasks": BackgroundTasks,
                   "Depends": Depends, "get_db": lambda: self.db, "get_current_auth_user": lambda: self.auth,
                   "AuthUserProfile": AuthUserProfile, "InspirationPost": InspirationPost, "PromptTemplate": PromptTemplate,
                   "InspirationPostCreate": InspirationPostCreate, "InspirationPostUpdate": InspirationPostUpdate,
                   "InspirationPostOut": InspirationPostOut, "PromptTemplateCreate": PromptTemplateCreate,
                   "PromptTemplateUpdate": PromptTemplateUpdate, "PromptTemplateOut": PromptTemplateOut,
                   "HTTPException": HTTPException, "Response": Response, "status": status,
                   "require_content_ops_access": self.permission, "_can_edit_post": lambda *args: True,
                   "prepare_inspiration_image": self.media, "_to_out": lambda row: {"id": row.id, "title": row.title},
                   "_to_prompt_template_out_for_user": lambda row, user: {"id": row.id, "title": row.title},
                   "_get_or_create_user": lambda *args: self.user,
                   "_get_shared_template": lambda db, ident: db.get(PromptTemplate, ident),
                   "write_audit_log": lambda **kwargs: kwargs["db"].add(AuditLog(event_type="synthetic", actor_name="synthetic", details={})),
                   "AuditEventType": SimpleNamespace(PROMPT_TEMPLATE_CREATED="created", PROMPT_TEMPLATE_UPDATED="updated", PROMPT_TEMPLATE_DELETED="deleted"),
                   "enqueue_index_change": outbox.enqueue_index_change, "schedule_index_dispatch": outbox.schedule_index_dispatch}
        load_functions("app/routers/inspiration.py", ["create_inspiration", "update_inspiration", "delete_inspiration"], self.ns)
        load_functions("app/routers/prompt_templates.py", ["create_shared_prompt_template", "update_shared_prompt_template", "delete_shared_prompt_template"], self.ns)

    def rows(self, model):
        with self.sessions() as db:
            return list(db.scalars(select(model)))

    def state(self, domain="inspiration"):
        with self.sessions() as db:
            return db.get(SearchIndexDomain, domain)

    def payload(self, title=" synthetic title "):
        return SimpleNamespace(title=title, description=" description ", source_image_path="", image_path="synthetic.png",
            media_type="image", category="", tags=[" tag ", ""], source_type="user", source_name=" synthetic ",
            source_url="", source_asset_id=None, prompt_text="synthetic prompt", model_name="synthetic")

    def shared_payload(self):
        return SimpleNamespace(media_type="image", category="c", subcategory="s", is_featured=False, label="label",
            title="shared title", prompt="shared prompt", style="modern", aspect_ratio="16:9", resolution="1k",
            deliverable="", notes="", source_image_path="", preview_image_path="")

    def create(self, **kwargs):
        return self.ns["create_inspiration"](self.payload(), db=self.db, auth_user=self.auth, **kwargs)

    def dispatch(self, domain="inspiration", **kwargs):
        return outbox.dispatch_index_domain(self.engine, domain, client=self.client, **kwargs)

    def update(self, entity_id, title):
        payload = SimpleNamespace(model_dump=lambda **kwargs: {"title": title})
        return self.ns["update_inspiration"](entity_id, payload, db=self.db, auth_user=self.auth)

    def test_create_commits_business_and_intent_without_pre_response_index_write(self):
        bg = BackgroundTasks()
        result = self.create(background_tasks=bg)
        self.assertEqual(result["title"], "synthetic title")
        post, = self.rows(InspirationPost)
        self.assertEqual((post.description, post.tags), ("description", ["tag"]))
        intent, = self.rows(SearchIndexIntent)
        self.assertEqual((intent.entity_id, intent.revision, intent.applied_revision), (result["id"], 1, 0))
        self.assertEqual(self.client.submissions, [])
        self.assertEqual(bg.tasks[0].args, (self.engine, "inspiration"))
        self.assertFalse(self.state().ready)

    def test_six_handlers_keep_fastapi_background_parameter_registration(self):
        router = APIRouter()
        for name in ("create_inspiration", "update_inspiration", "delete_inspiration", "create_shared_prompt_template", "update_shared_prompt_template", "delete_shared_prompt_template"):
            router.add_api_route("/" + name, self.ns[name], methods=["POST"], response_model=None)
        self.assertEqual(len(router.routes), 6)

    def test_response_body_precedes_background_index_failure(self):
        from app.integrations.search import service
        events = []
        self.client.submit_error = RuntimeError("synthetic index offline")
        original = self.client.submit
        def submit(*args):
            events.append("index")
            return original(*args)
        self.client.submit = submit
        app = FastAPI()
        @app.post("/test", status_code=201)
        async def endpoint(background_tasks: BackgroundTasks):
            return self.create(background_tasks=background_tasks)
        async def scenario():
            scope = {"type": "http", "http_version": "1.1", "method": "POST", "path": "/test", "raw_path": b"/test",
                     "root_path": "", "scheme": "http", "query_string": b"", "headers": [], "server": ("test", 80), "client": ("test", 1)}
            async def receive():
                return {"type": "http.request", "body": b"", "more_body": False}
            async def send(message):
                if message["type"] == "http.response.start":
                    self.assertEqual(message["status"], 201)
                    events.append("response")
                if message["type"] == "http.response.body":
                    events.append("body")
            await app(scope, receive, send)
        with patch.object(service, "_meili_client", return_value=self.client):
            with asyncio.Runner(loop_factory=TimerOnlyLoop) as runner:
                runner.run(scenario())
        self.assertLess(events.index("body"), events.index("index"))
        self.assertEqual(len(self.rows(InspirationPost)), 1)
        self.assertTrue(self.state().uncertain)
        self.assertEqual(len(self.rows(SearchIndexIntent)), 1)

    def test_business_and_intent_rollback_together_on_commit_failure(self):
        event.listen(self.db, "before_commit", lambda db: db.execute(self.guard.insert().values(id=1)), once=True)
        with self.assertRaises(IntegrityError):
            self.create()
        self.db.rollback()
        self.assertEqual(self.rows(InspirationPost), [])
        self.assertEqual(self.rows(SearchIndexIntent), [])
        self.assertEqual(self.state().revision, 0)

    def test_missing_migration_domain_fails_before_business_commit(self):
        self.db.execute(delete(SearchIndexDomain))
        self.db.commit()
        with self.assertRaisesRegex(RuntimeError, "migration"):
            self.create()
        self.db.rollback()
        self.assertEqual(self.rows(InspirationPost), [])

    def test_healthy_async_task_confirms_applied_revision_and_document(self):
        result = self.create()
        self.assertEqual(self.dispatch()["status"], "idle")
        intent, = self.rows(SearchIndexIntent)
        self.assertEqual(intent.applied_revision, intent.revision)
        state = self.state()
        self.assertIsNone(state.task_uid)
        document = self.client.documents[outbox.index_name(state)][result["id"]]
        self.assertEqual(document["title"], "synthetic title")
        self.assertEqual(len(document["_qmdh_fingerprint"]), 64)
        self.assertEqual(document["_qmdh_revision"], "1")
        self.assertFalse(state.ready)  # Incremental updates are not a full sync.

    def test_pending_task_is_not_success_and_blocks_later_submissions(self):
        entity_id = self.create()["id"]
        self.client.default_status = "processing"
        self.dispatch()
        self.assertEqual(self.state().task_uid, 0)
        self.update(entity_id, "latest title")
        self.dispatch()
        self.assertEqual(len(self.client.submissions), 1)
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)
        self.client.tasks[0]["status"] = "succeeded"
        self.client.default_status = "succeeded"
        self.dispatch()
        self.assertEqual(len(self.client.submissions), 2)
        state = self.state()
        self.assertEqual(self.client.documents[outbox.index_name(state)][entity_id]["title"], "latest title")
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 2)

    def test_failed_async_task_retries_latest_source_not_old_object(self):
        entity_id = self.create()["id"]
        self.client.default_status = "failed"
        self.dispatch()
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)
        self.assertEqual(self.state().error_code, "index_task_failed")
        self.update(entity_id, "new title after failure")
        self.client.default_status = "succeeded"
        self.dispatch()
        self.assertEqual(self.client.submissions[-1][2]["title"], "new title after failure")

    def test_delete_is_a_durable_tombstone_and_does_not_restore_entity(self):
        entity_id = self.create()["id"]
        self.dispatch()
        self.ns["delete_inspiration"](entity_id, db=self.db, auth_user=self.auth)
        self.assertEqual(self.rows(InspirationPost), [])
        self.assertEqual(self.rows(SearchIndexIntent)[0].operation, "delete")
        self.dispatch()
        self.assertEqual(self.client.submissions[-1][1:], ("delete", entity_id))
        self.assertNotIn(entity_id, self.client.documents[outbox.index_name(self.state())])
        self.assertEqual(self.rows(InspirationPost), [])

    def test_old_inflight_upsert_finishes_before_latest_delete(self):
        entity_id = self.create()["id"]
        self.client.default_status = "enqueued"
        self.dispatch()
        self.ns["delete_inspiration"](entity_id, db=self.db, auth_user=self.auth)
        self.client.tasks[0]["status"] = "succeeded"
        self.client.default_status = "succeeded"
        self.dispatch()
        self.assertEqual([op for _, op, _ in self.client.submissions], ["upsert", "delete"])
        self.assertNotIn(entity_id, self.client.documents[outbox.index_name(self.state())])
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 2)

    def test_unknown_submit_ack_does_not_blindly_resubmit(self):
        entity_id = self.create()["id"]
        self.client.missing_uid = True
        self.dispatch()
        self.assertTrue(self.state().uncertain)
        self.update(entity_id, "new while uncertain")
        self.dispatch()
        self.assertEqual(len(self.client.submissions), 1)
        self.assertEqual(self.rows(SearchIndexIntent)[0].revision, 2)
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)

    def test_receipt_commit_failure_keeps_uncertainty_without_second_http(self):
        self.create()
        def fail(db):
            if any(isinstance(r, SearchIndexDomain) and r.task_uid is not None for r in db.dirty):
                db.execute(self.guard.insert().values(id=1))
        event.listen(Session, "before_commit", fail)
        try:
            self.dispatch()
        finally:
            event.remove(Session, "before_commit", fail)
        self.assertTrue(self.state().uncertain)
        self.dispatch()
        self.assertEqual(len(self.client.submissions), 1)

    def test_lost_receipt_ack_polls_committed_task_without_resubmit(self):
        self.create()
        fired = []
        def lost(db):
            if not fired and any(isinstance(r, SearchIndexDomain) and r.task_uid is not None for r in db.identity_map.values()):
                fired.append(True)
                raise RuntimeError("synthetic receipt ack lost")
        event.listen(Session, "after_commit", lost)
        try:
            self.dispatch()
        finally:
            event.remove(Session, "after_commit", lost)
        self.assertTrue(fired)
        self.assertEqual(self.state().task_uid, 0)
        self.dispatch()
        self.assertEqual(len(self.client.submissions), 1)
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 1)

    def test_wrong_task_identity_never_marks_intent_applied(self):
        self.create()
        with patch.object(self.client, "get_task", return_value={"uid": 99, "indexUid": "wrong", "status": "succeeded"}):
            self.dispatch()
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)
        self.assertEqual(self.state().error_code, "task_identity_mismatch")

    def test_business_can_commit_while_http_submission_is_in_flight(self):
        entity_id = self.create()["id"]
        def change(uid):
            with self.sessions() as db:
                post = db.get(InspirationPost, entity_id)
                post.title = "changed during HTTP"
                outbox.enqueue_index_change(db, domain="inspiration", entity=post, operation="upsert")
                db.commit()
        self.client.on_submit = lambda uid: change(uid) if uid == 0 else None
        self.dispatch()
        self.assertEqual(self.client.submissions[-1][2]["title"], "changed during HTTP")
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 2)

    def test_concurrent_dispatchers_only_one_http_submission(self):
        self.create()
        entered, release = threading.Event(), threading.Event()
        self.client.on_submit = lambda uid: (entered.set(), release.wait(2))
        with ThreadPoolExecutor(max_workers=2) as workers:
            first = workers.submit(self.dispatch)
            self.assertTrue(entered.wait(2))
            second = workers.submit(self.dispatch)
            self.assertEqual(second.result(timeout=2)["code"], "submission_unconfirmed")
            release.set()
            first.result(timeout=2)
        self.assertEqual(len(self.client.submissions), 1)

    def test_stale_receipt_cannot_overwrite_new_generation_state(self):
        self.create()
        def flip(uid):
            with self.sessions() as db:
                state = outbox.lock_domain(db, "inspiration")
                state.active_index = "synthetic-new-generation"
                state.active_target_hash = outbox.target_hash(state.active_index)
                state.ready = True
                state.uncertain = False
                for key in outbox.TASK_FIELDS:
                    setattr(state, key, None)
                intent = db.scalar(select(SearchIndexIntent))
                intent.applied_revision = intent.revision
                db.commit()
        self.client.on_submit = flip
        self.dispatch()
        state = self.state()
        self.assertEqual(state.active_index, "synthetic-new-generation")
        self.assertFalse(state.uncertain)
        self.assertEqual(state.error_code, "")
        self.assertIsNone(state.task_uid)

    def test_shared_crud_and_private_scope_never_send_private_content(self):
        result = self.ns["create_shared_prompt_template"](self.shared_payload(), db=self.db, auth_user=self.auth)
        template_id = result["id"]
        self.dispatch("templates")
        payload = SimpleNamespace(model_dump=lambda **kwargs: {"prompt": "new shared prompt"})
        self.ns["update_shared_prompt_template"](template_id, payload, db=self.db, auth_user=self.auth)
        self.dispatch("templates")
        with self.sessions() as db:
            template = db.get(PromptTemplate, template_id)
            template.scope, template.prompt = "private", "secret private prompt"
            outbox.enqueue_index_change(db, domain="templates", entity=template, operation="upsert")
            db.commit()
        self.dispatch("templates")
        self.assertEqual(self.client.submissions[-1][1:], ("delete", template_id))
        self.assertNotIn("secret private prompt", str(self.client.submissions))
        self.permission.assert_called()

    def test_shared_delete_audit_failure_rolls_back_intent_and_business(self):
        result = self.ns["create_shared_prompt_template"](self.shared_payload(), db=self.db, auth_user=self.auth)
        before = self.state("templates").revision
        self.ns["write_audit_log"] = Mock(side_effect=RuntimeError("synthetic audit failure"))
        with self.assertRaises(RuntimeError):
            self.ns["delete_shared_prompt_template"](result["id"], db=self.db, auth_user=self.auth)
        self.db.rollback()
        self.assertEqual(len(self.rows(PromptTemplate)), 1)
        self.assertEqual(self.state("templates").revision, before)

    def test_disabled_or_missing_client_keeps_pending_without_network(self):
        self.create()
        from app.integrations.search import service
        with patch.object(service, "_meili_client", return_value=None):
            result = outbox.dispatch_index_domain(self.engine, "inspiration")
        self.assertEqual(result["code"], "index_unavailable")
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)
        self.assertFalse(self.state().uncertain)

    def test_native_sdk_task_objects_are_supported_without_client_requests(self):
        from meilisearch.models.task import TaskInfo, Task
        self.create()
        original = self.client.submit
        def submit(*args):
            data = original(*args)
            return TaskInfo(**data, type="documentAdditionOrUpdate", enqueuedAt="2024-01-01T00:00:00.000000Z")
        self.client.submit = submit
        original_get = self.client.get_task
        self.client.get_task = lambda uid: Task(**original_get(uid), type="documentAdditionOrUpdate", enqueuedAt="2024-01-01T00:00:00.000000Z")
        self.dispatch()
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 1)

    def test_intent_schema_keeps_no_document_payload_and_business_row_unchanged(self):
        result = self.create()
        before = deepcopy(self.rows(InspirationPost)[0].__dict__)
        self.dispatch()
        after = self.rows(InspirationPost)[0].__dict__
        self.assertEqual({k:v for k,v in before.items() if k!='_sa_instance_state'}, {k:v for k,v in after.items() if k!='_sa_instance_state'})
        self.assertNotIn("payload", SearchIndexIntent.__table__.columns)
        self.assertEqual(self.rows(SearchIndexIntent)[0].entity_id, result["id"])

    def test_original_post_commit_index_exception_retries_duplicate_business_rows(self):
        path = BACKEND.parent / "docs/archive/f78-r87a-2026-10-25/original/backend/app/routers/inspiration.py"
        node = next(n for n in ast.parse(path.read_text(encoding="utf-8")).body if isinstance(n, ast.FunctionDef) and n.name == "create_inspiration")
        node.decorator_list = []
        future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
        ns = self.ns.copy()
        ns["upsert_inspiration_post"] = Mock(side_effect=RuntimeError("synthetic index failure after commit"))
        exec(compile(ast.fix_missing_locations(ast.Module(body=[future, node], type_ignores=[])), str(path), "exec"), ns)
        for _ in range(2):
            with self.assertRaises(RuntimeError):
                ns["create_inspiration"](self.payload(), db=self.db, auth_user=self.auth)
        self.assertEqual(len(self.rows(InspirationPost)), 2)
        self.assertEqual(self.rows(SearchIndexIntent), [])
        self.db.execute(delete(InspirationPost))
        self.db.commit()
        result = self.create()
        self.client.submit_error = RuntimeError("same offline index")
        self.dispatch()
        self.assertIsInstance(result["id"], int)
        self.assertEqual(len(self.rows(InspirationPost)), 1)
        self.assertEqual(len(self.rows(SearchIndexIntent)), 1)

    def test_shared_delete_commits_tombstone_and_confirms_index_removal(self):
        result = self.ns["create_shared_prompt_template"](self.shared_payload(), db=self.db, auth_user=self.auth)
        self.dispatch("templates")
        response = self.ns["delete_shared_prompt_template"](result["id"], db=self.db, auth_user=self.auth)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.rows(PromptTemplate), [])
        self.dispatch("templates")
        intent, = self.rows(SearchIndexIntent)
        self.assertEqual((intent.operation, intent.applied_revision), ("delete", 2))
        self.assertEqual(self.client.submissions[-1][1:], ("delete", result["id"]))

    def test_update_failure_rolls_back_both_latest_row_and_revision(self):
        entity_id = self.create()["id"]
        event.listen(self.db, "before_commit", lambda db: db.execute(self.guard.insert().values(id=1)), once=True)
        with self.assertRaises(IntegrityError):
            self.update(entity_id, "must rollback")
        self.db.rollback()
        self.assertEqual(self.rows(InspirationPost)[0].title, "synthetic title")
        self.assertEqual(self.rows(SearchIndexIntent)[0].revision, 1)
        self.assertEqual(self.state().revision, 1)

    def test_task_lookup_failure_keeps_receipt_then_polls_without_resubmit(self):
        self.create()
        with patch.object(self.client, "get_task", side_effect=RuntimeError("synthetic lookup offline")):
            self.dispatch()
        self.assertEqual(self.state().task_uid, 0)
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)
        self.dispatch()
        self.assertEqual(len(self.client.submissions), 1)
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 1)

    def test_unknown_task_status_does_not_assume_success_or_resubmit(self):
        self.create()
        self.client.default_status = "unknown-status"
        self.dispatch()
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)
        self.assertEqual(self.state().error_code, "task_status_unknown")
        self.client.tasks[0]["status"] = "succeeded"
        self.dispatch()
        self.assertEqual(len(self.client.submissions), 1)

    def test_sdk_client_gets_finite_timeout_without_connecting(self):
        import meilisearch
        from app.integrations.search import service
        with patch.object(service.settings, "meilisearch_enabled", True), patch.object(meilisearch, "Client", return_value=self.client) as constructor:
            self.assertIs(service._meili_client(), self.client)
        self.assertEqual(constructor.call_args.kwargs["timeout"], 3)


class SearchOutboxMigrationTests(SQLiteAgentTimeDefaultsTests):
    def test_real_upgrade_adds_only_outbox_tables_and_seeds_domain_locks(self):
        self.upgrade(OLD_HEAD)
        before = set(__import__('sqlalchemy').inspect(self.engine).get_table_names())
        self.upgrade("head")
        after = set(__import__('sqlalchemy').inspect(self.engine).get_table_names())
        self.assertEqual(after-before, {"search_index_domains", "search_index_intents"})
        with self.engine.connect() as c:
            self.assertEqual(c.exec_driver_sql("SELECT domain,revision,ready,uncertain FROM search_index_domains ORDER BY domain").all(),
                             [("inspiration",0,0,0),("templates",0,0,0)])
        self.assertEqual(self.head(), ("e51fa962c846",))
        self.upgrade("head")
        with self.engine.connect() as c:
            self.assertEqual(c.exec_driver_sql("SELECT count(*) FROM search_index_domains").scalar_one(), 2)

    def test_migration_failure_rolls_back_tables_rows_and_head(self):
        self.upgrade(OLD_HEAD)
        before = self.snapshot()
        for point in ("ddl", "seed", "version"):
            def fail(conn, cursor, sql, params, context, many):
                upper = " ".join(sql.upper().split())
                if ((point == "ddl" and "CREATE TABLE SEARCH_INDEX_INTENTS" in upper)
                    or (point == "seed" and sql.startswith("INSERT INTO search_index_domains"))
                    or (point == "version" and upper.startswith("UPDATE ALEMBIC_VERSION") and "E51FA962C846" in upper + repr(params).upper())):
                    raise RuntimeError("synthetic migration failure")
            event.listen(self.engine, "before_cursor_execute", fail)
            try:
                with self.assertRaises(RuntimeError):
                    self.upgrade("head")
            finally:
                event.remove(self.engine, "before_cursor_execute", fail)
            self.assertEqual(self.head(), (OLD_HEAD,))
            self.assertNotIn("search_index_domains", sa.inspect(self.engine).get_table_names())
            self.assertEqual(self.snapshot(), before)

    def test_empty_downgrade_preserves_old_business_rows_but_pending_state_is_refused(self):
        self.upgrade(OLD_HEAD)
        with self.sessions() as db:
            db.add(InspirationPost(title="synthetic preserve", image_path="synthetic.png"))
            db.commit()
        before = self.snapshot()
        self.upgrade("head")
        with patch.object(outbox.settings, "database_url", self.url), patch.object(sa, "engine_from_config", return_value=self.engine):
            command.downgrade(self.config, OLD_HEAD)
        self.assertEqual(self.snapshot(), before)
        self.upgrade("head")
        with self.engine.begin() as c:
            c.exec_driver_sql("INSERT INTO search_index_intents (domain,entity_id,revision,operation) VALUES ('inspiration',77,1,'delete')")
        before = self.snapshot()
        with patch.object(outbox.settings, "database_url", self.url), patch.object(sa, "engine_from_config", return_value=self.engine):
            with self.assertRaisesRegex(RuntimeError, "Refusing"):
                command.downgrade(self.config, OLD_HEAD)
        self.assertEqual(self.snapshot(), before)

    def test_postgresql_upgrade_sql_compiles_without_connecting(self):
        path = BACKEND / "migrations/versions/e51fa962c846_add_search_index_outbox.py"
        spec = importlib.util.spec_from_file_location("r87_migration", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        output = io.StringIO()
        migration_context = MigrationContext.configure(dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output})
        with Operations.context(migration_context):
            module.upgrade()
        self.assertIn("CREATE TABLE search_index_domains", output.getvalue())
        self.assertIn("CREATE TABLE search_index_intents", output.getvalue())
        self.assertIn("'inspiration'", output.getvalue())
