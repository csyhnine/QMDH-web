"""Explicit CAD units outrank geometric hints; user calibration is authoritative."""
from __future__ import annotations

from copy import deepcopy
import math


def _declared_unit(msp) -> tuple[int | None, float | None, str]:
    try:
        raw = msp.doc.header.get("$INSUNITS", None)
        if raw is None or isinstance(raw, bool):
            return None, None, ""
        code = int(raw)
        if isinstance(raw, float) and raw != code:
            return None, None, ""
    except Exception:
        return None, None, ""
    named = {1: (0.0254, "英寸"), 4: (0.001, "毫米"), 5: (0.01, "厘米"), 6: (1.0, "米")}
    if code in named:
        scale, name = named[code]
        return code, scale, name
    if 1 <= code <= 24:
        from ezdxf.units import conversion_factor, unit_name
        try:
            scale = float(conversion_factor(code, 6))
            if math.isfinite(scale) and scale > 0:
                return code, scale, unit_name(code)
        except (ValueError, TypeError, OverflowError):
            pass
    return code, None, ""


def resolve_unit_scale(msp, span: float, *, decimeter_hint: bool = False) -> dict:
    span = float(span)
    if not math.isfinite(span) or span <= 0:
        raise ValueError("图纸跨度无效，无法确认尺度")
    code, declared, name = _declared_unit(msp)
    conflicts = []
    if declared is not None:
        scale, source = declared, "declared"
        implied = span * scale
        if not math.isfinite(implied) or not 3 <= implied <= 80:
            conflicts.append("declared_span_outside_reference")
        if decimeter_hint and not math.isclose(scale, 0.1, rel_tol=1e-12):
            conflicts.append("door_hint_conflicts_with_declaration")
        note = f"图纸单位是{name}，采用声明比例。"
        if conflicts:
            note += "尺寸或门洞线索与常见范围不一致；声明比例未改动，请核对单位并按已知长度标定。"
        requires = bool(conflicts)
    else:
        if decimeter_hint:
            scale, source, estimate = 0.1, "door_gap_estimate", "按门洞线索以 1 单位 = 100mm"
        elif span >= 2000:
            scale, source, estimate = 0.001, "span_estimate", "按毫米"
        elif span >= 80:
            scale, source, estimate = 0.1, "span_estimate", "按 1 单位 = 100mm"
        else:
            scale, source, estimate = 1.0, "span_estimate", "按米"
        reason = "图纸没有声明单位" if code in (None, 0) else f"图纸声明的单位代码 {code} 暂无法换算"
        note = f"{reason}，{estimate}估算。请先按已知长度标定确认。"
        requires = True
    return {"version": 1, "scope": "drawing_initial", "source": source,
            "header_insunits": code, "declared_meters_per_unit": declared,
            "meters_per_unit": scale, "span_drawing_units": span,
            "decimeter_hint": bool(decimeter_hint), "conflicts": conflicts,
            "requires_calibration": requires, "calibration_confirmed": False, "note": note}


def calibrated_unit_scale(floor: dict, meters_per_unit: float) -> dict:
    scale = float(meters_per_unit)
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError("标定后的单位比例必须为有限正数")
    previous = floor.get("unit_info")
    info = deepcopy(previous) if isinstance(previous, dict) else {}
    prior = (floor.get("geometry") or {}).get("meters_per_unit")
    info.setdefault("initial_source", info.get("source", "legacy_unknown"))
    info.setdefault("initial_meters_per_unit", info.get("meters_per_unit", prior))
    info.setdefault("initial_note", info.get("note"))
    info.setdefault("header_insunits", None)
    info.setdefault("declared_meters_per_unit", None)
    info.setdefault("conflicts", [])
    info.update(version=1, scope="floor", source="user_calibration", meters_per_unit=scale,
                requires_calibration=False, calibration_confirmed=True,
                note="本平面已按两点已知长度校准，面积随比例更新。")
    return info
