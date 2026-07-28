from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_content_ops_access
from app.core.config import AuthUserProfile
from app.database import get_db
from app.models import AiTool
from app.services.media_storage import resolve_storage_path

router = APIRouter(prefix="/ai-tools", tags=["ai-tools"])


def _validate_http_url(value: str) -> str:
    url = (value or "").strip()
    if not url.startswith(("http://", "https://")):
        raise ValueError("url must start with http:// or https://")
    return url


class AiToolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str = ""
    url: str = Field(min_length=1, max_length=500)
    category: str = Field(default="", max_length=80)
    cover_image_path: str = Field(default="", max_length=255)
    is_featured: bool = False
    sort_order: int = 0
    is_active: bool = True

    @field_validator("url")
    @classmethod
    def url_must_be_http(cls, value: str) -> str:
        return _validate_http_url(value)


class AiToolUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    url: str | None = Field(default=None, min_length=1, max_length=500)
    category: str | None = Field(default=None, max_length=80)
    cover_image_path: str | None = Field(default=None, max_length=255)
    is_featured: bool | None = None
    sort_order: int | None = None
    is_active: bool | None = None

    @field_validator("url")
    @classmethod
    def url_must_be_http(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return _validate_http_url(value)


class AiToolOut(BaseModel):
    id: int
    name: str
    description: str
    url: str
    category: str
    cover_image_path: str
    is_featured: bool
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


def _require_user_id(auth_user: AuthUserProfile) -> int:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return auth_user.user_id


def _to_out(row: AiTool) -> AiToolOut:
    return AiToolOut(
        id=row.id,
        name=row.name,
        description=row.description or "",
        url=row.url,
        category=row.category or "",
        cover_image_path=resolve_storage_path(row.cover_image_path) if row.cover_image_path else "",
        is_featured=bool(row.is_featured),
        sort_order=int(row.sort_order or 0),
        is_active=bool(row.is_active),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_alive(db: Session, tool_id: int) -> AiTool:
    row = db.get(AiTool, tool_id)
    if row is None or row.deleted_at is not None:
        raise HTTPException(status_code=404, detail="AI tool not found")
    return row


def _list_query(*, active_only: bool):
    stmt = select(AiTool).where(AiTool.deleted_at.is_(None))
    if active_only:
        stmt = stmt.where(AiTool.is_active.is_(True))
    return stmt.order_by(
        AiTool.is_featured.desc(),
        AiTool.sort_order.asc(),
        AiTool.updated_at.desc(),
    )


@router.get("", response_model=list[AiToolOut])
def list_ai_tools(
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> list[AiToolOut]:
    _require_user_id(auth_user)
    rows = db.scalars(_list_query(active_only=True)).all()
    return [_to_out(row) for row in rows]


@router.get("/admin", response_model=list[AiToolOut])
def list_admin_ai_tools(
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> list[AiToolOut]:
    require_content_ops_access(auth_user)
    rows = db.scalars(_list_query(active_only=False)).all()
    return [_to_out(row) for row in rows]


@router.post("/admin", response_model=AiToolOut, status_code=status.HTTP_201_CREATED)
def create_ai_tool(
    payload: AiToolCreate,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> AiToolOut:
    require_content_ops_access(auth_user)
    user_id = _require_user_id(auth_user)
    row = AiTool(
        name=payload.name.strip(),
        description=(payload.description or "").strip(),
        url=payload.url.strip(),
        category=(payload.category or "").strip(),
        cover_image_path=(payload.cover_image_path or "").strip(),
        is_featured=bool(payload.is_featured),
        sort_order=int(payload.sort_order or 0),
        is_active=bool(payload.is_active),
        created_by_user_id=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/admin/{tool_id}", response_model=AiToolOut)
def update_ai_tool(
    tool_id: int,
    payload: AiToolUpdate,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> AiToolOut:
    require_content_ops_access(auth_user)
    row = _get_alive(db, tool_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = str(data["name"]).strip()
    if "description" in data and data["description"] is not None:
        row.description = str(data["description"]).strip()
    if "url" in data and data["url"] is not None:
        row.url = str(data["url"]).strip()
    if "category" in data and data["category"] is not None:
        row.category = str(data["category"]).strip()
    if "cover_image_path" in data and data["cover_image_path"] is not None:
        row.cover_image_path = str(data["cover_image_path"]).strip()
    if "is_featured" in data and data["is_featured"] is not None:
        row.is_featured = bool(data["is_featured"])
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = int(data["sort_order"])
    if "is_active" in data and data["is_active"] is not None:
        row.is_active = bool(data["is_active"])
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/admin/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ai_tool(
    tool_id: int,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    db: Session = Depends(get_db),
) -> Response:
    require_content_ops_access(auth_user)
    row = _get_alive(db, tool_id)
    row.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
