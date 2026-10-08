"""Read DXF content into structured CAD extract payload."""

from __future__ import annotations

import os
import tempfile
from collections import Counter, defaultdict
from io import StringIO
from dataclasses import dataclass
from typing import Any, Iterable

import ezdxf
from ezdxf import bbox as ezdxf_bbox
from ezdxf.entities import DXFEntity, Insert

from app.services.cad.constants import GEOMETRY_ENTITY_TYPES, TEXT_ENTITY_TYPES
from app.services.cad.layer_classifier import classify_layer_name
from app.services.cad.space_layout import build_space_layout
from app.services.cad.text_extractor import bucket_text_label, build_semantics, normalize_label_text


@dataclass(frozen=True)
class DxfExtractResult:
    payload: dict[str, Any]
    warnings: tuple[str, ...]
    floor_previews: tuple[bytes, ...] = ()
    floor_masks: tuple[bytes, ...] = ()
    floor_lines: tuple[bytes, ...] = ()


def _iter_layout_entities(layout, *, max_entities: int) -> Iterable[DXFEntity]:
    count = 0
    for entity in layout:
        dxftype = entity.dxftype()
        if dxftype == "INSERT" and isinstance(entity, Insert):
            try:
                for virtual in entity.virtual_entities():
                    if count >= max_entities:
                        return
                    yield virtual
                    count += 1
            except Exception:
                if count >= max_entities:
                    return
                yield entity
                count += 1
            continue
        if count >= max_entities:
            return
        yield entity
        count += 1


def _entity_text(entity: DXFEntity) -> str:
    dxftype = entity.dxftype()
    if dxftype == "TEXT":
        return str(getattr(entity.dxf, "text", "") or "")
    if dxftype == "MTEXT":
        try:
            return entity.plain_text()
        except Exception:
            return str(getattr(entity.dxf, "text", "") or "")
    return ""


def _insunits_label(value: int | None) -> str:
    mapping = {
        0: "unitless",
        1: "inches",
        2: "feet",
        3: "miles",
        4: "millimeters",
        5: "centimeters",
        6: "meters",
        7: "kilometers",
    }
    if value is None:
        return "unknown"
    return mapping.get(int(value), "unknown")


def _load_dxf_document(content: bytes, warnings: list[str]):
    try:
        text = content.decode("utf-8")
        if text.lstrip().startswith("0"):
            return ezdxf.read(StringIO(text))
    except Exception:
        pass

    from ezdxf import recover

    fd, path = tempfile.mkstemp(suffix=".dxf")
    try:
        os.write(fd, content)
        os.close(fd)
        try:
            return ezdxf.readfile(path)
        except Exception:
            doc, auditor = recover.readfile(path)
            if auditor.has_errors:
                warnings.append("dxf_recover_used")
            return doc
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


def parse_dxf_bytes(content: bytes, *, source_file_name: str, max_entities: int) -> DxfExtractResult:
    warnings: list[str] = []
    try:
        doc = _load_dxf_document(content, warnings)
    except Exception as exc:
        raise ValueError("invalid_dxf") from exc

    msp = doc.modelspace()
    layer_entity_types: dict[str, Counter[str]] = defaultdict(Counter)
    block_insert_counts: Counter[str] = Counter()
    texts_by_bucket: dict[str, list[str]] = {
        "room_labels": [],
        "dimensions": [],
        "misc": [],
    }
    entity_total = 0
    truncated = False

    for entity in _iter_layout_entities(msp, max_entities=max_entities + 1):
        if entity_total >= max_entities:
            truncated = True
            break
        entity_total += 1
        layer_name = str(getattr(entity.dxf, "layer", "0") or "0")
        dxftype = entity.dxftype()
        layer_entity_types[layer_name][dxftype] += 1
        if dxftype == "INSERT":
            block_insert_counts[str(getattr(entity.dxf, "name", "") or "")] += 1
        if dxftype in TEXT_ENTITY_TYPES:
            raw_text = _entity_text(entity)
            cleaned = normalize_label_text(raw_text)
            if not cleaned:
                continue
            bucket = bucket_text_label(cleaned)
            texts_by_bucket[bucket].append(cleaned)

    if truncated:
        warnings.append(f"entity_limit_reached:{max_entities}")

    layers: list[dict[str, Any]] = []
    geometry_index_by_role: dict[str, dict[str, Any]] = defaultdict(lambda: {"entity_count": 0, "layer_names": []})
    for layer_name in sorted(layer_entity_types):
        type_counts = dict(layer_entity_types[layer_name])
        entity_count = sum(type_counts.values())
        role, confidence = classify_layer_name(layer_name)
        layers.append(
            {
                "name": layer_name,
                "entity_count": entity_count,
                "entity_types": type_counts,
                "role": role,
                "role_source": "rules",
                "confidence": confidence,
            }
        )
        geometry_index_by_role[role]["entity_count"] += sum(
            count for dxftype, count in type_counts.items() if dxftype in GEOMETRY_ENTITY_TYPES
        )
        if layer_name not in geometry_index_by_role[role]["layer_names"]:
            geometry_index_by_role[role]["layer_names"].append(layer_name)

    for bucket in texts_by_bucket:
        deduped: list[str] = []
        seen: set[str] = set()
        for item in texts_by_bucket[bucket]:
            if item in seen:
                continue
            seen.add(item)
            deduped.append(item)
        texts_by_bucket[bucket] = deduped

    semantics = build_semantics(texts_by_bucket["room_labels"])
    try:
        spaces, floor_previews, floor_masks, floor_lines = build_space_layout(msp)
    except Exception:
        spaces, floor_previews, floor_masks, floor_lines = {"floors": [], "note": ""}, [], [], []
        warnings.append("space_layout_failed")
    if not semantics["space_summary_zh"] and spaces.get("note"):
        semantics["space_summary_zh"] = spaces["note"]

    extents = None
    try:
        ext = ezdxf_bbox.extents(msp)
        if ext.has_data:
            extents = {
                "min_x": round(float(ext.extmin.x), 4),
                "min_y": round(float(ext.extmin.y), 4),
                "max_x": round(float(ext.extmax.x), 4),
                "max_y": round(float(ext.extmax.y), 4),
            }
    except Exception:
        warnings.append("bbox_unavailable")

    blocks = [
        {"name": name, "insert_count": count}
        for name, count in sorted(block_insert_counts.items())
        if name
    ]

    payload = {
        "source": {
            "file_name": source_file_name,
            "format": "dxf",
        },
        "conversion": {
            "status": "not_needed",
            "dxf_path": None,
            "warnings": [],
        },
        "meta": {
            "dxf_version": doc.dxfversion,
            "units": _insunits_label(doc.header.get("$INSUNITS")),
            "model_extents": extents,
            "entity_total": entity_total,
            "layout_names": [layout.name for layout in doc.layouts],
        },
        "layers": layers,
        "blocks": blocks,
        "texts": texts_by_bucket,
        "semantics": semantics,
        "spaces": spaces,
        "geometry_index": {
            "bbox": (
                [extents["min_x"], extents["min_y"], extents["max_x"], extents["max_y"]]
                if extents
                else None
            ),
            "by_role": dict(geometry_index_by_role),
        },
        "artifacts": {},
        "usage_notes": [],
    }
    return DxfExtractResult(
        payload=payload,
        warnings=tuple(warnings),
        floor_previews=tuple(floor_previews),
        floor_masks=tuple(floor_masks),
        floor_lines=tuple(floor_lines),
    )
