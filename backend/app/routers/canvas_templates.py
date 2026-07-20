from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_content_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import CanvasTemplate, default_canvas_graph
from app.services.media_storage import resolve_storage_path

router = APIRouter(prefix="/canvas-templates", tags=["canvas-templates"])


class CanvasTemplateCreate(BaseModel):
    title: str = Field(default="未命名模板", min_length=1, max_length=150)
    description: str = ""
    category: str = Field(default="", max_length=80)
    is_featured: bool = False
    graph_json: dict | None = None
    preview_image_path: str = Field(default="", max_length=255)


class CanvasTemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    category: str | None = Field(default=None, max_length=80)
    is_featured: bool | None = None
    graph_json: dict | None = None
    preview_image_path: str | None = Field(default=None, max_length=255)


class CanvasTemplateSummaryOut(BaseModel):
    id: int
    title: str
    description: str
    category: str
    is_featured: bool
    preview_image_path: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanvasTemplateOut(CanvasTemplateSummaryOut):
    graph_json: dict


def _require_user_id(auth_user: AuthUserProfile) -> int:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth_user.user_id


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


def _preview_path(value: str | None) -> str:
    if not value:
        return ""
    return resolve_storage_path(value) or value


def _to_summary(template: CanvasTemplate) -> CanvasTemplateSummaryOut:
    return CanvasTemplateSummaryOut(
        id=template.id,
        title=template.title,
        description=template.description or "",
        category=template.category or "",
        is_featured=bool(template.is_featured),
        preview_image_path=_preview_path(template.preview_image_path),
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _to_detail(template: CanvasTemplate) -> CanvasTemplateOut:
    summary = _to_summary(template)
    return CanvasTemplateOut(
        **summary.model_dump(),
        graph_json=template.graph_json if isinstance(template.graph_json, dict) else default_canvas_graph(),
    )


def _active_template_query():
    return select(CanvasTemplate).where(CanvasTemplate.deleted_at.is_(None))


def _get_active_template(db: Session, template_id: int) -> CanvasTemplate:
    template = db.scalar(_active_template_query().where(CanvasTemplate.id == template_id))
    if template is None:
        raise HTTPException(status_code=404, detail="Canvas template not found")
    return template


@router.get("", response_model=list[CanvasTemplateSummaryOut])
def list_canvas_templates(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[CanvasTemplateSummaryOut]:
    _require_user_id(auth_user)
    templates = list(
        db.scalars(
            _active_template_query().order_by(
                CanvasTemplate.is_featured.desc(),
                CanvasTemplate.updated_at.desc(),
                CanvasTemplate.id.desc(),
            )
        )
    )
    return [_to_summary(item) for item in templates]


@router.get("/admin", response_model=list[CanvasTemplateOut])
def list_admin_canvas_templates(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> list[CanvasTemplateOut]:
    require_content_ops_access(auth_user)
    templates = list(
        db.scalars(
            _active_template_query().order_by(CanvasTemplate.updated_at.desc(), CanvasTemplate.id.desc())
        )
    )
    return [_to_detail(item) for item in templates]


@router.post("/admin", response_model=CanvasTemplateOut, status_code=status.HTTP_201_CREATED)
def create_admin_canvas_template(
    payload: CanvasTemplateCreate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CanvasTemplateOut:
    require_content_ops_access(auth_user)
    creator_id = _require_user_id(auth_user)
    template = CanvasTemplate(
        title=payload.title.strip() or "未命名模板",
        description=(payload.description or "").strip(),
        category=(payload.category or "").strip(),
        is_featured=bool(payload.is_featured),
        graph_json=_normalize_graph(payload.graph_json),
        preview_image_path=(payload.preview_image_path or "").strip(),
        created_by_user_id=creator_id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _to_detail(template)


@router.patch("/admin/{template_id}", response_model=CanvasTemplateOut)
def update_admin_canvas_template(
    template_id: int,
    payload: CanvasTemplateUpdate,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CanvasTemplateOut:
    require_content_ops_access(auth_user)
    template = _get_active_template(db, template_id)
    if payload.title is not None:
        template.title = payload.title.strip() or template.title
    if payload.description is not None:
        template.description = payload.description.strip()
    if payload.category is not None:
        template.category = payload.category.strip()
    if payload.is_featured is not None:
        template.is_featured = bool(payload.is_featured)
    if payload.graph_json is not None:
        template.graph_json = _normalize_graph(payload.graph_json)
    if payload.preview_image_path is not None:
        template.preview_image_path = payload.preview_image_path.strip()
    template.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(template)
    return _to_detail(template)


@router.delete("/admin/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin_canvas_template(
    template_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> Response:
    require_content_ops_access(auth_user)
    template = _get_active_template(db, template_id)
    template.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{template_id}", response_model=CanvasTemplateOut)
def get_canvas_template(
    template_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CanvasTemplateOut:
    _require_user_id(auth_user)
    return _to_detail(_get_active_template(db, template_id))
