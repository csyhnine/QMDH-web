"""CAD drawing ingest and structured extract APIs."""

from __future__ import annotations

import re
from base64 import b64decode

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import get_current_auth_user, require_ops_access
from app.core.config import AuthUserProfile, settings
from app.database import get_db
from app.models import CadExtract, User
from app.schemas import (
    CadExtractOut,
    CadExtractUploadIn,
    CadProgramApplyIn,
    CadProgramRearrangeOut,
    CadProgramReviewIn,
    CadRoomEditIn,
    CadPreparationIn,
    CadRouteSuggestionsIn,
    CadRouteSuggestionsOut,
)
from app.services.cad.extract_service import build_cad_extract
from app.services.cad.fitout import write_floor_fitout
from app.services.cad.program_rearrange import (
    apply_program_changes,
    build_rearrange_messages,
    has_rearrange_notes,
    parse_rearrange_text,
)
from app.services.cad.room_edit import adjust_floor_room, ensure_line_layers, save_program_review, undo_floor_edit
from app.services.cad.edit_persistence import CadMediaEdit, CadEditConflict, cad_edit_source, commit_cad_edit
from app.services.chat_service import complete_chat_once, get_chat_models, snapshot_chat_provider_config
from app.services.media_storage import resolve_storage_path
import copy

router = APIRouter(prefix="/cad", tags=["cad"])

_DATA_URL_RE = re.compile(r"^data:[^;]+;base64,(.+)$", re.DOTALL)


def _decode_cad_upload(data_url: str) -> bytes:
    matched = _DATA_URL_RE.match((data_url or "").strip())
    if not matched:
        raise HTTPException(status_code=400, detail="CAD upload must be a base64 data URL")
    try:
        content = b64decode(matched.group(1), validate=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="CAD upload payload is invalid") from exc
    if len(content) > settings.cad_max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"CAD file must be {settings.cad_max_upload_bytes // (1024 * 1024)}MB or smaller",
        )
    if not content:
        raise HTTPException(status_code=400, detail="CAD upload payload is empty")
    return content


def _cad_read_out(record: CadExtract) -> CadExtractOut:
    result = _to_cad_extract_out(record)
    ensure_line_layers(result.data)
    return result


def _to_cad_extract_out(record: CadExtract) -> CadExtractOut:
    from app.services.cad.preparation import preparation_current
    payload = copy.deepcopy(dict(record.payload_json or {}))
    for floor in (payload.get("spaces") or {}).get("floors") or []:
        if floor.get("preparation"):
            floor["preparation"]["current"] = preparation_current(floor)
    return CadExtractOut(
        extract_id=record.public_id,
        status=record.status,
        file_name=record.file_name,
        source_format=record.source_format,
        source_storage_path=resolve_storage_path(record.source_storage_path),
        converted_dxf_path=resolve_storage_path(record.converted_dxf_path) if record.converted_dxf_path else None,
        warnings=list(record.warnings_json or []),
        error_message=record.error_message,
        data=payload,
        created_at=record.created_at,
    )


@router.post("/extract", response_model=CadExtractOut, status_code=status.HTTP_201_CREATED)
def create_cad_extract(
    payload: CadExtractUploadIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadExtractOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    content = _decode_cad_upload(payload.data_url)
    try:
        result = build_cad_extract(
            db,
            user_id=auth_user.user_id,
            file_name=payload.file_name.strip(),
            content=content,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "unsupported_extension":
            raise HTTPException(status_code=400, detail="Only .dxf and .dwg files are supported") from exc
        if code == "file_too_large":
            raise HTTPException(status_code=413, detail="CAD file is too large") from exc
        raise HTTPException(status_code=400, detail="CAD extract failed") from exc

    return _to_cad_extract_out(result.record)


@router.post("/extracts/{extract_id}/rooms", response_model=CadExtractOut)
def edit_cad_room(
    extract_id: str,
    payload: CadRoomEditIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadExtractOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(
        select(CadExtract).where(
            CadExtract.public_id == extract_id.strip(),
            CadExtract.user_id == auth_user.user_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="CAD extract not found")
    try:
        with CadMediaEdit() as media_edit:
            source, source_token = cad_edit_source(db, record)
            if payload.action == "undo":
                updated = undo_floor_edit(source, floor_index=payload.floor_index)
            else:
                updated = adjust_floor_room(
                    source,
                    floor_index=payload.floor_index,
                    room_id=payload.room_id,
                    action=payload.action,
                    proposal=payload.proposal,
                    strokes=payload.strokes,
                )
            commit_cad_edit(db, record, source_token, updated)
            media_edit.reclaim_unpublished(updated)
    except CadEditConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        detail = {
            "nothing_to_undo": "没有可撤销的修改",
            "polygon_required": "至少要点三个顶点",
            "empty_polygon": "这个范围里没有可划分的面积",
            "too_many_rooms": "这一层的分区已经太多",
            "floor_not_found": "没有这一层",
            "room_not_found": "没有这个房间",
        }.get(str(exc), str(exc))
        raise HTTPException(status_code=400, detail=detail) from exc
    db.refresh(record)
    return _to_cad_extract_out(record)


def _choose_chat_profile(db: Session):
    profiles = get_chat_models(db)

    def rank(profile) -> tuple[int, int]:
        name = f"{profile.display_name or ''} {profile.model_name or ''}".lower()
        if "claude" in name:
            priority = 0
        elif "gemini" in name:
            priority = 1
        else:
            priority = 2
        return priority, int(profile.id or 0)

    return sorted(profiles, key=rank)[0] if profiles else None


@router.post("/extracts/{extract_id}/program-rearrange", response_model=CadProgramRearrangeOut)
async def rearrange_cad_program(
    extract_id: str,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadProgramRearrangeOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(
        select(CadExtract).where(
            CadExtract.public_id == extract_id.strip(),
            CadExtract.user_id == auth_user.user_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="CAD extract not found")
    profile = _choose_chat_profile(db)
    if profile is None:
        raise HTTPException(status_code=503, detail="没有可用的对话模型")
    source = copy.deepcopy(dict(record.payload_json or {}))
    if not has_rearrange_notes(source):
        raise HTTPException(status_code=400, detail="先写下并保存审查意见")
    try:
        text, _usage = await complete_chat_once(
            snapshot_chat_provider_config(profile),
            build_rearrange_messages(source),
            max_tokens=1200,
        )
        items = parse_rearrange_text(text, source)
    except ValueError as exc:
        detail = {
            "no_notes": "先写下并保存审查意见",
            "model_output": "对话模型没有返回可用的修改",
        }.get(str(exc), "对话模型没有返回可用的修改")
        raise HTTPException(status_code=400, detail=detail) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail="对话模型没有返回可用的修改") from exc
    return CadProgramRearrangeOut(
        model_name=(profile.display_name or profile.model_name or "").strip(),
        items=items,
    )


@router.post("/extracts/{extract_id}/program-apply", response_model=CadExtractOut)
def apply_cad_program(
    extract_id: str,
    payload: CadProgramApplyIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadExtractOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(
        select(CadExtract).where(
            CadExtract.public_id == extract_id.strip(),
            CadExtract.user_id == auth_user.user_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="CAD extract not found")
    try:
        with CadMediaEdit() as media_edit:
            source, source_token = cad_edit_source(db, record)
            updated = apply_program_changes(
                source,
                [item.model_dump() for item in payload.items],
            )
            commit_cad_edit(db, record, source_token, updated)
            media_edit.reclaim_unpublished(updated)
    except CadEditConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        detail = {"nothing_to_apply": "没有可写入的修改"}.get(str(exc), str(exc))
        raise HTTPException(status_code=400, detail=detail) from exc
    db.refresh(record)
    return _to_cad_extract_out(record)


@router.post("/extracts/{extract_id}/program-review", response_model=CadExtractOut)
def save_cad_program_review(
    extract_id: str,
    payload: CadProgramReviewIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadExtractOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(
        select(CadExtract).where(
            CadExtract.public_id == extract_id.strip(),
            CadExtract.user_id == auth_user.user_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="CAD extract not found")
    try:
        source, source_token = cad_edit_source(db, record)
        updated = save_program_review(source, payload.notes)
        commit_cad_edit(db, record, source_token, updated)
    except CadEditConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.refresh(record)
    return _to_cad_extract_out(record)


@router.post("/extracts/{extract_id}/route-suggestions", response_model=CadRouteSuggestionsOut)
def suggest_cad_routes(
    extract_id: str,
    inputs: CadRouteSuggestionsIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> dict:
    from app.services.cad.circulation import suggest_routes

    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(select(CadExtract).where(CadExtract.public_id == extract_id.strip(), CadExtract.user_id == auth_user.user_id))
    if record is None:
        raise HTTPException(status_code=404, detail="CAD extract not found")
    try:
        return suggest_routes(dict(record.payload_json or {}), inputs.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail="本层图像文件缺失，无法生成通路建议") from exc


@router.post("/extracts/{extract_id}/preparation", response_model=CadExtractOut)
def prepare_cad_fitout(
    extract_id: str,
    inputs: CadPreparationIn,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadExtractOut:
    from app.services.cad.preparation import save_preparation

    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(select(CadExtract).where(CadExtract.public_id == extract_id.strip(), CadExtract.user_id == auth_user.user_id))
    if record is None:
        raise HTTPException(status_code=404, detail="CAD extract not found")
    try:
        source, source_token = cad_edit_source(db, record)
        ensure_line_layers(source)
        updated = save_preparation(source, inputs.model_dump())
        commit_cad_edit(db, record, source_token, updated)
    except CadEditConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail="本层图像文件缺失，无法校准") from exc
    db.refresh(record)
    return _to_cad_extract_out(record)


@router.post("/extracts/{extract_id}/fitout", response_model=CadExtractOut)
def generate_cad_fitout(
    extract_id: str,
    floor_index: int = Query(ge=1),
    clear: bool = Query(False),
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadExtractOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    record = db.scalar(
        select(CadExtract).where(
            CadExtract.public_id == extract_id.strip(),
            CadExtract.user_id == auth_user.user_id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="CAD extract not found")
    try:
        source, source_token = cad_edit_source(db, record)
        ensure_line_layers(source)
        updated = write_floor_fitout(source, floor_index, clear=clear)
        commit_cad_edit(db, record, source_token, updated)
    except CadEditConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        detail = {"floor_not_found": "没有这一层"}.get(str(exc), str(exc))
        raise HTTPException(status_code=400, detail=detail) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail="这一层还不能布置") from exc
    db.refresh(record)
    return _to_cad_extract_out(record)


@router.get("/extracts/{extract_id}", response_model=CadExtractOut)
def get_cad_extract(
    extract_id: str,
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
) -> CadExtractOut:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    with db.no_autoflush:
        record = db.scalar(
            select(CadExtract).where(
                CadExtract.public_id == extract_id.strip(),
                CadExtract.user_id == auth_user.user_id,
            )
        )
        if record is None:
            raise HTTPException(status_code=404, detail="CAD extract not found")
        return _cad_read_out(record)


@router.get("/extracts", response_model=list[CadExtractOut])
def list_cad_extracts(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[CadExtractOut]:
    if auth_user.user_id is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    with db.no_autoflush:
        rows = db.scalars(
            select(CadExtract)
            .where(CadExtract.user_id == auth_user.user_id)
            .order_by(CadExtract.created_at.desc(), CadExtract.id.desc())
            .limit(limit)
        ).all()
        return [_cad_read_out(row) for row in rows]


@router.get("/usage-summary")
def cad_usage_summary(
    db: Session = Depends(get_db),
    auth_user: AuthUserProfile = Depends(get_current_auth_user),
    limit: int = Query(default=30, ge=1, le=100),
) -> dict:
    require_ops_access(auth_user)
    total = int(db.scalar(select(func.count()).select_from(CadExtract)) or 0)
    by_status = {
        str(status_name): int(count)
        for status_name, count in db.execute(select(CadExtract.status, func.count()).group_by(CadExtract.status)).all()
    }
    rows = db.execute(
        select(CadExtract, User)
        .join(User, User.id == CadExtract.user_id)
        .order_by(CadExtract.created_at.desc(), CadExtract.id.desc())
        .limit(limit)
    ).all()
    recent = []
    for row, owner in rows:
        spaces = (row.payload_json or {}).get("spaces") or {}
        floors = spaces.get("floors") or []
        room_count = sum(len(floor.get("rooms") or []) for floor in floors)
        recent.append(
            {
                "extract_id": row.public_id,
                "file_name": row.file_name,
                "status": row.status,
                "owner_name": owner.display_name or owner.name,
                "owner_role": owner.role,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "floor_count": len(floors),
                "room_count": room_count,
            }
        )
    return {"total": total, "by_status": by_status, "recent": recent}
