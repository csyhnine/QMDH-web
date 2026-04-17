from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Project
from app.schemas import ProjectOut, ProjectStatusOut
from app.services.project_status import build_project_status_detail, build_project_status_map

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)) -> list[dict]:
    projects = list(db.scalars(select(Project).order_by(Project.code)).all())
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


@router.get("/{project_code}/status", response_model=ProjectStatusOut)
def get_project_status(project_code: str) -> dict:
    detail = build_project_status_detail(project_code)
    if not detail:
        raise HTTPException(status_code=404, detail="Project status not found")
    return detail
