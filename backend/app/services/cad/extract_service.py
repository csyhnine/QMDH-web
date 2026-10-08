"""Orchestrate CAD file ingest, optional DWG conversion, and DXF extract."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from random import randint
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import CadExtract
from app.services.cad.constants import DWG_CONVERTER_NOTE, TIANZHENG_UPLOAD_NOTE
from app.services.cad.dwg_converter import convert_dwg_bytes, converter_configured
from app.services.cad.dxf_reader import parse_dxf_bytes
from app.services.media_storage import resolve_storage_path, write_binary_asset


@dataclass(frozen=True)
class CadExtractBuildResult:
    record: CadExtract
    payload: dict[str, Any]


def _safe_stub(file_name: str) -> str:
    normalized = (file_name or "drawing").lower().strip()
    stub = "".join(char if char.isalnum() else "-" for char in normalized).strip("-")
    return (stub[:40] or "drawing")


def _extension(file_name: str) -> str:
    matched = re.search(r"\.([A-Za-z0-9]+)$", (file_name or "").strip())
    if not matched:
        return ""
    return matched.group(1).lower()


def build_cad_extract(
    db: Session,
    *,
    user_id: int,
    file_name: str,
    content: bytes,
) -> CadExtractBuildResult:
    extension = _extension(file_name)
    if extension not in {"dxf", "dwg"}:
        raise ValueError("unsupported_extension")

    if len(content) > settings.cad_max_upload_bytes:
        raise ValueError("file_too_large")

    sha256 = hashlib.sha256(content).hexdigest()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    stub = _safe_stub(file_name)
    public_id = f"ce_{uuid4().hex[:12]}"
    source_relative = f"cad/source/{timestamp}-{stub}-{randint(1000, 9999)}.{extension}"
    source_storage_path = write_binary_asset(source_relative, content)

    warnings: list[str] = [TIANZHENG_UPLOAD_NOTE]
    usage_notes = [TIANZHENG_UPLOAD_NOTE]
    status = "failed"
    error_message: str | None = None
    converted_dxf_path: str | None = None
    payload: dict[str, Any] | None = None

    dxf_bytes: bytes | None = None
    dxf_source_name = file_name

    if extension == "dwg":
        conversion = convert_dwg_bytes(content, source_name=file_name)
        if conversion.ok and conversion.dxf_bytes is not None:
            dxf_bytes = conversion.dxf_bytes
            dxf_source_name = conversion.dxf_file_name or file_name.rsplit(".", 1)[0] + ".dxf"
            converted_relative = f"cad/converted/{timestamp}-{stub}-{randint(1000, 9999)}.dxf"
            converted_dxf_path = write_binary_asset(converted_relative, dxf_bytes)
            warnings.extend(conversion.warnings)
        else:
            if not converter_configured():
                usage_notes.append(DWG_CONVERTER_NOTE)
                warnings.append(DWG_CONVERTER_NOTE)
            status = "needs_conversion"
            error_message = conversion.error or "dwg_conversion_failed"
            warnings.extend(conversion.warnings)
    else:
        dxf_bytes = content

    if dxf_bytes is not None:
        try:
            parsed = parse_dxf_bytes(
                dxf_bytes,
                source_file_name=dxf_source_name,
                max_entities=settings.cad_max_entities,
            )
            payload = parsed.payload
            payload["source"]["file_name"] = file_name
            payload["source"]["format"] = extension
            payload["source"]["storage_path"] = resolve_storage_path(source_storage_path)
            payload["source"]["sha256"] = sha256
            payload["usage_notes"] = usage_notes
            if extension == "dwg":
                payload["conversion"] = {
                    "status": "ok",
                    "dxf_path": resolve_storage_path(converted_dxf_path) if converted_dxf_path else None,
                    "warnings": list(parsed.warnings),
                }
            else:
                payload["conversion"] = {
                    "status": "not_needed",
                    "dxf_path": resolve_storage_path(source_storage_path),
                    "warnings": list(parsed.warnings),
                }
            warnings.extend(parsed.warnings)
            floors = (payload.get("spaces") or {}).get("floors") or []
            preview_paths: list[str] = []
            for index, png in enumerate(parsed.floor_previews, start=1):
                preview_relative = f"cad/extracts/{public_id}-floor-{index}.png"
                write_binary_asset(preview_relative, png)
                preview_paths.append(resolve_storage_path(preview_relative))
            for index, mask in enumerate(parsed.floor_masks, start=1):
                write_binary_asset(f"cad/extracts/{public_id}-floor-{index}-mask.png", mask)
            for index, lines in enumerate(parsed.floor_lines, start=1):
                write_binary_asset(f"cad/extracts/{public_id}-floor-{index}-lines.png", lines)
            for floor_index, (floor, preview_path) in enumerate(zip(floors, preview_paths), start=1):
                floor["preview_path"] = preview_path
                floor["mask_file"] = f"cad/extracts/{public_id}-floor-{floor_index}-mask.png"
                floor["line_file"] = f"cad/extracts/{public_id}-floor-{floor_index}-lines.png"
                floor["line_path"] = resolve_storage_path(floor["line_file"])
            if preview_paths:
                payload.setdefault("artifacts", {})["floor_zone_previews"] = preview_paths
            status = "ok"
            error_message = None
        except ValueError as exc:
            status = "failed"
            error_message = str(exc)
            payload = {
                "source": {
                    "file_name": file_name,
                    "format": extension,
                    "storage_path": resolve_storage_path(source_storage_path),
                    "sha256": sha256,
                },
                "usage_notes": usage_notes,
                "error": error_message,
            }
    else:
        payload = {
            "source": {
                "file_name": file_name,
                "format": extension,
                "storage_path": resolve_storage_path(source_storage_path),
                "sha256": sha256,
            },
            "conversion": {
                "status": status,
                "dxf_path": None,
                "warnings": [item for item in warnings if item != TIANZHENG_UPLOAD_NOTE],
            },
            "usage_notes": usage_notes,
            "artifacts": {},
        }

    json_relative = f"cad/extracts/{public_id}.json"
    if payload is not None:
        write_binary_asset(json_relative, json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))

    record = CadExtract(
        public_id=public_id,
        user_id=user_id,
        file_name=file_name,
        source_format=extension,
        source_storage_path=source_storage_path,
        converted_dxf_path=converted_dxf_path,
        status=status,
        extract_json_path=json_relative if payload is not None else None,
        payload_json=payload or {},
        warnings_json=list(dict.fromkeys(warnings)),
        error_message=error_message,
        sha256=sha256,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return CadExtractBuildResult(record=record, payload=payload or {})
