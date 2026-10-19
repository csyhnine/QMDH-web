from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, get_optional_auth_user
from app.core.audit import write_audit_log
from app.core.config import AuthUserProfile
from app.core.config import settings
from app.database import get_db
from app.models import AuditLog, Project, Task, TaskDispatch, TaskStatus, User, Workflow
from app.services.task_dispatch import add_dispatch
from app.schemas import GenerationOutcomeIn, GenerationOutcomeOut, TaskCreate, TaskDeleteIn, TaskOut
from app.services.generation_outcome_service import record_generation_outcome
from app.services.task_archive import ensure_task_archive
from app.services.media_storage import resolve_storage_payload
from app.services.billing import enforce_user_quota
from app.services.model_registry import get_provider_definition, get_provider_map
from app.services.generation_intent_service import record_generation_intent_for_task
from app.services.task_executor import enqueue_task, execute_task, mark_task_enqueue_failed
from app.services.task_stale_recovery import recover_stale_tasks
from app.services.usage_ledger import ensure_usage_ledger_for_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/{task_id}/comfyui-recovery")
def recover_comfyui_task(task_id: int, action: str = Body(embed=True), note: str = Body(embed=True),
                        db: Session = Depends(get_db), auth_user: AuthUserProfile = Depends(get_current_auth_user)):
    from app.core.auth import require_ops_access
    from app.services.task_dispatch import _lock
    from app.services.provider_adapters.comfyui import BASE_URL, GPU_LOCK
    from redis import Redis
    import httpx
    require_ops_access(auth_user)
    if action not in ("resume", "close") or len(note.strip()) < 10:
        raise HTTPException(422, "操作须为 resume/close，并填写至少十字的核对说明。")
    _lock(db)
    job = db.get(TaskDispatch, task_id)
    task = db.get(Task, task_id)
    if not job or job.lane != "comfyui" or job.state != "review":
        raise HTTPException(409, "只能处理等待核对的本机任务，不能干预活动 worker。")
    if action == "close":
        with httpx.Client(base_url=BASE_URL, trust_env=False, follow_redirects=False, timeout=5) as client:
            response = client.get("/queue"); response.raise_for_status(); queue = response.json()
            if queue.get("queue_running") or queue.get("queue_pending"):
                raise HTTPException(409, "ComfyUI 队列非空，不能解除占用。")
            prompt_id = (task.result or {}).get("comfyui", {}).get("prompt_id")
            saved = task.result.get("comfyui", {})
            if saved.get("stage") == "downloaded" or len(saved.get("batch_outputs", [])) >= int(task.payload.get("image_count", 1)):
                raise HTTPException(409, "服务器已有已下载的结果，请恢复入库，不能关闭。")
            if not prompt_id and saved.get("client_id"):
                response = client.get("/history", params={"max_items": 200}); response.raise_for_status()
                matches = []
                for id, item in response.json().items():
                    prompt = item.get("prompt", [])
                    if len(prompt) > 3 and isinstance(prompt[3], dict) and prompt[3].get("client_id") == saved["client_id"]:
                        matches.append(id)
                if len(matches) > 1:
                    raise HTTPException(409, "发现多个上游记录，须进一步核对，不能直接关闭。")
                prompt_id = matches[0] if matches else None
            if prompt_id:
                response = client.get(f"/history/{prompt_id}"); response.raise_for_status()
                status_info = response.json().get(prompt_id, {}).get("status", {})
                if status_info.get("completed") and status_info.get("status_str") != "error":
                    raise HTTPException(409, "原任务已生成成功，请恢复获取结果，不能将其关闭。")
        redis = Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=5)
        try:
            redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, GPU_LOCK, str(task_id))
        finally:
            redis.close()
        task.status, job.state = TaskStatus.failed, "done"
        task.result = {**task.result, "queued_stage": "failed", "error": "管理员核对后关闭了未完成的本机任务。", "recovery_note": note}
    else:
        job.state = "queued"
        task.status = TaskStatus.pending
    db.add(AuditLog(event_type="comfyui.recovery", actor_name=auth_user.name,
                    details={"task_id": task_id, "action": action, "note": note}))
    db.commit()
    return {"task_id": task_id, "state": job.state}


def _explicit_project_codes(auth_user: AuthUserProfile) -> tuple[str, ...]:
    return tuple(code for code in auth_user.project_codes if code and code != "*")


def _can_use_task_project(auth_user: AuthUserProfile, project: Project) -> bool:
    if auth_user.user_id is not None and project.owner_user_id == auth_user.user_id:
        return True
    return project.owner_user_id is None and project.code in set(_explicit_project_codes(auth_user))


def _is_task_visible_to_user(auth_user: AuthUserProfile, task: Task) -> bool:
    if "*" not in auth_user.project_codes and task.project.code not in auth_user.project_codes:
        return False
    if auth_user.user_id is not None:
        return task.user_id == auth_user.user_id
    return task.user.name == auth_user.name


def _reference_image_count(payload: dict) -> int:
    for key in ("reference_images", "source_images"):
        raw_value = payload.get(key)
        if isinstance(raw_value, list):
            values = [str(item or "").strip() for item in raw_value]
            cleaned = [value for value in values if value]
            if cleaned:
                return min(4, len(cleaned))

    for key in ("reference_image", "source_image"):
        if str(payload.get(key) or "").strip():
            return 1
    return 0


def _reference_image_storage_paths(payload: dict) -> list[str]:
    for key in ("reference_images", "source_images"):
        raw_value = payload.get(key)
        if isinstance(raw_value, list):
            values = [str(item or "").strip() for item in raw_value]
            cleaned = [value for value in values if value]
            if cleaned:
                return cleaned[:4]

    for key in ("reference_image", "source_image", "image"):
        value = str(payload.get(key) or "").strip()
        if value:
            return [value]
    return []


def _task_payload_result_fields(payload: dict) -> dict:
    return {
        "prompt": str(payload.get("prompt") or "").strip(),
        "edit_prompt": str(payload.get("edit_prompt") or "").strip(),
        "style": str(payload.get("style") or "").strip(),
        "aspect_ratio": str(payload.get("aspect_ratio") or "").strip(),
        "resolution": str(payload.get("resolution") or "").strip(),
        "deliverable": str(payload.get("deliverable") or "").strip(),
        "prompt_supplement": str(payload.get("prompt_supplement") or "").strip(),
    }


def _get_or_create_user(db: Session, auth_user: AuthUserProfile) -> User:
    user = db.scalar(select(User).where(User.name == auth_user.name))
    if user:
        if user.role != auth_user.role:
            user.role = auth_user.role
        return user

    user = User(name=auth_user.name, role=auth_user.role)
    db.add(user)
    db.flush()
    return user


def _to_task_out(task: Task) -> TaskOut:
    result = dict(task.result or {})
    from sqlalchemy.orm import object_session
    from sqlalchemy import func
    db = object_session(task)
    job = db.get(TaskDispatch, task.id) if db else None
    if job and job.lane == "comfyui" and task.status in (TaskStatus.pending, TaskStatus.running):
        position = db.scalar(select(func.count()).select_from(TaskDispatch).where(
            TaskDispatch.lane == "comfyui", TaskDispatch.state.in_(["queued", "leased", "review"]),
            TaskDispatch.task_id < task.id))
        result.update(queue_position=position, queued_stage="recovering" if job.state == "review" else
                      "queued" if job.state == "queued" else "running", adapter_mode="comfyui")
        result["summary"] = "等待本机连接恢复或执行状态核对，请勿重复提交。" if job.state == "review" else (
            f"本机任务排队中，前方 {position} 项任务。" if job.state == "queued" else "本机正在生成，结果会自动保存。")
    return TaskOut(
        id=task.id,
        title=task.title,
        status=task.status,
        workflow_key=task.workflow.key,
        workflow_name=task.workflow.name,
        project_code=task.project.code,
        user_name=task.user.name,
        requested_provider=task.requested_provider,
        classification=task.classification,
        cost=task.cost,
        cost_currency=task.cost_currency or "CNY",
        latency_ms=task.latency_ms,
        result=resolve_storage_payload(result),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("", response_model=list[TaskOut])
def list_tasks(
    limit: int | None = Query(default=None, ge=1, le=500),
    before_id: int | None = Query(default=None, ge=1),
    task_ids: list[int] | None = Query(default=None, max_length=120),
    status: list[TaskStatus] | None = Query(default=None),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
) -> list[TaskOut]:
    if auth_user is None:
        return []
    recover_stale_tasks(db)
    query = (
        select(Task)
        .join(Task.project)
        .join(Task.user)
        .where(Task.deleted_at.is_(None))
        .order_by(Task.id.desc())
    )
    if "*" not in auth_user.project_codes:
        query = query.where(Project.code.in_(auth_user.project_codes))
    if auth_user.user_id is not None:
        query = query.where(Task.user_id == auth_user.user_id)
    else:
        query = query.where(User.name == auth_user.name)
    if status:
        query = query.where(Task.status.in_(status))
    if before_id is not None:
        query = query.where(Task.id < before_id)
    if task_ids is not None:
        query = query.where(Task.id.in_(task_ids))
    if limit is not None:
        query = query.limit(limit)
    tasks = db.scalars(query).all()
    return [_to_task_out(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> TaskOut:
    task = db.get(Task, task_id)
    if not task or task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _is_task_visible_to_user(auth_user, task):
        raise HTTPException(status_code=403, detail="Task access denied")
    return _to_task_out(task)


@router.post("", response_model=TaskOut, status_code=status.HTTP_202_ACCEPTED)
def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> TaskOut:
    workflow = db.scalar(select(Workflow).where(Workflow.key == payload.workflow_key))
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    provider_map = get_provider_map(db)
    if payload.requested_provider not in provider_map:
        raise HTTPException(status_code=404, detail="Provider not found")

    provider = get_provider_definition(payload.requested_provider, db)
    if workflow.provider_capability not in provider.capabilities:
        raise HTTPException(status_code=400, detail="Provider does not support workflow capability")

    project = db.scalar(
        select(Project).where(
            Project.code == payload.project_code,
            Project.archived_at.is_(None),
        )
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not _can_use_task_project(auth_user, project):
        raise HTTPException(status_code=403, detail="Project access denied")

    user = _get_or_create_user(db, auth_user)
    fingerprint = hashlib.sha256(json.dumps(payload.model_dump(mode="json", exclude={"submission_key"}),
                                           sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if payload.submission_key:
        if db.bind.dialect.name == "postgresql":
            lock_id = int.from_bytes(hashlib.sha256(f"{user.id}:{payload.submission_key}".encode()).digest()[:8], "big", signed=True)
            db.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": lock_id})
        previous = db.scalar(select(TaskDispatch).where(TaskDispatch.user_id == user.id,
                              TaskDispatch.submission_key == payload.submission_key))
        if previous:
            if previous.request_hash != fingerprint:
                raise HTTPException(409, "同一提交标识的参数发生变化，请创建新提交。")
            return _to_task_out(db.get(Task, previous.task_id))
    if provider.adapter_kind == "comfyui":
        from app.services.task_dispatch import _lock
        _lock(db)  # Capacity checks and insertion must be atomic across API workers.
        from sqlalchemy import func
        pending_query = select(func.count()).select_from(TaskDispatch).where(
            TaskDispatch.lane == "comfyui", TaskDispatch.state.in_(["queued", "leased", "review"]))
        if db.scalar(pending_query.where(TaskDispatch.user_id == user.id)) >= 10 or db.scalar(pending_query) >= 100:
            raise HTTPException(429, "本机待执行任务已达上限，请等待现有任务完成。")
        from app.services.provider_adapters.comfyui import validate_submission
        try:
            validate_submission(db, user.id, provider.model_name, payload.payload)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    enforce_user_quota(db, user=user)
    reference_image_storage_paths = _reference_image_storage_paths(payload.payload)

    task = Task(
        title=payload.title,
        status=TaskStatus.pending,
        workflow_id=workflow.id,
        project_id=project.id,
        user_id=user.id,
        requested_provider=payload.requested_provider,
        classification=payload.classification,
        payload=payload.payload,
        result={
            "summary": "Task accepted and waiting for execution.",
            "reference_image_supplied": _reference_image_count(payload.payload) > 0,
            "reference_image_count": _reference_image_count(payload.payload),
            "reference_image_storage_path": reference_image_storage_paths[0] if reference_image_storage_paths else "",
            "reference_image_storage_paths": reference_image_storage_paths,
            "requested_image_count": int(payload.payload.get("image_count") or 1),
            "queued_stage": "accepted",
            **_task_payload_result_fields(payload.payload),
        },
    )
    db.add(task)
    db.flush()
    add_dispatch(db, task, comfy=provider.adapter_kind == "comfyui", key=payload.submission_key,
                 fingerprint=fingerprint, state="queued" if settings.task_execution_mode == "redis" else "done")

    record_generation_intent_for_task(
        db,
        task=task,
        workflow_key=payload.workflow_key,
        template_id=payload.template_id,
        source_surface=payload.source_surface,
        canvas_node_id=payload.canvas_node_id,
        prompt_polished=payload.prompt_polished,
    )

    db.add(
        AuditLog(
            event_type="task.created",
            actor_name=user.name,
            project_code=project.code,
            workflow_key=workflow.key,
            provider_name=payload.requested_provider,
            classification=payload.classification,
            details={
                "task_id": task.id,
                "task_title": payload.title,
                "payload_keys": list(payload.payload.keys()),
                "execution_mode": settings.task_execution_mode,
            },
        )
    )
    db.commit()
    db.refresh(task)

    if settings.task_execution_mode == "sync":
        execute_task(task.id)
    elif settings.task_execution_mode == "redis":
        try:
            enqueue_task(task.id)
        except Exception as exc:
            # The committed outbox is authoritative; a lost wakeup is recoverable.
            import logging
            logging.getLogger(__name__).warning("Redis wakeup failed for durable task %s: %s", task.id, type(exc).__name__)
    else:
        background_tasks.add_task(execute_task, task.id)

    db.refresh(task)
    return _to_task_out(task)


@router.post("/{task_id}/generation-outcomes", response_model=GenerationOutcomeOut)
def record_task_generation_outcome(
    task_id: int,
    payload: GenerationOutcomeIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> GenerationOutcomeOut:
    task = db.get(Task, task_id)
    if not task or task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _is_task_visible_to_user(auth_user, task):
        raise HTTPException(status_code=403, detail="Task access denied")

    intent = record_generation_outcome(
        db,
        task_id=task.id,
        outcome_type=payload.outcome_type.strip(),
        asset_id=payload.asset_id,
        metadata=payload.metadata,
    )
    db.commit()

    if intent is None:
        return GenerationOutcomeOut(
            task_id=task.id,
            outcome_type=payload.outcome_type,
            recorded=False,
            outcome_signals={},
        )

    return GenerationOutcomeOut(
        task_id=task.id,
        outcome_type=payload.outcome_type,
        recorded=True,
        outcome_signals=intent.outcome_signals if isinstance(intent.outcome_signals, dict) else {},
    )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    payload: TaskDeleteIn | None = Body(default=None),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    """Soft-delete a task. Sets deleted_at timestamp instead of removing the row.
    Only the task owner or an admin can delete. Associated ProviderCall and Asset records are retained."""
    from fastapi import Response

    task = db.get(Task, task_id)
    if not task or task.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Task not found")
    if not _is_task_visible_to_user(auth_user, task):
        raise HTTPException(status_code=403, detail="Task access denied")

    # History is account-owned for every role, so only the task owner can delete it.
    is_owner = (auth_user.user_id and task.user_id == auth_user.user_id) or (auth_user.name == task.user.name)
    if not is_owner:
        raise HTTPException(status_code=403, detail="Only the task owner can delete tasks")

    # Soft-delete: set deleted_at timestamp
    deleted_at = datetime.now(timezone.utc)
    task.deleted_at = deleted_at
    ensure_task_archive(
        db,
        task,
        archive_source="task.delete",
        archive_reason=(payload.reason if payload else "") or "",
        archived_at=deleted_at,
    )
    ensure_usage_ledger_for_task(
        db,
        task,
        ledger_source="task.delete",
    )

    # Audit log entry
    write_audit_log(
        db=db,
        event_type="task.soft_deleted",
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="task",
        target_id=task.id,
        target_name=task.title,
        project_code=task.project.code,
        details={
            "task_id": task.id,
            "deleted_at": deleted_at.isoformat(),
            "reason": (payload.reason if payload else "") or "",
        },
    )

    db.commit()
    return Response(status_code=204)
