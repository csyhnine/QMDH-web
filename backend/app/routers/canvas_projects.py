from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import CanvasProject, default_canvas_graph

router = APIRouter(prefix="/canvas-projects", tags=["canvas-projects"])


class CanvasProjectCreate(BaseModel):
    title: str = Field(default="未命名画布", min_length=1, max_length=150)
    graph_json: dict | None = None


class CanvasProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    graph_json: dict | None = None


class CanvasProjectOut(BaseModel):
    id: int
    title: str
    graph_json: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanvasProjectSummaryOut(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _require_user_id(auth_user: AuthUserProfile) -> int:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth_user.user_id


def _get_owned_project(db: Session, project_id: int, owner_user_id: int) -> CanvasProject:
    project = db.scalar(
        select(CanvasProject).where(
            CanvasProject.id == project_id,
            CanvasProject.owner_user_id == owner_user_id,
            CanvasProject.deleted_at.is_(None),
        )
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Canvas project not found")
    return project


def _normalize_graph(graph: dict | None) -> dict:
    if not isinstance(graph, dict):
        return default_canvas_graph()
    nodes = graph.get("nodes")
    edges = graph.get("edges")
    viewport = graph.get("viewport")
    return {
        "version": int(graph.get("version") or 1),
        "nodes": nodes if isinstance(nodes, list) else [],
        "edges": edges if isinstance(edges, list) else [],
        "viewport": viewport if isinstance(viewport, dict) else {"x": 0, "y": 0, "zoom": 1},
    }


@router.get("", response_model=list[CanvasProjectSummaryOut])
def list_canvas_projects(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[CanvasProject]:
    owner_id = _require_user_id(auth_user)
    return list(
        db.scalars(
            select(CanvasProject)
            .where(
                CanvasProject.owner_user_id == owner_id,
                CanvasProject.deleted_at.is_(None),
            )
            .order_by(CanvasProject.updated_at.desc())
        )
    )


@router.post("", response_model=CanvasProjectOut, status_code=status.HTTP_201_CREATED)
def create_canvas_project(
    payload: CanvasProjectCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CanvasProject:
    owner_id = _require_user_id(auth_user)
    project = CanvasProject(
        owner_user_id=owner_id,
        title=payload.title.strip() or "未命名画布",
        graph_json=_normalize_graph(payload.graph_json),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=CanvasProjectOut)
def get_canvas_project(
    project_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CanvasProject:
    owner_id = _require_user_id(auth_user)
    return _get_owned_project(db, project_id, owner_id)


@router.patch("/{project_id}", response_model=CanvasProjectOut)
def update_canvas_project(
    project_id: int,
    payload: CanvasProjectUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CanvasProject:
    owner_id = _require_user_id(auth_user)
    project = _get_owned_project(db, project_id, owner_id)
    if payload.title is not None:
        project.title = payload.title.strip() or project.title
    if payload.graph_json is not None:
        project.graph_json = _normalize_graph(payload.graph_json)
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_canvas_project(
    project_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    owner_id = _require_user_id(auth_user)
    project = _get_owned_project(db, project_id, owner_id)
    project.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
