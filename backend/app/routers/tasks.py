from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.audit import write_audit_log
from app.core.config import AuthUserProfile
from app.core.config import settings
from app.database import get_db
from app.models import AuditLog, Project, Task, TaskStatus, User, Workflow
from app.schemas import TaskCreate, TaskDeleteIn, TaskOut
from app.services.task_archive import ensure_task_archive
from app.services.media_storage import resolve_storage_payload
from app.services.billing import enforce_user_quota
from app.services.model_registry import get_provider_definition, get_provider_map
from app.services.task_executor import enqueue_task, execute_task
from app.services.usage_ledger import ensure_usage_ledger_for_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


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
        result=resolve_storage_payload(task.result),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[TaskOut]:
    query = (
        select(Task)
        .join(Task.project)
        .join(Task.user)
        .where(Task.deleted_at.is_(None))
        .order_by(Task.created_at.desc())
    )
    if "*" not in auth_user.project_codes:
        query = query.where(Project.code.in_(auth_user.project_codes))
    if auth_user.user_id is not None:
        query = query.where(Task.user_id == auth_user.user_id)
    else:
        query = query.where(User.name == auth_user.name)
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
        enqueue_task(task.id)
    else:
        background_tasks.add_task(execute_task, task.id)

    db.refresh(task)
    return _to_task_out(task)


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
