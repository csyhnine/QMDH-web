from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import AuditEventType, write_audit_log
from app.core.auth import ensure_project_access, get_current_auth_user, require_ops_access, require_user_admin
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import Asset, Project, Task, User
from app.schemas import ProjectMemberOut, ProjectOut, ProjectStatusOut
from app.services.project_status import build_project_status_detail, build_project_status_map
from app.services.task_archive import ensure_task_archive
from app.services.usage_ledger import ensure_usage_ledger_for_task

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Z0-9_-]+$")
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


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[dict]:
    query = select(Project).where(Project.archived_at.is_(None)).order_by(Project.code)
    if "*" not in auth_user.project_codes:
        query = query.where(Project.code.in_(auth_user.project_codes))
    projects = list(db.scalars(query).all())
    status_map = build_project_status_map()

    response: list[dict] = []
    for project in projects:
        summary = status_map.get(project.code, {})
        response.append(
            {
                "id": project.id,
                "name": project.name,
                "code": project.code,
                "classification": project.classification,
                "current_phase": summary.get("current_phase"),
                "phase_status": summary.get("phase_status"),
                "last_updated": summary.get("last_updated"),
                "summary": summary.get("summary"),
                "next_action": summary.get("next_action"),
            }
        )
    return response


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    """Create a new project. Requires ops access."""
    require_ops_access(auth_user)
    existing = db.scalar(select(Project).where(Project.code == payload.code.strip().upper()))
    if existing:
        raise HTTPException(status_code=409, detail="项目代码已存在")

    from app.models import DataClassification
    classification = DataClassification.b
    if payload.classification.upper() == "A":
        classification = DataClassification.a
    elif payload.classification.upper() == "C":
        classification = DataClassification.c

    project = Project(
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        classification=classification,
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Add current user to the project
    if auth_user.user_id:
        user = db.get(User, auth_user.user_id)
        if user:
            codes = list(user.project_codes or [])
            if "*" not in codes and project.code not in codes:
                codes.append(project.code)
                user.project_codes = codes
                db.commit()

    return {
        "id": project.id,
        "name": project.name,
        "code": project.code,
        "classification": project.classification,
        "current_phase": None,
        "phase_status": None,
        "last_updated": None,
        "summary": None,
        "next_action": None,
    }


@router.patch("/{project_code}", response_model=ProjectOut)
def rename_project(
    project_code: str,
    payload: ProjectRename,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    """Rename a project. Requires ops access."""
    require_ops_access(auth_user)
    ensure_project_access(auth_user, project_code)
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.name = payload.name.strip()
    db.commit()
    db.refresh(project)

    status_map = build_project_status_map()
    summary = status_map.get(project.code, {})
    return {
        "id": project.id,
        "name": project.name,
        "code": project.code,
        "classification": project.classification,
        "current_phase": summary.get("current_phase"),
        "phase_status": summary.get("phase_status"),
        "last_updated": summary.get("last_updated"),
        "summary": summary.get("summary"),
        "next_action": summary.get("next_action"),
    }


@router.get("/{project_code}/status", response_model=ProjectStatusOut)
def get_project_status(
    project_code: str,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    ensure_project_access(auth_user, project_code)
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    detail = build_project_status_detail(project_code)
    if not detail:
        raise HTTPException(status_code=404, detail="Project status not found")
    return detail


@router.get("/{project_code}/members", response_model=list[ProjectMemberOut])
def list_project_members(
    project_code: str,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ProjectMemberOut]:
    """Return active users who have access to this project."""
    ensure_project_access(auth_user, project_code)
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    users = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.role, User.name)).all()
    members = []
    for user in users:
        codes = user.project_codes or []
        if "*" in codes or project_code in codes:
            members.append(
                ProjectMemberOut(
                    id=user.id,
                    name=user.name,
                    display_name=user.display_name or user.name,
                    role=user.role,
                    is_global="*" in codes,
                )
            )
    return members


class ProjectMemberUpdate(BaseModel):
    """Payload to add or remove members from a project."""
    add_user_ids: list[int] = []
    remove_user_ids: list[int] = []


@router.patch("/{project_code}/members", response_model=list[ProjectMemberOut])
def update_project_members(
    project_code: str,
    payload: ProjectMemberUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[ProjectMemberOut]:
    """Add or remove members from a project. Requires ops access."""
    require_ops_access(auth_user)
    ensure_project_access(auth_user, project_code)

    # Verify project exists
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Add users to project
    if payload.add_user_ids:
        users_to_add = db.scalars(
            select(User).where(User.id.in_(payload.add_user_ids), User.is_active.is_(True))
        ).all()
        for user in users_to_add:
            codes = list(user.project_codes or [])
            if "*" not in codes and project_code not in codes:
                codes.append(project_code)
                user.project_codes = codes

    # Remove users from project
    if payload.remove_user_ids:
        users_to_remove = db.scalars(
            select(User).where(User.id.in_(payload.remove_user_ids))
        ).all()
        for user in users_to_remove:
            codes = list(user.project_codes or [])
            if project_code in codes:
                codes.remove(project_code)
                user.project_codes = codes

    db.commit()

    # Return updated member list
    all_users = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.role, User.name)).all()
    members = []
    for user in all_users:
        codes = user.project_codes or []
        if "*" in codes or project_code in codes:
            members.append(
                ProjectMemberOut(
                    id=user.id,
                    name=user.name,
                    display_name=user.display_name or user.name,
                    role=user.role,
                    is_global="*" in codes,
                )
            )
    return members


@router.delete("/{project_code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_code: str,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
):
    """Archive a project. Requires admin access.
    Preserves task/provider history for operations reporting."""
    require_user_admin(auth_user)
    project = _get_active_project(db, project_code)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    archived_at = datetime.now(timezone.utc)

    # Soft-delete any still-visible tasks so the project disappears from active use.
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

    # Unlink assets
    assets = db.scalars(select(Asset).where(Asset.project_id == project.id)).all()
    for asset in assets:
        asset.project_id = None

    project.archived_at = archived_at

    # Remove project code from all users' project_codes
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
