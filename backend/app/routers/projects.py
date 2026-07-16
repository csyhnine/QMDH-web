from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import get_current_auth_user, get_optional_auth_user, has_admin_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import Asset, DataClassification, Project, Task, User
from app.schemas import ProjectOut, ProjectStatusOut
from app.services.project_status import build_project_status_detail, build_project_status_map
from app.services.task_archive import ensure_task_archive
from app.services.usage_ledger import ensure_usage_ledger_for_task

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    code: str | None = Field(default=None, min_length=2, max_length=50, pattern=r"^[A-Z0-9_-]+$")
    classification: str = "B"


class ProjectRename(BaseModel):
    name: str = Field(min_length=1, max_length=150)


def _get_active_project(db: Session, project_code: str) -> Project | None:
    return db.scalar(
        select(Project).where(
            Project.code == project_code,
            Project.archived_at.is_(None),
        )
    )


def _sanitize_project_code_segment(value: str, fallback: str) -> str:
    normalized = "".join(char if char.isalnum() else "_" for char in value.upper())
    normalized = normalized.strip("_")
    return normalized or fallback


def _build_personal_project_code(db: Session, project_name: str, user_name: str) -> str:
    user_segment = _sanitize_project_code_segment(user_name, "USER")[:10]
    name_segment = _sanitize_project_code_segment(project_name, "GROUP")[:12]
    base = f"USR_{user_segment}_{name_segment}".strip("_")[:42]

    existing_codes = set(db.scalars(select(Project.code)))
    if base not in existing_codes:
        return base

    for index in range(1, 1000):
        candidate = f"{base}_{index:03d}"[:50]
        if candidate not in existing_codes:
            return candidate

    raise HTTPException(status_code=409, detail="Unable to allocate a unique personal project code")


def _can_manage_project(auth_user: AuthUserProfile, project: Project) -> bool:
    if has_admin_access(auth_user.role):
        return True
    if auth_user.user_id is None:
        return False
    return project.owner_user_id == auth_user.user_id


def _explicit_project_codes(auth_user: AuthUserProfile) -> tuple[str, ...]:
    return tuple(code for code in auth_user.project_codes if code and code != "*")


def _can_view_project(auth_user: AuthUserProfile, project: Project) -> bool:
    if auth_user.user_id is not None and project.owner_user_id == auth_user.user_id:
        return True
    return project.owner_user_id is None and project.code in set(_explicit_project_codes(auth_user))


def _apply_project_scope(query, auth_user: AuthUserProfile):
    explicit_codes = _explicit_project_codes(auth_user)
    clauses = []
    if auth_user.user_id is not None:
        clauses.append(Project.owner_user_id == auth_user.user_id)
    if explicit_codes:
        clauses.append(and_(Project.owner_user_id.is_(None), Project.code.in_(explicit_codes)))
    if not clauses:
        return query.where(Project.id == -1)
    return query.where(or_(*clauses))


def _require_project_manager(auth_user: AuthUserProfile, project: Project) -> None:
    if not _can_manage_project(auth_user, project):
        raise HTTPException(status_code=403, detail="Project management access denied")


def _to_project_out(project: Project, auth_user: AuthUserProfile, status_map: dict[str, dict] | None = None) -> dict:
    summary = (status_map or {}).get(project.code, {})
    return {
        "id": project.id,
        "name": project.name,
        "code": project.code,
        "classification": project.classification,
        "can_manage": _can_manage_project(auth_user, project),
        "current_phase": summary.get("current_phase"),
        "phase_status": summary.get("phase_status"),
        "last_updated": summary.get("last_updated"),
        "summary": summary.get("summary"),
        "next_action": summary.get("next_action"),
    }


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
) -> list[dict]:
    if auth_user is None:
        return []
    query = _apply_project_scope(
        select(Project).where(Project.archived_at.is_(None)).order_by(Project.code),
        auth_user,
    )
    projects = list(db.scalars(query).all())
    status_map = build_project_status_map()
    return [_to_project_out(project, auth_user, status_map) for project in projects]


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    """Create a new personal task container for the current session user."""
    if auth_user.user_id is None:
        raise HTTPException(status_code=403, detail="Only session-backed users can create personal projects")

    project_code = payload.code.strip().upper() if payload.code else _build_personal_project_code(db, payload.name, auth_user.name)
    existing = db.scalar(select(Project).where(Project.code == project_code))
    if existing:
        raise HTTPException(status_code=409, detail="Project code already exists")

    classification = DataClassification.b
    if payload.classification.upper() == "A":
        classification = DataClassification.a
    elif payload.classification.upper() == "C":
        classification = DataClassification.c

    project = Project(
        name=payload.name.strip(),
        code=project_code,
        owner_user_id=auth_user.user_id,
        classification=classification,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    user = db.get(User, auth_user.user_id)
    if user:
        codes = list(user.project_codes or [])
        if "*" not in codes and project.code not in codes:
            codes.append(project.code)
            user.project_codes = codes
            db.commit()

    return _to_project_out(project, auth_user)


@router.patch("/{project_code}", response_model=ProjectOut)
def rename_project(
    project_code: str,
    payload: ProjectRename,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    """Rename a personal project container owned by the current user or managed by an admin."""
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_manager(auth_user, project)

    project.name = payload.name.strip()
    db.commit()
    db.refresh(project)
    return _to_project_out(project, auth_user, build_project_status_map())


@router.get("/{project_code}/status", response_model=ProjectStatusOut)
def get_project_status(
    project_code: str,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not _can_view_project(auth_user, project):
        raise HTTPException(status_code=403, detail="Project access denied")
    detail = build_project_status_detail(project_code)
    if not detail:
        raise HTTPException(status_code=404, detail="Project status not found")
    return detail


@router.delete("/{project_code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_code: str,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    """Archive a personal project container while preserving reporting history."""
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _require_project_manager(auth_user, project)

    archived_at = datetime.now(timezone.utc)

    soft_deleted_count = 0
    tasks = db.scalars(select(Task).where(Task.project_id == project.id)).all()
    for task in tasks:
        if task.deleted_at is None:
            task.deleted_at = archived_at
            soft_deleted_count += 1

    provider_call_count = 0
    for task in tasks:
        archive = ensure_task_archive(
            db,
            task,
            archive_source="project.archive",
            archive_reason=f"project archived: {project.code}",
            archived_at=archived_at,
        )
        ensure_usage_ledger_for_task(
            db,
            task,
            ledger_source="project.archive",
            task_archive=archive,
        )
        provider_call_count += int(archive.provider_call_count or 0)

    assets = db.scalars(select(Asset).where(Asset.project_id == project.id)).all()
    for asset in assets:
        asset.project_id = None

    project.archived_at = archived_at

    users = db.scalars(select(User)).all()
    unlinked_user_count = 0
    for user in users:
        codes = list(user.project_codes or [])
        if project_code in codes:
            codes.remove(project_code)
            user.project_codes = codes
            unlinked_user_count += 1

    write_audit_log(
        db=db,
        event_type=AuditEventType.PROJECT_DELETED,
        actor_name=auth_user.name,
        actor_id=auth_user.user_id,
        target_type="project",
        target_id=project.id,
        target_name=project.name,
        project_code=project.code,
        classification=project.classification,
        details={
            "archived_at": archived_at.isoformat(),
            "task_count": len(tasks),
            "soft_deleted_task_count": soft_deleted_count,
            "provider_call_count": provider_call_count,
            "unlinked_asset_count": len(assets),
            "unlinked_user_count": unlinked_user_count,
        },
    )

    db.commit()
    return Response(status_code=204)
