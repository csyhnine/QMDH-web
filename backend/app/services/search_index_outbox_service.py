"""Durable search intents; HTTP side effects happen after the business response.

One receipt per domain serializes asynchronous index operations. An uncertain
submission is never blindly replayed; a new-generation sync must recover it.
"""
from __future__ import annotations

import hashlib
import json
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import InspirationPost, PromptTemplate, SearchIndexDomain, SearchIndexIntent

DOMAINS = {"inspiration", "templates"}
TASK_FIELDS = ("submission_token", "task_uid", "task_entity_id", "task_revision", "task_operation", "task_index", "task_target_hash")


def _domain(domain: str) -> None:
    if domain not in DOMAINS:
        raise ValueError("Unsupported search domain")


def lock_domain(db: Session, domain: str) -> SearchIndexDomain:
    _domain(domain)
    with db.no_autoflush:
        if db.get_bind().dialect.name == "sqlite":
            db.connection().exec_driver_sql("UPDATE search_index_domains SET revision = revision WHERE domain = ?", (domain,))
        state = db.scalar(select(SearchIndexDomain).where(SearchIndexDomain.domain == domain).with_for_update())
    if state is None:
        raise RuntimeError("Search indexing migration is required")
    return state


def enqueue_index_change(db: Session, *, domain: str, entity, operation: str) -> int:
    if operation not in {"upsert", "delete"}:
        raise ValueError("Unsupported search intent")
    state = lock_domain(db, domain)
    db.flush()  # Assign new entity IDs only after acquiring the domain lock.
    entity_id = entity if type(entity) is int else entity.id
    if type(entity_id) is not int:
        raise ValueError("Search entity has no identity")
    state.revision += 1
    intent = db.get(SearchIndexIntent, (domain, entity_id))
    if intent is None:
        intent = SearchIndexIntent(domain=domain, entity_id=entity_id, applied_revision=0)
        db.add(intent)
    intent.revision = state.revision
    intent.operation = operation
    intent.error_code = ""
    db.flush()
    return intent.revision


def index_name(state: SearchIndexDomain) -> str:
    return state.active_index or (settings.meilisearch_inspiration_index if state.domain == "inspiration" else settings.meilisearch_templates_index)


def target_hash(index: str) -> str:
    return hashlib.sha256((settings.meilisearch_url + "\0" + index).encode()).hexdigest()


def build_index_document(domain: str, entity, revision: int = 0) -> dict:
    from app.integrations.search.index_hooks import build_inspiration_document, build_template_document
    _domain(domain)
    document = build_inspiration_document(entity) if domain == "inspiration" else build_template_document(entity)
    digest = hashlib.sha256(json.dumps(document, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    return {**document, "_qmdh_fingerprint": digest, "_qmdh_revision": str(revision)}


def _engine(bind):
    return bind.engine if isinstance(bind, Connection) else bind


def _session(bind) -> Session:
    return Session(bind=_engine(bind), expire_on_commit=False, autoflush=False)


def _prepare(bind, domain: str) -> dict:
    with _session(bind) as db:
        state = lock_domain(db, domain)
        name = index_name(state)
        target = target_hash(name)
        if state.ready and state.active_target_hash != target:
            return {"phase": "blocked", "code": "active_target_changed"}
        if state.uncertain:
            return {"phase": "blocked", "code": state.error_code or "submission_unconfirmed"}
        if state.task_uid is not None:
            if state.task_index != name or state.task_target_hash != target:
                return {"phase": "blocked", "code": "task_target_changed"}
            return {"phase": "poll", "uid": state.task_uid, "token": state.submission_token,
                    "index": state.task_index, "target": state.task_target_hash}
        intent = db.scalar(select(SearchIndexIntent).where(
            SearchIndexIntent.domain == domain, SearchIndexIntent.applied_revision < SearchIndexIntent.revision,
        ).order_by(SearchIndexIntent.revision, SearchIndexIntent.entity_id).limit(1))
        if intent is None:
            return {"phase": "idle"}
        entity = db.get(InspirationPost if domain == "inspiration" else PromptTemplate, intent.entity_id)
        if domain == "templates" and entity is not None and entity.scope != "shared":
            entity = None
        operation = "delete" if entity is None else "upsert"
        document = build_index_document(domain, entity, intent.revision) if operation == "upsert" else None
        state.uncertain = True
        state.submission_token = uuid4().hex
        state.task_uid = None
        state.task_entity_id = intent.entity_id
        state.task_revision = intent.revision
        state.task_operation = operation
        state.task_index = name
        state.task_target_hash = target
        state.error_code = ""
        descriptor = {"phase": "submit", "token": state.submission_token, "entity_id": intent.entity_id,
                      "revision": intent.revision, "operation": operation, "index": name,
                      "target": target, "document": document}
        db.commit()  # Durable before HTTP, while all later submissions are fenced.
        return descriptor


def _value(value, snake: str, camel: str):
    return value.get(camel, value.get(snake)) if isinstance(value, dict) else getattr(value, snake, None)


def _uid(value) -> int | None:
    return value if type(value) is int and 0 <= value <= 9_223_372_036_854_775_807 else None


def _remember_submission(bind, domain: str, descriptor: dict, result) -> bool:
    uid = _uid(_value(result, "task_uid", "taskUid"))
    returned_index = _value(result, "index_uid", "indexUid")
    if uid is None or (returned_index is not None and returned_index != descriptor["index"]):
        return False
    with _session(bind) as db:
        state = lock_domain(db, domain)
        if state.submission_token != descriptor["token"] or state.task_target_hash != descriptor["target"]:
            return False
        state.task_uid = uid
        state.uncertain = False
        state.error_code = ""
        db.commit()
        return True


def _error(bind, domain: str, descriptor: dict, code: str) -> None:
    try:
        with _session(bind) as db:
            state = lock_domain(db, domain)
            if state.submission_token == descriptor["token"]:
                state.error_code = code
                db.commit()
    except Exception:
        pass


def _ack(bind, domain: str, descriptor: dict, result) -> str:
    uid = _uid(_value(result, "uid", "uid"))
    name = _value(result, "index_uid", "indexUid")
    status = _value(result, "status", "status")
    if uid != descriptor["uid"] or name != descriptor["index"]:
        _error(bind, domain, descriptor, "task_identity_mismatch")
        return "pending"
    if status not in {"succeeded", "failed", "canceled"}:
        if status not in {"enqueued", "processing"}:
            _error(bind, domain, descriptor, "task_status_unknown")
        return "pending"
    with _session(bind) as db:
        state = lock_domain(db, domain)
        if state.submission_token != descriptor["token"] or state.task_uid != descriptor["uid"]:
            return "stale"
        intent = db.get(SearchIndexIntent, (domain, state.task_entity_id))
        if intent is None:
            state.error_code = "intent_missing"
            db.commit()
            return "pending"
        if status == "succeeded":
            intent.applied_revision = max(intent.applied_revision, state.task_revision)
            intent.error_code = ""
            state.error_code = ""
        else:
            intent.error_code = "index_task_failed"
            state.error_code = "index_task_failed"
        for key in TASK_FIELDS:
            setattr(state, key, None)
        state.uncertain = False
        db.commit()
        return "confirmed" if status == "succeeded" else "failed"


def dispatch_index_domain(bind, domain: str, *, client=None, limit: int = 8) -> dict:
    """Bounded best effort. Never turn a committed business result into a failure."""
    processed = 0
    try:
        _domain(domain)
        if client is None:
            from app.integrations.search.service import _meili_client
            client = _meili_client()
        if client is None:
            return {"status": "pending", "processed": 0, "code": "index_unavailable"}
        for _ in range(max(1, min(limit, 100))):
            work = _prepare(bind, domain)
            if work["phase"] == "idle":
                return {"status": "idle", "processed": processed}
            if work["phase"] == "blocked":
                return {"status": "pending", "processed": processed, "code": work["code"]}
            if work["phase"] == "submit":
                try:
                    index = client.index(work["index"])
                    result = index.update_documents([work["document"]], primary_key="id") if work["operation"] == "upsert" else index.delete_document(work["entity_id"])
                    if not _remember_submission(bind, domain, work, result):
                        _error(bind, domain, work, "submission_unconfirmed")
                        return {"status": "pending", "processed": processed, "code": "submission_unconfirmed"}
                except Exception:
                    _error(bind, domain, work, "submission_unconfirmed")
                    return {"status": "pending", "processed": processed, "code": "submission_unconfirmed"}
            else:
                try:
                    status = _ack(bind, domain, work, client.get_task(work["uid"]))
                except Exception:
                    _error(bind, domain, work, "task_lookup_unconfirmed")
                    return {"status": "pending", "processed": processed, "code": "task_lookup_unconfirmed"}
                if status != "confirmed":
                    return {"status": "pending", "processed": processed, "code": status}
                processed += 1
        return {"status": "pending", "processed": processed, "code": "batch_limit"}
    except Exception:
        return {"status": "pending", "processed": processed, "code": "dispatcher_unavailable"}


def schedule_index_dispatch(background_tasks, db: Session, domain: str) -> None:
    if background_tasks is None:
        return  # Direct callers still have a durable intent; sync can recover it.
    try:
        background_tasks.add_task(dispatch_index_domain, _engine(db.get_bind()), domain)
    except Exception:
        pass  # Scheduling cannot invalidate the already committed business row.
