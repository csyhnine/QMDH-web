from base64 import b64decode
from datetime import datetime
from random import randint
import re
import shutil
from time import monotonic
from uuid import uuid4
from dataclasses import replace

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.auth import can_access_project, get_current_auth_user, get_optional_auth_user
from app.core.config import AuthUserProfile, settings
from app.database import get_db
from app.models import Asset, AssetBookmark, AssetType, CadExtract, GifCompressionRecord, InspirationPost, Project, ProviderCall, Task
from app.schemas import AssetOut, AssetShareIn, AssetShareOut, ReferenceUploadIn, ReferenceUploadOut
from app.schemas import GifCompressIn, GifCompressOut
from app.services.gif_compression import GifOptions, is_gif, _inspect
from app.services.media_storage import resolve_storage_path, write_uploaded_asset

router = APIRouter(prefix="/assets", tags=["assets"])

MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024


def _owned_task_ids(db: Session, auth_user: AuthUserProfile) -> set[int]:
    query = select(Task.id).join(Task.project).where(Task.deleted_at.is_(None))
    if auth_user.user_id is not None:
        query = query.where(Task.user_id == auth_user.user_id)
    else:
        query = query.where(Task.user.has(name=auth_user.name))
    if "*" not in auth_user.project_codes:
        query = query.where(Project.code.in_(auth_user.project_codes))
    return set(db.scalars(query).all())


def _can_access_asset(
    asset: Asset,
    *,
    auth_user: AuthUserProfile,
    owned_task_ids: set[int],
) -> bool:
    if asset.source_task_id is None:
        if asset.project is None:
            return False
        return can_access_project(auth_user, asset.project.code)
    if asset.source_task_id not in owned_task_ids:
        return False
    if asset.project is None:
        return True
    return can_access_project(auth_user, asset.project.code)


def _ensure_asset_access(
    asset: Asset,
    *,
    auth_user: AuthUserProfile,
    db: Session,
) -> None:
    owned_task_ids = _owned_task_ids(db, auth_user)
    if not _can_access_asset(asset, auth_user=auth_user, owned_task_ids=owned_task_ids):
        raise HTTPException(status_code=403, detail="Asset access denied")


def _to_asset_out(db: Session, asset: Asset, auth_user: AuthUserProfile) -> AssetOut:
    is_bookmarked = False
    if auth_user.user_id:
        is_bookmarked = db.scalar(
            select(AssetBookmark).where(
                AssetBookmark.user_id == auth_user.user_id,
                AssetBookmark.asset_id == asset.id,
            )
        ) is not None
    inspiration_post = db.scalar(
        select(InspirationPost).where(InspirationPost.source_asset_id == asset.id).order_by(InspirationPost.id.asc())
    )

    out = AssetOut.model_validate(asset)
    out.storage_path = resolve_storage_path(asset.storage_path)
    out.is_bookmarked = is_bookmarked
    out.bookmark_count = len(asset.bookmarks)
    out.inspiration_post_id = inspiration_post.id if inspiration_post else None
    out.is_shared_to_inspiration = inspiration_post is not None
    return out


def _get_existing_inspiration_post(db: Session, asset_id: int) -> InspirationPost | None:
    return db.scalar(
        select(InspirationPost).where(InspirationPost.source_asset_id == asset_id).order_by(InspirationPost.id.asc())
    )


def _derive_inspiration_title(asset: Asset, task: Task | None) -> str:
    for candidate in (asset.name, task.title if task else None):
        text = (candidate or "").strip()
        if text:
            return text[:200]
    return f"Studio share #{asset.id}"


def _derive_inspiration_description(asset: Asset, task: Task | None) -> str:
    prompt_text = (asset.prompt_text or "").strip()
    task_title = (task.title or "").strip() if task else ""
    if prompt_text and task_title and task_title != asset.name:
        return f"{task_title}\n\n{prompt_text}"
    if prompt_text:
        return prompt_text
    if task_title and task_title != asset.name:
        return task_title
    return ""


def _derive_inspiration_model_name(db: Session, asset: Asset, task: Task | None) -> str:
    if asset.source_task_id is not None:
        provider_call = db.scalar(
            select(ProviderCall).where(ProviderCall.task_id == asset.source_task_id).order_by(ProviderCall.id.desc())
        )
        if provider_call and provider_call.model_name.strip():
            return provider_call.model_name.strip()
    if task:
        response_model = task.result.get("response_model")
        if isinstance(response_model, str) and response_model.strip():
            return response_model.strip()
        if task.requested_provider.strip():
            return task.requested_provider.strip()
    return ""


def _extract_reference_images(task: Task | None) -> list[str]:
    if task is None:
        return []

    for payload in (task.result, task.payload):
        if not isinstance(payload, dict):
            continue
        for key in ("reference_image_storage_paths", "reference_images", "source_images"):
            raw_value = payload.get(key)
            if isinstance(raw_value, list):
                values = [str(item or "").strip() for item in raw_value]
                cleaned = [value for value in values if value]
                if cleaned:
                    return cleaned[:4]
        for key in ("reference_image_storage_path", "reference_image", "source_image", "image"):
            value = str(payload.get(key) or "").strip()
            if value:
                return [value]
    return []


def _derive_inspiration_source_image_path(task: Task | None) -> str:
    reference_images = _extract_reference_images(task)
    return reference_images[0] if reference_images else ""


def _extension_for_reference_upload(file_name: str, data_url: str) -> str:
    normalized_name = file_name.lower().strip()
    if "." in normalized_name:
        suffix = normalized_name.rsplit(".", 1)[-1]
        if suffix in {"png", "jpg", "jpeg", "webp", "gif"}:
            return "jpeg" if suffix == "jpg" else suffix

    if data_url.lower().startswith("data:image/gif;"):
        return "gif"
    if data_url.startswith("data:image/png"):
        return "png"
    if data_url.startswith("data:image/jpeg") or data_url.startswith("data:image/jpg"):
        return "jpeg"
    if data_url.startswith("data:image/webp"):
        return "webp"
    raise HTTPException(status_code=400, detail="Unsupported reference image format")


def _decode_reference_upload(data_url: str) -> bytes:
    matched = re.match(r"^data:image/[a-zA-Z0-9.+-]+;base64,(.+)$", data_url)
    if not matched:
        raise HTTPException(status_code=400, detail="Reference image must be a base64 data URL")

    try:
        content = b64decode(matched.group(1), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Reference image payload is invalid") from exc
    if len(content) > MAX_REFERENCE_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Reference image must be 20MB or smaller",
        )
    return content


@router.get("", response_model=list[AssetOut])
def list_assets(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile | None = Depends(get_optional_auth_user),
    bookmarked: bool | None = None,
    limit: int | None = Query(default=None, ge=1, le=500),
    task_ids: list[int] | None = Query(default=None, max_length=120),
) -> list[AssetOut]:
    if auth_user is None:
        return []
    owned_task_ids = _owned_task_ids(db, auth_user)
    project_access = Asset.project.has(Project.code.in_(auth_user.project_codes))
    if "*" in auth_user.project_codes:
        project_access = Asset.project_id.is_not(None)
    query = select(Asset).where(or_(
        and_(Asset.source_task_id.is_(None), project_access),
        and_(Asset.source_task_id.in_(owned_task_ids), or_(Asset.project_id.is_(None), project_access)),
    )).order_by(Asset.id.desc())
    if task_ids is not None:
        query = query.where(Asset.source_task_id.in_(task_ids))
    if bookmarked is not None:
        bookmark_access = Asset.id.in_(select(AssetBookmark.asset_id).where(
            AssetBookmark.user_id == auth_user.user_id
        ))
        query = query.where(bookmark_access if bookmarked else ~bookmark_access)
    if limit is not None:
        query = query.limit(limit)
    assets = db.scalars(query).all()
    accessible = [
        asset
        for asset in assets
        if _can_access_asset(asset, auth_user=auth_user, owned_task_ids=owned_task_ids)
    ]

    # Get current user's bookmarked asset IDs
    user_id = auth_user.user_id
    bookmarked_ids: set[int] = set()
    if user_id:
        bookmarked_ids = set(
            db.scalars(
                select(AssetBookmark.asset_id).where(AssetBookmark.user_id == user_id)
            ).all()
        )

    results = []
    for asset in accessible:
        is_bookmarked = asset.id in bookmarked_ids
        if bookmarked is True and not is_bookmarked:
            continue
        if bookmarked is False and is_bookmarked:
            continue
        out = _to_asset_out(db, asset, auth_user)
        out.is_bookmarked = is_bookmarked
        results.append(out)
    return results


@router.post("/reference-upload", response_model=ReferenceUploadOut, status_code=status.HTTP_201_CREATED)
def upload_reference_image(
    payload: ReferenceUploadIn,
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> ReferenceUploadOut:
    extension = _extension_for_reference_upload(payload.file_name, payload.data_url)
    content = _decode_reference_upload(payload.data_url)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_stub = "".join(char if char.isalnum() else "-" for char in payload.file_name.lower()).strip("-") or "reference"
    relative_path = f"references/{timestamp}-{safe_stub[:40]}-{randint(1000, 9999)}.{extension}"
    compression_info: dict = {}
    storage_path = write_uploaded_asset(relative_path, content, compression_info=compression_info)
    return ReferenceUploadOut(file_name=payload.file_name, storage_path=resolve_storage_path(storage_path), compression=compression_info or None)


@router.post("/gif-compress", response_model=GifCompressOut, status_code=status.HTTP_201_CREATED)
def compress_uploaded_gif(
    payload: GifCompressIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> GifCompressOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not settings.gif_compression_enabled or not shutil.which(settings.ffmpeg_binary):
        raise HTTPException(status_code=503, detail="GIF 压缩服务暂不可用，请联系管理员。")
    content = _decode_reference_upload(payload.data_url)
    if not is_gif(content):
        raise HTTPException(status_code=422, detail="请选择有效的 GIF 文件。")
    try:
        _inspect(content, monotonic() + 5)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="GIF 无法读取或超出处理预算，请缩短动画或降低尺寸后重试。") from exc
    options = replace(GifOptions.from_settings(), target_bytes=payload.target_kb * 1000,
                      max_edge=payload.max_edge, max_fps=payload.max_fps, max_colors=payload.max_colors,
                      allow_resize=payload.allow_resize, allow_frame_reduction=payload.allow_frame_reduction)
    original = f"gif-tools/{uuid4().hex}.gif"
    compression: dict = {}
    result = write_uploaded_asset(original, content, compression_info=compression, gif_options=options)
    record = GifCompressionRecord(user_id=auth_user.user_id, file_name=payload.file_name,
        storage_path=result, original_storage_path=original, compression=compression,
        parameters=payload.model_dump(exclude={"file_name", "data_url"}))
    db.add(record)
    db.commit()
    db.refresh(record)
    return _gif_record_out(record)


def _gif_record_out(record: GifCompressionRecord) -> GifCompressOut:
    return GifCompressOut(file_name=record.file_name, storage_path=resolve_storage_path(record.storage_path),
        original_storage_path=resolve_storage_path(record.original_storage_path), compression=record.compression,
        record_id=record.id, created_at=record.created_at, parameters=record.parameters)


@router.get("/gif-history", response_model=list[GifCompressOut])
def list_gif_history(before_id: int | None = Query(default=None, ge=1), limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db), auth_user: AuthUserProfile = Depends(get_current_auth_user)):
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    query = select(GifCompressionRecord).where(GifCompressionRecord.user_id == auth_user.user_id)
    if before_id is not None:
        query = query.where(GifCompressionRecord.id < before_id)
    return [_gif_record_out(record) for record in db.scalars(query.order_by(GifCompressionRecord.id.desc()).limit(limit)).all()]


@router.get("/gif-history/{record_id}", response_model=GifCompressOut)
def get_gif_history(record_id: int, db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user)):
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(select(GifCompressionRecord).where(GifCompressionRecord.id == record_id,
        GifCompressionRecord.user_id == auth_user.user_id))
    if record is None:
        raise HTTPException(status_code=404, detail="GIF record not found")
    return _gif_record_out(record)


@router.post("/{asset_id}/like", response_model=AssetOut, status_code=status.HTTP_200_OK)
def like_asset(
    asset_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AssetOut:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    _ensure_asset_access(asset, auth_user=auth_user, db=db)
    asset.like_count += 1
    db.commit()
    db.refresh(asset)
    return _to_asset_out(db, asset, auth_user)


@router.post("/{asset_id}/share", response_model=AssetShareOut, status_code=status.HTTP_200_OK)
def share_asset(
    asset_id: int,
    payload: AssetShareIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AssetShareOut:
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    _ensure_asset_access(asset, auth_user=auth_user, db=db)

    existing_post = _get_existing_inspiration_post(db, asset.id)
    if existing_post:
        return AssetShareOut(
            asset=_to_asset_out(db, asset, auth_user),
            inspiration_post_id=existing_post.id,
            already_shared=True,
        )

    if not payload.confirmed:
        raise HTTPException(status_code=400, detail="Share confirmation required")

    task = db.get(Task, asset.source_task_id) if asset.source_task_id is not None else None
    source_image_path = _derive_inspiration_source_image_path(task)
    media_type = "video" if asset.asset_type == AssetType.video else "image"
    post = InspirationPost(
        title=_derive_inspiration_title(asset, task),
        description=_derive_inspiration_description(asset, task),
        source_image_path=source_image_path,
        image_path=asset.storage_path,
        media_type=media_type,
        category="\u5efa\u7b51",
        tags=list(dict.fromkeys(tag.strip() for tag in (asset.tags or []) if tag.strip())),
        source_type="user",
        source_name=task.requested_provider.strip() if task and task.requested_provider else "",
        source_url="",
        source_asset_id=asset.id,
        prompt_text=asset.prompt_text,
        model_name=_derive_inspiration_model_name(db, asset, task),
        user_id=auth_user.user_id,
    )
    db.add(post)
    asset.share_count += 1
    db.commit()
    db.refresh(asset)
    db.refresh(post)
    return AssetShareOut(
        asset=_to_asset_out(db, asset, auth_user),
        inspiration_post_id=post.id,
        already_shared=False,
    )


@router.post("/{asset_id}/bookmark", response_model=AssetOut, status_code=status.HTTP_200_OK)
def toggle_bookmark(
    asset_id: int,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> AssetOut:
    """Toggle bookmark for the current user. Returns updated asset with bookmark state."""
    asset = db.get(Asset, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    _ensure_asset_access(asset, auth_user=auth_user, db=db)

    user_id = auth_user.user_id
    if not user_id:
        raise HTTPException(status_code=400, detail="Bookmark requires a database user session")

    existing = db.scalar(
        select(AssetBookmark).where(
            AssetBookmark.user_id == user_id,
            AssetBookmark.asset_id == asset_id,
        )
    )
    if existing:
        db.delete(existing)
        is_bookmarked = False
    else:
        db.add(AssetBookmark(user_id=user_id, asset_id=asset_id))
        is_bookmarked = True

    db.commit()
    db.refresh(asset)
    out = _to_asset_out(db, asset, auth_user)
    out.is_bookmarked = is_bookmarked
    return out


@router.get("/library")
def list_asset_library(
    kind: str = Query(default="all"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=30, le=30),
    q: str = Query(default=""),
    since: str = Query(default=""),
    until: str = Query(default=""),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    selected = kind if kind in {"all", "image", "video", "cad", "gif"} else "all"
    items: list[dict] = []
    if selected in {"all", "image", "video"}:
        type_filter = [AssetType.image, AssetType.video]
        if selected == "image":
            type_filter = [AssetType.image]
        elif selected == "video":
            type_filter = [AssetType.video]
        assets = db.scalars(
            select(Asset)
            .join(Task, Asset.source_task_id == Task.id)
            .where(
                Task.user_id == auth_user.user_id,
                Task.deleted_at.is_(None),
                Asset.asset_type.in_(type_filter),
            )
            .order_by(Asset.created_at.desc(), Asset.id.desc())
            .limit(400)
        ).all()
        for asset in assets:
            kind_name = asset.asset_type.value if isinstance(asset.asset_type, AssetType) else str(asset.asset_type)
            items.append(
                {
                    "id": f"asset-{asset.id}",
                    "kind": kind_name,
                    "title": asset.name,
                    "subtitle": (asset.prompt_text or "").strip()[:80],
                    "preview_path": resolve_storage_path(asset.storage_path),
                    "history_href": f"/studio/generate?task={asset.source_task_id}" if asset.source_task_id else "/studio/generate",
                    "created_at": asset.created_at.isoformat() if asset.created_at else None,
                }
            )
    if selected in {"all", "cad"}:
        extracts = db.scalars(
            select(CadExtract)
            .where(CadExtract.user_id == auth_user.user_id)
            .order_by(CadExtract.created_at.desc(), CadExtract.id.desc())
            .limit(400)
        ).all()
        for record in extracts:
            floors = ((record.payload_json or {}).get("spaces") or {}).get("floors") or []
            preview = ""
            for floor in floors:
                if floor.get("preview_path"):
                    preview = str(floor["preview_path"])
                    break
            items.append(
                {
                    "id": record.public_id,
                    "kind": "cad",
                    "title": record.file_name,
                    "subtitle": record.status,
                    "preview_path": preview,
                    "history_href": f"/studio/cad?extract={record.public_id}",
                    "created_at": record.created_at.isoformat() if record.created_at else None,
                }
            )
    if selected in {"all", "gif"}:
        records = db.scalars(select(GifCompressionRecord).where(GifCompressionRecord.user_id == auth_user.user_id)
            .order_by(GifCompressionRecord.id.desc()).limit(400)).all()
        for record in records:
            items.append({"id": f"gif-{record.id}", "kind": "gif", "title": record.file_name,
                "subtitle": "GIF 压缩 · " + ("已达标" if record.compression.get("target_met") else "未达标"),
                "preview_path": resolve_storage_path(record.storage_path),
                "history_href": f"/studio/gif?record_id={record.id}",
                "created_at": record.created_at.isoformat() if record.created_at else None})
    keyword = q.strip().lower()
    since_day = since.strip()[:10]
    until_day = until.strip()[:10]
    if keyword or since_day or until_day:
        filtered = []
        for item in items:
            created_day = (item["created_at"] or "")[:10]
            if keyword and keyword not in f"{item['title']} {item['subtitle']}".lower():
                continue
            if since_day and created_day < since_day:
                continue
            if until_day and created_day > until_day:
                continue
            filtered.append(item)
        items = filtered
    items.sort(key=lambda item: item["created_at"] or "", reverse=True)
    start = (page - 1) * page_size
    return {
        "kind": selected,
        "page": page,
        "page_size": page_size,
        "total": len(items),
        "items": items[start : start + page_size],
    }
