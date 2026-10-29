"""Build a fresh search generation; activate only a confirmed, current snapshot."""
from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select, update

from app.models import InspirationPost, PromptTemplate, SearchIndexDomain, SearchIndexIntent
from app.services.search_index_outbox_service import (
    TASK_FIELDS, _domain, _session, _uid, _value, build_index_document,
    lock_domain, target_hash,
)


class SearchIndexSyncError(RuntimeError):
    """Static error codes only; remote exceptions may contain credentials/content."""

    def __init__(self, domain: str, code: str):
        self.domain, self.code = domain, code
        super().__init__(f"Search sync {domain}: {code}")


def _snapshot(bind, domain: str, name: str) -> dict:
    with _session(bind) as db:
        state = lock_domain(db, domain)
        model = InspirationPost if domain == "inspiration" else PromptTemplate
        statement = select(model).order_by(model.id)
        if domain == "templates":
            statement = statement.where(PromptTemplate.scope == "shared")
        return {"domain": domain, "revision": state.revision, "active": state.active_index,
                "active_target": state.active_target_hash, "target": target_hash(name),
                "documents": [build_index_document(domain, row, state.revision) for row in db.scalars(statement)]}
        # The read snapshot releases its domain lock before any network call.


def _confirmed(client, receipt, domain: str, name: str) -> None:
    uid = _uid(_value(receipt, "task_uid", "taskUid"))
    if uid is None or _value(receipt, "index_uid", "indexUid") != name:
        raise SearchIndexSyncError(domain, "task_receipt_unconfirmed")
    result = client.wait_for_task(uid, timeout_in_ms=5000, interval_in_ms=100)
    if (_uid(_value(result, "uid", "uid")) != uid
            or _value(result, "index_uid", "indexUid") != name
            or _value(result, "status", "status") != "succeeded"):
        raise SearchIndexSyncError(domain, "task_not_succeeded")


def _activated(bind, snapshot: dict, name: str) -> bool:
    """Read back a possibly committed activation without resubmitting any task."""
    try:
        with _session(bind) as db:
            state = lock_domain(db, snapshot["domain"])
            pending = db.scalar(select(SearchIndexIntent.entity_id).where(
                SearchIndexIntent.domain == snapshot["domain"],
                SearchIndexIntent.applied_revision < SearchIndexIntent.revision,
            ).limit(1))
            return bool(state.active_index == name and state.active_target_hash == snapshot["target"]
                        and state.revision == snapshot["revision"] and state.ready and not state.uncertain
                        and state.task_uid is None and state.submission_token is None and pending is None
                        and target_hash(name) == snapshot["target"])
    except Exception:
        return False


def _activate(bind, snapshot: dict, name: str) -> None:
    domain = snapshot["domain"]
    try:
        with _session(bind) as db:
            state = lock_domain(db, domain)
            if (state.revision != snapshot["revision"] or state.active_index != snapshot["active"]
                    or state.active_target_hash != snapshot["active_target"]
                    or target_hash(name) != snapshot["target"]):
                raise SearchIndexSyncError(domain, "source_changed")
            db.execute(update(SearchIndexIntent).where(SearchIndexIntent.domain == domain).values(
                applied_revision=SearchIndexIntent.revision, error_code=""))
            state.active_index = name
            state.active_target_hash = snapshot["target"]
            state.ready = True
            state.uncertain = False
            state.error_code = ""
            for field in TASK_FIELDS:
                setattr(state, field, None)
            db.commit()
    except SearchIndexSyncError:
        raise
    except Exception:
        if not _activated(bind, snapshot, name):
            raise SearchIndexSyncError(domain, "activation_unconfirmed") from None


def rebuild_index(bind, domain: str, *, client, configure) -> int:
    """Return a count only after task confirmation and atomic pointer activation.

    Unknown/failed builds can leave an inactive index. Never delete an old index
    here: an old task may still be in flight, and existing readers may use it.
    """
    _domain(domain)
    if client is None:
        raise SearchIndexSyncError(domain, "client_unavailable")
    name = f"qmdh_{domain}_{uuid4().hex}"
    try:
        snapshot = _snapshot(bind, domain, name)
    except Exception:
        raise SearchIndexSyncError(domain, "snapshot_unavailable") from None
    try:
        _confirmed(client, client.create_index(name, {"primaryKey": "id"}), domain, name)
        index = client.index(name)
        for receipt in configure(index):
            _confirmed(client, receipt, domain, name)
        documents = snapshot["documents"]
        for start in range(0, len(documents), 500):
            _confirmed(client, index.update_documents(documents[start:start + 500], primary_key="id"), domain, name)
        count = _value(index.get_stats(), "number_of_documents", "numberOfDocuments")
        if type(count) is not int or count != len(documents):
            raise SearchIndexSyncError(domain, "document_count_mismatch")
    except SearchIndexSyncError:
        raise
    except Exception:
        raise SearchIndexSyncError(domain, "index_build_unconfirmed") from None
    _activate(bind, snapshot, name)
    return len(documents)
