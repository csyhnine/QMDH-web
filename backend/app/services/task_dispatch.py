"""Database outbox is authoritative. Redis is only a legacy/wakeup transport.

Postgres transaction advisory lock serializes claims across workers; execution
leases have heartbeats. Local GPU tasks form one FIFO lane, other lanes continue.
Expired GPU jobs resume their checkpoint; other upstreams are never blindly rerun.
"""
from datetime import datetime, timedelta, timezone
import logging
from threading import Event, Thread
from uuid import uuid4

from sqlalchemy import select, text

from app.database import SessionLocal
from app.models import Task, TaskDispatch, TaskStatus

log = logging.getLogger(__name__)
LEASE_SECONDS = 90


def utcnow():
    return datetime.now(timezone.utc)


def add_dispatch(db, task, *, comfy=False, key=None, fingerprint="", state="queued"):
    job = TaskDispatch(task_id=task.id, user_id=task.user_id, submission_key=key,
                       request_hash=fingerprint, lane="comfyui" if comfy else "default", state=state)
    db.add(job)
    return job


def _lock(db):
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(716219031)"))


def recover_leases(db):
    """Called under claim lock; never releases an upstream GPU ownership lock."""
    now = utcnow()
    for job in db.scalars(select(TaskDispatch).where(TaskDispatch.state == "leased", TaskDispatch.lease_until < now)):
        task = db.get(Task, job.task_id)
        if task.status == TaskStatus.completed:
            job.state = "done"
        elif job.lane == "comfyui":
            job.state = "queued"  # adapter reconciles previous prompt before any POST
            task.status = TaskStatus.pending
            task.result = {**task.result, "queued_stage": "recovering"}
        else:
            job.state = "review"
            task.status = TaskStatus.failed
            task.result = {**task.result, "error": "执行进程中断，上游状态待核对，请勿直接重复提交。",
                           "error_code": "worker_interrupted", "queued_stage": "review"}
        job.lease_owner = None
        job.lease_until = None


def claim():
    with SessionLocal() as db:
        _lock(db)
        recover_leases(db)
        blocked = db.scalar(select(TaskDispatch.task_id).where(TaskDispatch.lane == "comfyui",
                            TaskDispatch.state.in_(["leased", "review"])).order_by(TaskDispatch.task_id).limit(1))
        review = db.scalar(select(TaskDispatch).where(TaskDispatch.state == "review", TaskDispatch.lane == "comfyui",
                           TaskDispatch.updated_at < utcnow() - timedelta(seconds=30)).order_by(TaskDispatch.task_id).limit(1))
        active = db.scalar(select(TaskDispatch.task_id).where(TaskDispatch.lane == "comfyui", TaskDispatch.state == "leased").limit(1))
        query = select(TaskDispatch).where(TaskDispatch.state == "queued")
        if blocked is not None:
            query = query.where(TaskDispatch.lane != "comfyui")
        job = review if review and active is None else db.scalar(query.order_by(TaskDispatch.task_id).limit(1).with_for_update(skip_locked=True))
        if job is None:
            db.commit()
            return None
        token = uuid4().hex
        job.state, job.lease_owner = "leased", token
        job.lease_until = utcnow() + timedelta(seconds=LEASE_SECONDS)
        job.attempts += 1
        task_id = job.task_id
        db.commit()
        return task_id, token


def heartbeat(task_id, token):
    with SessionLocal() as db:
        job = db.get(TaskDispatch, task_id)
        if job and job.state == "leased" and job.lease_owner == token:
            job.lease_until = utcnow() + timedelta(seconds=LEASE_SECONDS)
            db.commit()


def run_claim(task_id, token):
    from app.services.task_executor import execute_task
    stop = Event()
    def pulse():
        while not stop.wait(15):
            try:
                heartbeat(task_id, token)
            except Exception:
                log.exception("Dispatch heartbeat failed for task %s", task_id)
    thread = Thread(target=pulse, daemon=True)
    thread.start()
    try:
        execute_task(task_id, dispatch_token=token)
        with SessionLocal() as db:
            job = db.get(TaskDispatch, task_id)
            task = db.get(Task, task_id)
            if job and job.lease_owner == token:
                uncertain = job.lane == "comfyui" and task.status == TaskStatus.pending
                # A failed transport result is not evidence of failed GPU execution.
                job.state = "review" if task.status != TaskStatus.completed and uncertain else "done"
                if job.state == "review":
                    task.status = TaskStatus.pending
                    task.result = {**task.result, "queued_stage": "recovering", "summary": "本机任务等待连接恢复或执行状态核对，请勿重复提交。"}
                job.lease_owner, job.lease_until = None, None
                db.commit()
    finally:
        stop.set()
        thread.join(timeout=2)


def import_legacy(task_id):
    """Bridge old Redis deliveries; terminal history is never automatically rerun."""
    with SessionLocal() as db:
        _lock(db)
        task = db.get(Task, task_id)
        if task and task.status == TaskStatus.pending and not db.get(TaskDispatch, task_id):
            from app.services.model_registry import get_provider_definition
            definition = get_provider_definition(task.requested_provider, db)
            add_dispatch(db, task, comfy=definition.adapter_kind == "comfyui")
            db.commit()
