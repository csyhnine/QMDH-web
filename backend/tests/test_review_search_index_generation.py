"""R87b generation replacement and DB-authoritative search, entirely offline."""
from copy import deepcopy
from concurrent.futures import ThreadPoolExecutor
import threading
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import AuthUserProfile
from app.integrations.search import service, sync
from app.models import InspirationPost, PromptTemplate, SearchIndexDomain, SearchIndexIntent
from app.services import search_index_generation_service as generation
from app.services import search_index_outbox_service as outbox
from tests.test_review_agent_dispatch import load_functions
from tests.test_review_search_index_outbox import SearchIndexOutboxTests as OutboxFixture


class GenerationIndex:
    def __init__(self, client, name):
        self.client, self.name = client, name

    def update_documents(self, documents, primary_key=None):
        assert primary_key in (None, "id")
        return self.client.submit(self.name, "batch", deepcopy(documents))

    def delete_document(self, ident):
        return self.client.submit(self.name, "delete", ident)

    def update_searchable_attributes(self, fields):
        return self.client.submit(self.name, "searchable", deepcopy(fields))

    def update_filterable_attributes(self, fields):
        return self.client.submit(self.name, "filterable", deepcopy(fields))

    def get_stats(self):
        if self.client.on_stats:
            self.client.on_stats(self.name)
        count = len(self.client.documents.get(self.name, {}))
        return SimpleNamespace(number_of_documents=count if self.client.count_override is None else self.client.count_override)

    def search(self, query, parameters):
        self.client.searches.append((self.name, query, parameters))
        result = self.client.search_payload
        if result is None:
            result = {"hits": [deepcopy(doc) for doc in self.client.documents.get(self.name, {}).values()
                               if query.casefold() in str(doc).casefold()][:parameters["limit"]]}
        else:
            result = deepcopy(result)
        if self.client.on_search:
            self.client.on_search()
        return result


class GenerationClient:
    def __init__(self):
        self.tasks, self.documents, self.configurations = {}, {}, {}
        self.submissions, self.waits, self.searches = [], [], []
        self.statuses, self.applied = {}, set()
        self.on_submit = self.on_stats = self.on_search = None
        self.count_override = self.search_payload = None
        self.receipt_mutator = self.task_mutator = None

    def index(self, name):
        return GenerationIndex(self, name)

    def create_index(self, name, options):
        assert options == {"primaryKey": "id"}
        return self.submit(name, "create", None)

    def submit(self, name, operation, data):
        uid = len(self.tasks)
        self.submissions.append((name, operation, deepcopy(data)))
        self.tasks[uid] = {"uid": uid, "indexUid": name, "status": self.statuses.get(operation, "succeeded"),
                           "operation": operation, "data": deepcopy(data)}
        if self.on_submit:
            self.on_submit(uid)
        result = {"taskUid": uid, "indexUid": name, "status": "enqueued"}
        return self.receipt_mutator(result) if self.receipt_mutator else result

    def get_task(self, uid):
        task = self.tasks[uid]
        if task["status"] == "succeeded" and uid not in self.applied:
            name, operation, data = task["indexUid"], task["operation"], task["data"]
            docs = self.documents.setdefault(name, {})
            if operation == "create":
                assert not docs, "a fresh generation must not overwrite another index"
            elif operation in {"batch", "upsert"}:
                for document in data if operation == "batch" else [data]:
                    docs[document["id"]] = deepcopy(document)
            elif operation == "delete":
                docs.pop(data, None)
            else:
                self.configurations.setdefault(name, {})[operation] = data
            self.applied.add(uid)
        result = {key: task[key] for key in ("uid", "indexUid", "status")}
        return self.task_mutator(result) if self.task_mutator else result

    def wait_for_task(self, uid, **kwargs):
        self.waits.append((uid, kwargs))
        return self.get_task(uid)


class SearchIndexGenerationTests(OutboxFixture):
    def setUp(self):
        super().setUp()
        self.client = GenerationClient()
        self.enterContext(patch.object(service.settings, "meilisearch_enabled", True))
        self.enterContext(patch.object(service, "_meili_client", return_value=self.client))
        self.enterContext(patch.object(sync, "_meili_client", return_value=self.client))

    def rebuild(self, domain="inspiration", client=None):
        configure = sync._configure_inspiration_index if domain == "inspiration" else sync._configure_templates_index
        return generation.rebuild_index(self.engine, domain, client=client or self.client, configure=configure)

    def read(self, domain="inspiration", query="synthetic", limit=20):
        return service.search_domain(self.db, domain=domain, query=query, limit=limit)

    def active(self, domain="inspiration"):
        return self.state(domain).active_index

    def old_ready(self, domain="inspiration"):
        name = "synthetic_old_" + domain
        self.client.documents[name] = {999999: {"id": 999999, "title": "synthetic ghost"}}
        with self.sessions() as db:
            state = db.get(SearchIndexDomain, domain)
            state.active_index, state.active_target_hash, state.ready = name, outbox.target_hash(name), True
            db.commit()
        return name

    def test_original_sync_keeps_deleted_ids_new_generation_replaces_complete_set(self):
        ident = self.create()["id"]
        old = service.settings.meilisearch_inspiration_index
        self.client.documents[old] = {999999: {"id": 999999, "title": "synthetic ghost"}}
        namespace = {"Session": Session, "select": select, "settings": service.settings,
                     "InspirationPost": InspirationPost, "_meili_client": lambda: self.client,
                     "build_inspiration_document": lambda row: outbox.build_index_document("inspiration", row),
                     "_configure_inspiration_index": lambda index: None}
        path = "../docs/archive/f79-r87b-2026-10-25/original/backend/app/integrations/search/sync.py"
        load_functions(path, ["sync_inspiration_index"], namespace)
        self.assertEqual(namespace["sync_inspiration_index"](self.db), 1)
        for uid in list(self.client.tasks):
            self.client.get_task(uid)
        self.assertEqual(set(self.client.documents[old]), {ident, 999999})
        namespace.update(SearchHit=service.SearchHit, _sql_inspiration_hits=service._sql_inspiration_hits,
                         _sql_template_hits=service._sql_template_hits)
        path = "../docs/archive/f79-r87b-2026-10-25/original/backend/app/integrations/search/service.py"
        load_functions(path, ["_meili_hits", "search_domain"], namespace)
        self.assertIn(999999, [h.id for h in namespace["search_domain"](self.db,domain="inspiration",query="synthetic")])
        self.assertEqual([h.id for h in self.read()], [ident])
        self.assertEqual(self.rebuild(), 1)
        self.assertNotEqual(self.active(), old)
        self.assertEqual(set(self.client.documents[self.active()]), {ident})
        self.assertIn(999999, self.client.documents[old])
        self.assertEqual([hit.id for hit in self.read()], [ident])

    def test_zero_sync_activates_empty_new_index_without_clearing_old_index(self):
        old = self.old_ready()
        self.assertEqual(self.rebuild(), 0)
        self.assertNotEqual(self.active(), old)
        self.assertEqual(self.client.documents[self.active()], {})
        self.assertEqual(set(self.client.documents[old]), {999999})
        self.assertEqual([op for _, op, _ in self.client.submissions], ["create", "searchable", "filterable"])
        self.assertTrue(self.state().ready)

    def test_partial_then_full_rebuild_removes_absent_ids_and_preserves_current_fields(self):
        first, second = self.create()["id"], self.create()["id"]
        self.assertEqual(self.rebuild(), 2)
        old = self.active()
        self.ns["delete_inspiration"](first, db=self.db, auth_user=self.auth)
        self.update(second, "updated synthetic")
        third = self.create()["id"]
        self.assertEqual(self.rebuild(), 2)
        docs = self.client.documents[self.active()]
        self.assertEqual(set(docs), {second, third})
        self.assertEqual(docs[second]["title"], "updated synthetic")
        self.assertIn(first, self.client.documents[old])
        self.assertTrue(all(row.applied_revision == row.revision for row in self.rows(SearchIndexIntent)))

    def test_shared_template_rebuild_excludes_private_and_keeps_domains_independent(self):
        self.create()
        shared = self.ns["create_shared_prompt_template"](self.shared_payload(), db=self.db, auth_user=self.auth)["id"]
        self.db.add(PromptTemplate(scope="private", label="private", title="shared secret", prompt="private secret", user_id=self.user.id))
        self.db.commit()
        self.assertEqual(sync.sync_templates_index(self.db), 1)
        self.assertEqual(set(self.client.documents[self.active("templates")]), {shared})
        self.assertIsNone(self.active())
        self.assertEqual([h.id for h in self.read("templates", "shared")], [shared])
        self.assertNotIn("private secret", str(self.client.submissions))

    def test_each_async_failure_or_nonterminal_preserves_pointer_and_pending(self):
        self.create()
        old = self.old_ready()
        for operation in ("create", "searchable", "filterable", "batch"):
            for status in ("failed", "canceled", "enqueued", "processing", "unknown"):
                with self.subTest(operation=operation, status=status):
                    client = GenerationClient();client.statuses[operation] = status
                    with self.assertRaisesRegex(generation.SearchIndexSyncError, "task_not_succeeded"):
                        self.rebuild(client=client)
                    self.assertEqual(self.active(), old)
                    self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)

    def test_invalid_receipt_task_identity_and_count_never_activate(self):
        self.create()
        old = self.old_ready()
        cases = [("receipt_mutator", lambda r: {**r, "taskUid": None}),
                 ("receipt_mutator", lambda r: {**r, "indexUid": "other"}),
                 ("task_mutator", lambda r: {**r, "uid": 1000}),
                 ("task_mutator", lambda r: {**r, "indexUid": "other"}),
                 ("count_override", 0), ("count_override", True), ("count_override", "1")]
        for key, value in cases:
            with self.subTest(key=key, value=str(value)):
                client = GenerationClient();setattr(client, key, value)
                with self.assertRaises(generation.SearchIndexSyncError):self.rebuild(client=client)
                self.assertEqual(self.active(), old)

    def test_timeout_and_submit_exception_are_static_and_preserve_old_generation(self):
        self.create();old = self.old_ready()
        for name in ("wait_for_task", "create_index"):
            with patch.object(self.client, name, side_effect=RuntimeError("synthetic private credential/body")):
                with self.assertRaisesRegex(generation.SearchIndexSyncError, "index_build_unconfirmed") as caught:
                    self.rebuild()
                self.assertNotIn("credential", str(caught.exception))
                self.assertEqual(self.active(), old)

    def test_business_change_during_build_rejects_stale_snapshot_and_retry_uses_latest(self):
        ident = self.create()["id"];old = self.old_ready()
        def mutate(_):
            self.client.on_stats = None
            self.update(ident, "new synthetic")
        self.client.on_stats = mutate
        with self.assertRaisesRegex(generation.SearchIndexSyncError, "source_changed"):self.rebuild()
        self.assertEqual(self.active(), old)
        self.assertEqual(self.rebuild(), 1)
        self.assertEqual(self.client.documents[self.active()][ident]["title"], "new synthetic")

    def test_two_concurrent_syncs_cas_only_one_current_generation(self):
        self.create();old = self.old_ready();barrier = threading.Barrier(2)
        clients = [GenerationClient(), GenerationClient()]
        for client in clients:client.on_stats = lambda _: barrier.wait(timeout=5)
        def rebuild(client):
            try:return self.rebuild(client=client)
            except generation.SearchIndexSyncError as exc:return exc.code
        with ThreadPoolExecutor(max_workers=2) as pool:results = list(pool.map(rebuild, clients))
        self.assertCountEqual(results, [1, "source_changed"])
        self.assertNotEqual(self.active(), old)
        self.assertEqual(sum(self.active() in client.documents for client in clients), 1)

    def test_uncertain_submission_is_recovered_and_late_old_write_cannot_corrupt_active(self):
        ident = self.create()["id"];old = self.old_ready()
        def recover(uid):
            task = self.client.tasks[uid]
            if task["indexUid"] == old and task["operation"] == "batch":
                self.client.on_submit = None
                self.update(ident, "latest synthetic")
                self.assertEqual(self.rebuild(), 1)
        self.client.on_submit = recover
        self.dispatch()  # Submission begun before rebuild cannot claim the new receipt.
        old_uid = next(uid for uid, task in self.client.tasks.items() if task["indexUid"] == old)
        self.client.get_task(old_uid)
        self.assertEqual(self.client.documents[old][ident]["title"], "synthetic title")
        self.assertEqual(self.client.documents[self.active()][ident]["title"], "latest synthetic")
        self.assertFalse(self.state().uncertain)
        self.assertIsNone(self.state().task_uid)
        self.assertEqual(self.dispatch()["status"], "idle")

    def test_old_known_receipt_ack_cannot_overwrite_new_generation(self):
        self.create();self.old_ready()
        self.client.statuses["batch"] = "processing"
        self.dispatch()
        descriptor = outbox._prepare(self.engine, "inspiration")
        self.client.statuses.clear()
        self.assertEqual(self.rebuild(), 1)
        name = self.active()
        result = {"uid": descriptor["uid"], "indexUid": descriptor["index"], "status": "succeeded"}
        self.assertEqual(outbox._ack(self.engine, "inspiration", descriptor, result), "stale")
        self.assertEqual(self.active(), name)

    def test_activation_failure_rolls_back_pointer_and_intent_ack(self):
        self.create();old = self.old_ready()
        with patch.object(Session, "commit", side_effect=RuntimeError("synthetic activation failure")):
            with self.assertRaisesRegex(generation.SearchIndexSyncError, "activation_unconfirmed"):self.rebuild()
        self.assertEqual(self.active(), old)
        self.assertEqual(self.rows(SearchIndexIntent)[0].applied_revision, 0)

    def test_lost_activation_ack_is_confirmed_without_new_index_or_task_replay(self):
        self.create();self.old_ready();commit = Session.commit
        def lost(db):
            commit(db)
            raise RuntimeError("synthetic ack lost")
        with patch.object(Session, "commit", lost):self.assertEqual(self.rebuild(), 1)
        self.assertTrue(self.state().ready)
        self.assertEqual([op for _, op, _ in self.client.submissions].count("create"), 1)
        self.assertTrue(all(r.applied_revision == r.revision for r in self.rows(SearchIndexIntent)))

    def test_client_unavailable_reports_failure_instead_of_successful_zero(self):
        with patch.object(sync, "_meili_client", return_value=None):
            with self.assertRaisesRegex(generation.SearchIndexSyncError, "client_unavailable"):
                sync.sync_inspiration_index(self.db)
        self.assertIsNone(self.active())

    def test_search_returns_database_projection_and_finite_score_only(self):
        ident = self.create()["id"];self.rebuild()
        remote = deepcopy(self.client.documents[self.active()][ident])
        remote.update(title="forged title", snippet="forged text", category="forged", tags=["forged"], _rankingScore=0.92)
        self.client.search_payload = {"hits": [remote]}
        hit, = self.read()
        self.assertEqual((hit.id, hit.title, hit.snippet, hit.tags, hit.score),
                         (ident, "synthetic title", "description", ("tag",), 0.92))
        for bad in (None, "bad", float("nan"), float("inf")):
            self.client.search_payload["hits"][0]["_rankingScore"] = bad
            self.assertEqual(self.read()[0].score, 0.0)

    def test_not_ready_pending_uncertain_and_target_drift_use_sql_without_search(self):
        ident = self.create()["id"]
        self.assertEqual([h.id for h in self.read()], [ident])
        self.assertEqual(self.client.searches, [])
        self.rebuild()
        for attribute, value in (("ready", False), ("uncertain", True), ("task_uid", 0),
                                  ("submission_token", "synthetic"), ("active_target_hash", "wrong")):
            with self.subTest(attribute=attribute):
                with self.sessions() as db:
                    state=db.get(SearchIndexDomain,"inspiration");original=getattr(state,attribute);setattr(state,attribute,value);db.commit()
                self.assertEqual([h.id for h in self.read()], [ident])
                with self.sessions() as db:
                    state=db.get(SearchIndexDomain,"inspiration");setattr(state,attribute,original);db.commit()
        self.update(ident, "pending synthetic")
        self.assertEqual(self.read()[0].title, "pending synthetic")
        self.assertEqual(self.client.searches, [])

    def test_deleted_private_or_stale_hits_fall_back_to_current_source(self):
        ident = self.create()["id"];self.rebuild()
        stale=deepcopy(self.client.documents[self.active()][ident]);self.update(ident,"fresh synthetic");self.dispatch()
        self.client.search_payload={"hits":[stale]}
        self.assertEqual(self.read()[0].title,"fresh synthetic")
        self.client.search_payload={"hits":[{**stale,"id":999999}]}
        self.assertEqual([h.id for h in self.read()],[ident])
        self.ns["delete_inspiration"](ident,db=self.db,auth_user=self.auth);self.dispatch()
        self.client.search_payload={"hits":[stale]}
        self.assertEqual(self.read(),[])
        shared=self.ns["create_shared_prompt_template"](self.shared_payload(),db=self.db,auth_user=self.auth)["id"]
        self.rebuild("templates");document=deepcopy(self.client.documents[self.active("templates")][shared])
        with self.sessions() as db:
            row=db.get(PromptTemplate,shared);row.scope="private";db.commit()
        self.client.search_payload={"hits":[document]}
        self.assertEqual(self.read("templates","shared"),[])

    def test_mutation_during_search_even_when_acknowledged_uses_new_sql_snapshot(self):
        self.create();self.rebuild();self.client.search_payload={"hits":[]}
        def mutate():
            self.client.on_search=None
            self.create();self.dispatch()
        self.client.on_search=mutate
        self.assertEqual(len(self.read()),2)

    def test_pointer_change_during_search_does_not_trust_old_generation(self):
        ident=self.create()["id"];self.rebuild();old=self.active()
        def replace():
            self.client.on_search=None
            self.rebuild()
        self.client.on_search=replace;self.client.search_payload={"hits":[]}
        self.assertEqual([h.id for h in self.read()],[ident])
        self.assertNotEqual(self.active(),old)

    def test_malformed_remote_results_use_sql_without_manufactured_hits(self):
        ident=self.create()["id"];self.rebuild();doc=deepcopy(self.client.documents[self.active()][ident])
        for payload in ({}, {"hits":None}, {"hits":"bad"}, {"hits":[None]},
                        {"hits":[{**doc,"id":True}]}, {"hits":[{**doc,"id":1.5}]},
                        {"hits":[{**doc,"id":"invalid"}]}, {"hits":[doc,doc]},
                        {"hits":[{**doc,"_qmdh_fingerprint":"wrong"}]}):
            with self.subTest(payload=str(payload)):
                self.client.search_payload=payload
                self.assertEqual([h.id for h in self.read()],[ident])

    def test_search_exception_or_disabled_client_preserves_sql_contract_and_limits(self):
        for _ in range(3):self.create()
        self.rebuild()
        with patch.object(GenerationIndex,"search",side_effect=RuntimeError("synthetic offline")):
            self.assertEqual(len(self.read(limit=2)),2)
        with patch.object(service,"_meili_client",return_value=None):self.assertEqual(len(self.read(limit=1)),1)
        with patch.object(service.settings,"meilisearch_enabled",False):self.assertEqual(len(self.read(limit=-1)),1)
        self.assertEqual(self.read(query="  "),[])
        self.assertEqual(self.read(domain="unknown"),[])

    def test_missing_migration_search_falls_back_without_mutating_caller_session(self):
        ident=self.create()["id"]
        row=self.db.get(InspirationPost,ident);row.title="uncommitted synthetic"
        with self.engine.begin() as db:
            db.exec_driver_sql("DROP TABLE search_index_intents")
            db.exec_driver_sql("DROP TABLE search_index_domains")
        self.assertEqual(self.read()[0].title,"synthetic title")
        self.assertEqual(row.title,"uncommitted synthetic")
        self.assertIn(row,self.db.dirty)
        self.assertEqual(self.client.searches,[])

    def test_sync_and_read_do_not_flush_commit_or_rollback_caller_changes(self):
        ident=self.create()["id"];row=self.db.get(InspirationPost,ident)
        row.title="uncommitted synthetic"
        extra=InspirationPost(title="uncommitted new",image_path="synthetic.png");self.db.add(extra)
        self.assertEqual(sync.sync_inspiration_index(self.db),1)
        self.assertEqual(self.read()[0].title,"synthetic title")
        self.assertEqual(row.title,"uncommitted synthetic")
        self.assertIn(row,self.db.dirty);self.assertIn(extra,self.db.new);self.assertIsNone(extra.id)

    def test_sql_failure_is_not_reported_as_successful_empty_search(self):
        with patch.object(service.settings,"meilisearch_enabled",False),patch.object(service,"_sql_inspiration_hits",side_effect=RuntimeError("synthetic DB failure")):
            with self.assertRaisesRegex(RuntimeError,"synthetic DB failure"):self.read()

    def test_sync_router_reports_static_failures_and_preserves_auth_and_disabled_guard(self):
        permission=Mock();first=Mock(return_value=1);second=Mock(return_value=0)
        namespace={"Session":Session,"Depends":Depends,"get_db":lambda:None,"get_current_auth_user":lambda:None,
                   "AuthUserProfile":AuthUserProfile,"SearchSyncOut":SimpleNamespace,"HTTPException":HTTPException,
                   "require_backoffice_access":permission,"sync_inspiration_index":first,"sync_templates_index":second,
                   "SearchIndexSyncError":generation.SearchIndexSyncError}
        load_functions("app/routers/search.py",["sync_search_indexes"],namespace)
        route=namespace["sync_search_indexes"]
        self.assertEqual(route(db=self.db,auth_user=self.auth).inspiration_documents,1)
        for code,status in (("source_changed",409),("index_build_unconfirmed",503),("client_unavailable",503)):
            first.side_effect=generation.SearchIndexSyncError("inspiration",code)
            with self.assertRaises(HTTPException) as caught:route(db=self.db,auth_user=self.auth)
            self.assertEqual(caught.exception.status_code,status)
        with patch.object(service.settings,"meilisearch_enabled",False):
            with self.assertRaises(HTTPException) as caught:route(db=self.db,auth_user=self.auth)
            self.assertEqual(caught.exception.status_code,400)
        first.side_effect=None;permission.side_effect=HTTPException(403,"synthetic permission denied");first.reset_mock()
        with self.assertRaises(HTTPException) as caught:route(db=self.db,auth_user=self.auth)
        self.assertEqual(caught.exception.status_code,403);first.assert_not_called()

    def test_target_configuration_change_during_build_refuses_activation(self):
        self.create();old=self.old_ready()
        def changed(_):service.settings.meilisearch_url="http://synthetic.changed.invalid"
        original=service.settings.meilisearch_url
        self.client.on_stats=changed
        try:
            with self.assertRaisesRegex(generation.SearchIndexSyncError,"source_changed"):self.rebuild()
        finally:service.settings.meilisearch_url=original
        self.assertEqual(self.active(),old)

    def test_batch_failure_never_switches_partial_large_generation(self):
        self.db.add_all([InspirationPost(title=f"synthetic {i}",image_path="synthetic.png") for i in range(501)])
        self.db.commit();old=self.old_ready()
        def fail_second(uid):
            batches=[task for task in self.client.tasks.values() if task["operation"]=="batch"]
            if len(batches)==2:self.client.tasks[uid]["status"]="failed"
        self.client.on_submit=fail_second
        with self.assertRaisesRegex(generation.SearchIndexSyncError,"task_not_succeeded"):self.rebuild()
        self.assertEqual(self.active(),old)
        self.client.on_submit=None
        self.assertEqual(self.rebuild(),501)
        self.assertEqual(len(self.client.documents[self.active()]),501)
        self.assertTrue(all(kwargs=={"timeout_in_ms":5000,"interval_in_ms":100} for _,kwargs in self.client.waits))

    def test_native_sdk_receipts_tasks_and_stats_work_without_sdk_http(self):
        from meilisearch.models.task import Task, TaskInfo
        from meilisearch.models.index import IndexStats
        self.create()
        timestamp="2024-01-01T00:00:00.000000Z"
        self.client.receipt_mutator=lambda value:TaskInfo(**value,type="synthetic",enqueuedAt=timestamp)
        self.client.task_mutator=lambda value:Task(**value,type="synthetic",enqueuedAt=timestamp)
        with patch.object(GenerationIndex,"get_stats",lambda index:IndexStats({"numberOfDocuments":len(index.client.documents[index.name])})):
            self.assertEqual(self.rebuild(),1)
        self.assertEqual(self.client.waits[0][0],0)
        self.assertEqual(len(self.read()),1)

    def test_durable_uncertain_submission_recovers_after_new_generation(self):
        ident=self.create()["id"];old=self.old_ready()
        self.client.receipt_mutator=lambda value:{k:v for k,v in value.items() if k!="taskUid"}
        self.assertEqual(self.dispatch()["code"],"submission_unconfirmed")
        self.assertTrue(self.state().uncertain)
        old_uid=next(iter(self.client.tasks))
        self.update(ident,"recovered synthetic")
        self.client.receipt_mutator=None
        self.assertEqual(self.rebuild(),1)
        self.client.get_task(old_uid)
        self.assertEqual(self.client.documents[old][ident]["title"],"synthetic title")
        self.assertEqual(self.read()[0].title,"recovered synthetic")
        self.assertEqual(self.dispatch()["status"],"idle")

    def test_inactive_caller_session_is_not_reused_or_implicitly_rolled_back(self):
        from sqlalchemy.exc import IntegrityError
        self.create()
        self.db.add(InspirationPost(title="bad fixture without image",image_path=None))
        with self.assertRaises(IntegrityError):self.db.flush()
        self.assertFalse(self.db.is_active)
        self.assertEqual(self.rebuild(),1)
        self.assertEqual(self.read()[0].title,"synthetic title")
        self.assertFalse(self.db.is_active)

    def test_missing_snapshot_state_fails_before_remote_index_creation(self):
        self.create()
        with self.engine.begin() as db:
            db.exec_driver_sql("DELETE FROM search_index_intents")
            db.exec_driver_sql("DELETE FROM search_index_domains WHERE domain='inspiration'")
        with self.assertRaisesRegex(generation.SearchIndexSyncError,"snapshot_unavailable"):self.rebuild()
        self.assertEqual(self.client.submissions,[])
        self.assertEqual(self.read()[0].title,"synthetic title")

    def test_client_factory_failure_is_a_static_sync_error_for_both_domains(self):
        for wrapper in (sync.sync_inspiration_index,sync.sync_templates_index):
            with patch.object(sync,"_meili_client",side_effect=RuntimeError("synthetic credential")):
                with self.assertRaisesRegex(generation.SearchIndexSyncError,"client_unavailable") as caught:wrapper(self.db)
                self.assertNotIn("credential",str(caught.exception))
