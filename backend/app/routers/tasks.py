from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database import get_db
from app.models import AuditLog, Project, Task, TaskStatus, User, Workflow
from app.schemas import TaskCreate, TaskOut
from app.services.model_registry import PROVIDERS
from app.services.task_executor import enqueue_task, execute_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


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
        latency_ms=task.latency_ms,
        result=task.result,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("", response_model=list[TaskOut])
def list_tasks(db: Session = Depends(get_db)) -> list[TaskOut]:
    tasks = db.scalars(select(Task).order_by(Task.created_at.desc())).all()
    return [_to_task_out(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: int, db: Session = Depends(get_db)) -> TaskOut:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _to_task_out(task)


@router.post("", response_model=TaskOut, status_code=status.HTTP_202_ACCEPTED)
def create_task(
    payload: TaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> TaskOut:
    workflow = db.scalar(select(Workflow).where(Workflow.key == payload.workflow_key))
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    if payload.requested_provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Provider not found")

    if workflow.provider_capability not in PROVIDERS[payload.requested_provider].capabilities:
        raise HTTPException(status_code=400, detail="Provider does not support workflow capability")

    project = db.scalar(select(Project).where(Project.code == payload.project_code))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    user = db.scalar(select(User).where(User.name == payload.user_name))
    if not user:
        user = User(name=payload.user_name, role="designer")
        db.add(user)
        db.flush()

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
