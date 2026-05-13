from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import ensure_project_access, get_current_auth_user
from app.core.config import AuthUserProfile
from app.core.config import settings
from app.database import get_db
from app.models import AuditLog, Project, Task, TaskStatus, User, Workflow
from app.schemas import TaskCreate, TaskOut
from app.services.model_registry import get_provider_definition, get_provider_map
from app.services.task_executor import enqueue_task, execute_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


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
        result=task.result,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[TaskOut]:
    query = select(Task).join(Task.project).order_by(Task.created_at.desc())
    if "*" not in auth_user.project_codes:
        query = query.where(Project.code.in_(auth_user.project_codes))
    tasks = db.scalars(query).all()
    return [_to_task_out(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> TaskOut:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_project_access(auth_user, task.project.code)
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

    project = db.scalar(select(Project).where(Project.code == payload.project_code))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    ensure_project_access(auth_user, project.code)

    user = _get_or_create_user(db, auth_user)

    task = Task(
        title=payload.title,
        status=TaskStatus.pending,
        workflow_id=workflow.id,
        project_id=project.id,
        user_id=user.id,
        requested_provider=payload.requested_provider,
        classification=payload.classification,
        payload=payload.payload,
        result={"summary": "Task accepted and waiting for execution."},
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
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    """Delete a task and its associated assets. Only task owner or ops+ can delete."""
    from fastapi import Response
    from app.models import Asset, ProviderCall

    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    ensure_project_access(auth_user, task.project.code)

    # Permission check: must be task owner or ops+
    is_owner = (auth_user.user_id and task.user_id == auth_user.user_id) or (auth_user.name == task.user.name)
    is_ops = auth_user.role in ("owner", "admin", "ops")
    if not is_owner and not is_ops:
        raise HTTPException(status_code=403, detail="Only task owner or ops+ can delete tasks")

    # Delete associated provider calls
    calls = db.scalars(select(ProviderCall).where(ProviderCall.task_id == task_id)).all()
    for call in calls:
        db.delete(call)

    # Delete assets from this task
    assets = db.scalars(select(Asset).where(Asset.source_task_id == task_id)).all()
    for asset in assets:
        db.delete(asset)

    db.delete(task)
    db.commit()
    return Response(status_code=204)
