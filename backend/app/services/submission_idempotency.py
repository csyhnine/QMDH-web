"""Scoped submission identity using the existing durable dispatch unique key."""
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import Task, TaskDispatch


def submission_identity(scope, key, parameters):
    try:
        canonical = json.dumps(parameters, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        identity = json.dumps([scope, key], sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError) as exc:
        raise HTTPException(400, "Submission parameters must be valid JSON") from exc
    fingerprint = sha256(canonical.encode()).hexdigest()
    return ("si1_" + sha256(identity.encode()).hexdigest() if key is not None else None), fingerprint


def _previous_submission(db, user_id, key, fingerprint):
    if key is None:
        return None
    row = db.scalar(select(TaskDispatch).where(TaskDispatch.user_id == user_id, TaskDispatch.submission_key == key))
    if row is None:
        return None
    if row.request_hash != fingerprint:
        raise HTTPException(409, "Submission key was already used with different parameters")
    task = db.get(Task, row.task_id, populate_existing=True)
    if task is None:
        raise HTTPException(409, "Original submission is unavailable; review it before submitting again")
    return task


def _commit_submission(db):
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise


def submit_once(db, *, user_id, scope, key, parameters, create):
    """Return (Task, newly_created); only a committed winner may schedule work."""
    scoped_key, fingerprint = submission_identity(scope, key, parameters)
    # sqlite's legacy driver may otherwise RELEASE a top-level SAVEPOINT as a
    # commit. A real outer transaction also serializes SQLite writers before
    # lookup. PostgreSQL relies on its unique constraint and savepoint rollback.
    connection = db.connection()
    if connection.dialect.name == "sqlite" and not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN IMMEDIATE")
    if connection.dialect.name == "postgresql" and scoped_key is not None:
        lock_id = int.from_bytes(sha256(f"{user_id}:{scoped_key}".encode()).digest()[:8], "big", signed=True)
        db.execute(text("SELECT pg_advisory_xact_lock(:submission_lock)"), {"submission_lock": lock_id})
    previous = _previous_submission(db, user_id, scoped_key, fingerprint)
    if previous is not None:
        _commit_submission(db)
        return previous, False
    try:
        with db.begin_nested():
            task = create(scoped_key, fingerprint)
            db.flush()
            row = db.get(TaskDispatch, task.id)
            if row is None or row.submission_key != scoped_key or row.request_hash != fingerprint:
                raise RuntimeError("Submission callback did not persist its dispatch identity")
    except IntegrityError:
        # The savepoint removed this candidate's Task/Job/Audit rows. A
        # conflicting committed winner, if present, remains authoritative.
        previous = _previous_submission(db, user_id, scoped_key, fingerprint)
        if previous is not None:
            _commit_submission(db)
            return previous, False
        raise
    _commit_submission(db)
    return task, True
