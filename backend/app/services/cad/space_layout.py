"""Split a drawing into floor plates and enclosed rooms for zoning."""

from __future__ import annotations

import math
from collections import deque
from io import BytesIO
from typing import Any, Iterable

from ezdxf.entities import DXFEntity, Insert
from PIL import Image, ImageDraw, ImageFilter

from app.services.cad.polygons import attach_room_polygons
from app.services.cad.unit_scale import resolve_unit_scale
from copy import deepcopy

_FUNCTION_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("卫生间", ("卫生间", "厕所", "盥洗", "wc")),
    ("电梯", ("电梯", "elevator")),
    ("楼梯", ("楼梯", "stair")),
)

_ROOM_COLORS = (
    (255, 99, 71),
    (255, 193, 7),
    (76, 175, 80),
    (33, 150, 243),
    (156, 39, 176),
    (255, 87, 34),
    (0, 188, 212),
    (233, 30, 99),
    (139, 195, 74),
    (121, 85, 72),
)


def _function_label(*names: str) -> str:
    blob = " ".join(name.lower() for name in names if name)
    for label, keywords in _FUNCTION_KEYWORDS:
        if any(keyword in blob for keyword in keywords):
            return label
    return ""


def _segments_of(entity: DXFEntity) -> list[tuple[float, float, float, float]]:
    dxftype = entity.dxftype()
    try:
        if dxftype == "LINE":
            start, end = entity.dxf.start, entity.dxf.end
            return [(float(start.x), float(start.y), float(end.x), float(end.y))]
        if dxftype == "LWPOLYLINE":
            points = [(float(x), float(y)) for x, y, *_rest in entity.get_points("xy")]
            segments = [
                (points[index][0], points[index][1], points[index + 1][0], points[index + 1][1])
                for index in range(len(points) - 1)
            ]
            if entity.closed and len(points) > 2:
                segments.append((points[-1][0], points[-1][1], points[0][0], points[0][1]))
            return segments
        if dxftype == "POLYLINE":
            fitted = entity.CURVE_FIT_VERTICES_ADDED | entity.SPLINE_FIT_VERTICES_ADDED
            if not entity.is_2d_polyline or entity.has_arc or entity.dxf.flags & fitted:
                return []
            ocs = entity.ocs()
            points = [ocs.to_wcs((v.dxf.location.x, v.dxf.location.y, entity.dxf.elevation.z)) for v in entity.vertices]
            points = [(float(point.x), float(point.y)) for point in points]
            segments = [
                (points[index][0], points[index][1], points[index + 1][0], points[index + 1][1])
                for index in range(len(points) - 1)
            ]
            if entity.is_closed and len(points) > 2:
                segments.append((points[-1][0], points[-1][1], points[0][0], points[0][1]))
            return segments
        if dxftype == "CIRCLE":
            center = entity.dxf.center
            radius = float(entity.dxf.radius)
            steps = 16
            points = []
            for step in range(steps + 1):
                angle = 2 * math.pi * step / steps
                points.append((float(center.x) + radius * math.cos(angle), float(center.y) + radius * math.sin(angle)))
            return [
                (points[index][0], points[index][1], points[index + 1][0], points[index + 1][1])
                for index in range(steps)
            ]
    except Exception:
        return []
    return []


def _closed_points(entity: DXFEntity) -> list[tuple[float, float]] | None:
    """Closed polyline vertices. CAD area is this polygon, not the pixels inside the stroke."""
    try:
        dxftype = entity.dxftype()
        if dxftype == "LWPOLYLINE" and entity.closed:
            points = [(float(x), float(y)) for x, y, *_rest in entity.get_points("xy")]
        elif dxftype == "POLYLINE" and bool(getattr(entity, "is_closed", False)):
            points = [(float(vertex.dxf.location.x), float(vertex.dxf.location.y)) for vertex in entity.vertices]
        else:
            return None
    except Exception:
        return None
    if len(points) < 3:
        return None
    return points


def _loop_metrics(points: list[tuple[float, float]]) -> tuple[float, float, float] | None:
    area2 = 0.0
    cx = 0.0
    cy = 0.0
    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[(index + 1) % len(points)]
        cross = x1 * y2 - x2 * y1
        area2 += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if abs(area2) < 1e-6:
        return None
    return abs(area2) * 0.5, cx / (3 * area2), cy / (3 * area2)


def _apply_boundary_areas(
    rooms: list[dict[str, Any]],
    meta: dict[str, Any],
    loops: list[list[tuple[float, float]]],
    meters_per_unit: float,
) -> None:
    """Prefer a closed polyline whose center sits in the room. Otherwise give back half the wall stroke."""
    unit = meters_per_unit ** 2
    pixel_area = float(meta.get("square_meters_per_pixel") or 0)
    by_slot = {int(room["room_slot"]): room for room in rooms}
    best: dict[int, tuple[float, float]] = {}
    for points in loops:
        metrics = _loop_metrics(points)
        if metrics is None:
            continue
        area_units, cx, cy = metrics
        slot = _point_room(meta, cx, cy)
        room = by_slot.get(slot)
        if room is None:
            continue
        pixel_m2 = float(room.get("area_m2") or 0)
        poly_m2 = area_units * unit
        if pixel_m2 <= 0 or poly_m2 < 1:
            continue
        ratio = poly_m2 / pixel_m2
        if not 0.7 <= ratio <= 1.45:
            continue
        previous = best.get(slot)
        if previous is None or abs(ratio - 1) < previous[0]:
            best[slot] = (abs(ratio - 1), poly_m2)
    for room in rooms:
        slot = int(room["room_slot"])
        if slot in best:
            room["area_m2"] = round(best[slot][1], 2)
            continue
        border = int(room.get("border_pixels") or 0)
        if border and pixel_area:
            room["area_m2"] = round(float(room.get("area_m2") or 0) + border * 0.5 * pixel_area, 2)


def _bbox(segments: Iterable[tuple[float, float, float, float]]) -> tuple[float, float, float, float] | None:
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    found = False
    for x1, y1, x2, y2 in segments:
        found = True
        min_x = min(min_x, x1, x2)
        min_y = min(min_y, y1, y2)
        max_x = max(max_x, x1, x2)
        max_y = max(max_y, y1, y2)
    if not found:
        return None
    return (min_x, min_y, max_x, max_y)


def _area(box: tuple[float, float, float, float]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _contains(box: tuple[float, float, float, float], x: float, y: float, *, pad_ratio: float = 0.04) -> bool:
    width = box[2] - box[0]
    height = box[3] - box[1]
    pad_x = width * pad_ratio
    pad_y = height * pad_ratio
    return (box[0] - pad_x) <= x <= (box[2] + pad_x) and (box[1] - pad_y) <= y <= (box[3] + pad_y)


_PRINCIPLES = (
    "开口：只补约 0.6–1.5 米、并且和墙在一条线上的缺口，用来关上房门。外墙缺口算入口；窗和柱只记录，不拿来切房间。",
    "楼梯：成组踏步围出的楼梯间不算房间，不涂进旁边的空间。",
    "洁污：卫生间算污区。它若只占房间一角，这间视为洁污还没隔开；贴着这间的房间算污侧，不作为主接待。这一层没有卫生间时，不判断洁污。",
    "动静：入口、楼梯、电梯、细长走廊，以及约 36㎡ 以上的大空间算动区；更小的封闭房间算静区。面积按图纸单位换算成平方米。",
    "层间：每层缩放到自己的外轮廓后，只比较楼梯、电梯、卫生间的相对位置。没有这些构件时，不编上下层方案。",
)


def _layout_hint(zoning: dict[str, str], *, kept: list[str]) -> str:
    role = zoning["role"]
    activity = zoning["activity"]
    hygiene = zoning["hygiene"]
    if role == "服务" and hygiene == "污":
        return "污区，服务用房。保持洁具，不要并进清洁的大空间。"
    if role == "交通" and activity == "动":
        return "动区，交通空间。保持贯通，不改成房间。"
    parts: list[str] = []
    if activity == "动":
        parts.append("动区")
    elif activity == "静":
        parts.append("静区")
    if hygiene == "污":
        parts.append("洁污还在同一空间里，布置时要先隔开")
    elif hygiene == "污侧":
        parts.append("贴着卫生间，属于污侧")
    elif hygiene == "洁":
        parts.append("不贴卫生间，属于洁侧")
    if kept:
        parts.insert(0, f"范围内保留{'、'.join(kept)}")
    if role == "主要" and activity == "动":
        parts.append("适合大厅、接待或开放办公")
    elif role == "主要" and activity == "静":
        parts.append("适合办公或会议")
    elif role == "辅助":
        parts.append("适合辅助、储藏或设备")
    return "。".join(parts) + ("。" if parts else "")


def _proposal(zoning: dict[str, str], function: str, *, entrance: bool, area_m2: float) -> str:
    if function in {"卫生间", "电梯", "楼梯"}:
        return function
    if zoning["role"] == "交通":
        return "交通"
    if zoning["hygiene"] == "污" and zoning["role"] == "主要":
        return "先隔卫生间，其余作接待"
    if zoning["hygiene"] == "污侧":
        return "卫生间配套"
    if entrance and zoning["activity"] == "动" and zoning["role"] != "辅助":
        return "门厅" if area_m2 < 36 else "接待或开放办公"
    if zoning["role"] == "主要" and zoning["activity"] == "动":
        return "接待或开放办公"
    if zoning["role"] == "主要" and zoning["activity"] == "静":
        return "办公或会议"
    return "辅助用房"


def _scheme_zh(rooms: list[dict[str, Any]]) -> str:
    names: list[str] = []
    for room in rooms:
        if float(room["area_ratio"]) < 0.005:
            continue
        name = str(room.get("proposal") or "")
        if name and name not in names:
            names.append(name)
    if not names:
        return "这一层还没有可布置的房间。"
    note = f"方案：{'、'.join(names)}。"
    if any(room.get("zoning", {}).get("hygiene") == "污" for room in rooms):
        note += "带卫生间的大空间要先隔开，再布置其余功能。"
    return note


def _is_corridor(area_ratio: float, aspect: float, compactness: float) -> bool:
    return 0.015 <= area_ratio <= 0.45 and aspect >= 3.2 and compactness >= 0.55


def _zoning_for_room(
    room: dict[str, Any],
    *,
    wet_slots: set[int],
    neighbor_slots: set[int],
    entrance: bool,
) -> dict[str, str]:
    function = str(room.get("function") or "")
    kept = list(room.get("kept_functions") or [])
    area_ratio = float(room["area_ratio"])
    area_m2 = float(room.get("area_m2") or 0)
    slot = int(room["room_slot"])
    wet = function == "卫生间" or "卫生间" in kept or slot in wet_slots
    beside_wet = (not wet) and bool(neighbor_slots & wet_slots)
    if function in {"电梯", "楼梯"} or _is_corridor(area_ratio, float(room.get("aspect") or 1), float(room.get("compactness") or 1)):
        role, activity = "交通", "动"
    elif function == "卫生间":
        role, activity = "服务", "中性"
    elif (entrance and area_m2 >= 6) or area_m2 >= 36:
        role, activity = "主要", "动"
    elif area_m2 >= 8:
        role, activity = "主要", "静"
    else:
        role, activity = "辅助", "静"
    if not wet_slots and function != "卫生间" and "卫生间" not in kept:
        hygiene = "中性"
    elif wet:
        hygiene = "污"
    elif beside_wet:
        hygiene = "污侧"
    elif area_m2 >= 8:
        hygiene = "洁"
    else:
        hygiene = "中性"
    return {"role": role, "activity": activity, "hygiene": hygiene}


def _kernel_size(width: int, height: int) -> int:
    """Seal pixel cracks only. Door gaps are closed in drawing units, not by thickening every wall."""
    limit = min(width, height)
    if limit % 2 == 0:
        limit -= 1
    if limit < 3:
        return 3
    return min(3, limit)


def _meters_per_unit(msp, span: float) -> tuple[float, str]:
    decision = resolve_unit_scale(msp, span)
    return decision["meters_per_unit"], decision["note"]


def _barrier_segments(
    segments: list[tuple[float, float, float, float]],
    meters_per_unit: float,
) -> list[tuple[float, float, float, float]]:
    minimum = 0.05 / meters_per_unit
    kept: list[tuple[float, float, float, float]] = []
    for x1, y1, x2, y2 in segments:
        if math.hypot(x2 - x1, y2 - y1) >= minimum:
            kept.append((x1, y1, x2, y2))
    return kept


def _close_door_gaps(
    segments: list[tuple[float, float, float, float]],
    meters_per_unit: float,
    *,
    min_meters: float,
    max_meters: float,
    min_segment_meters: float,
    max_offset_meters: float,
) -> list[tuple[float, float, float, float]]:
    """Bridge nearly parallel wall ends. Offset covers double-line walls whose ends do not sit on one line."""
    min_gap = min_meters / meters_per_unit
    max_gap = max_meters / meters_per_unit
    min_segment = min_segment_meters / meters_per_unit
    max_offset = max_offset_meters / meters_per_unit
    ends: list[tuple[float, float, float, float, float]] = []
    for x1, y1, x2, y2 in segments:
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < min_segment:
            continue
        ends.append((x1, y1, dx / length, dy / length, length))
        ends.append((x2, y2, dx / length, dy / length, length))
    bridges: list[tuple[float, float, float, float]] = []
    used: set[tuple[int, int]] = set()
    for index, (x, y, ux, uy, length) in enumerate(ends):
        best: tuple[float, int, float, float] | None = None
        for other, (u, v, vx, vy, other_length) in enumerate(ends):
            if index // 2 == other // 2:
                continue
            gx, gy = u - x, v - y
            along = abs(gx * ux + gy * uy)
            perp = abs(gx * -uy + gy * ux)
            if along < min_gap or along > max_gap or along > length or along > other_length or perp > max_offset:
                continue
            if abs(ux * vx + uy * vy) < 0.85 or abs(gx * vx + gy * vy) < along * 0.85:
                continue
            if best is None or along < best[0]:
                best = (along, other, u, v)
        if best is None:
            continue
        pair = tuple(sorted((index, best[1])))
        if pair in used:
            continue
        used.add(pair)
        bridges.append((x, y, best[2], best[3]))
    return bridges


def _decimeter_door_gaps(segments: list[tuple[float, float, float, float]]) -> bool:
    """Chinese drawings often keep the inch flag while 1 unit is 100mm. Door gaps then sit around 6–16 units."""
    ends: list[tuple[float, float, float, float, float]] = []
    for x1, y1, x2, y2 in segments:
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < 8:
            continue
        ends.append((x1, y1, dx / length, dy / length, length))
        ends.append((x2, y2, dx / length, dy / length, length))
    decimeter = 0
    inches = 0
    for index, (x, y, ux, uy, length) in enumerate(ends):
        for other, (u, v, vx, vy, other_length) in enumerate(ends):
            if other <= index or index // 2 == other // 2:
                continue
            distance = math.hypot(u - x, v - y)
            if distance < 4 or distance > 70 or distance > length or distance > other_length:
                continue
            gx, gy = (u - x) / distance, (v - y) / distance
            if abs(ux * gx + uy * gy) < 0.85 or abs(vx * gx + vy * gy) < 0.85 or abs(ux * vx + uy * vy) < 0.85:
                continue
            if 6 <= distance <= 16:
                decimeter += 1
            elif 24 <= distance <= 60:
                inches += 1
    return decimeter >= 8 and decimeter > inches * 1.5


def _stair_flight_boxes(
    segments: list[tuple[float, float, float, float]],
    meters_per_unit: float,
) -> list[tuple[float, float, float, float]]:
    """Compact runs of evenly spaced parallel treads. Window grids and loose line bundles are left out."""
    if meters_per_unit <= 0:
        return []
    min_len = 0.7 / meters_per_unit
    max_len = 3.6 / meters_per_unit
    min_gap = 0.20 / meters_per_unit
    max_gap = 0.38 / meters_per_unit
    candidates: list[tuple[float, float, float, float, float, float, float, float, float, float]] = []
    for x1, y1, x2, y2 in segments:
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy)
        if length < min_len or length > max_len:
            continue
        angle = math.atan2(dy, dx)
        if angle < 0:
            angle += math.pi
        candidates.append((angle, length, (x1 + x2) / 2, (y1 + y2) / 2, -dy / length, dx / length, x1, y1, x2, y2))
    buckets: dict[int, list[tuple[float, float, float, float, float, float, float, float, float, float]]] = {}
    for candidate in candidates:
        buckets.setdefault(round(candidate[0] / math.radians(8)), []).append(candidate)
    found: list[tuple[float, float, float, float]] = []
    for items in buckets.values():
        if len(items) < 6:
            continue
        normal_x, normal_y = items[0][4], items[0][5]
        items.sort(key=lambda item: item[2] * normal_x + item[3] * normal_y)
        used = [False] * len(items)
        for index, item in enumerate(items):
            if used[index]:
                continue
            group = [item]
            used[index] = True
            last = item[2] * normal_x + item[3] * normal_y
            last_length = item[1]
            for other in range(index + 1, len(items)):
                if used[other]:
                    continue
                projected = items[other][2] * normal_x + items[other][3] * normal_y
                gap = projected - last
                if gap < min_gap * 0.75:
                    continue
                if gap > max_gap:
                    break
                if abs(items[other][1] - last_length) / last_length > 0.35:
                    continue
                group.append(items[other])
                used[other] = True
                last = projected
                last_length = items[other][1]
            if len(group) < 6:
                continue
            xs = [value for tread in group for value in (tread[6], tread[8])]
            ys = [value for tread in group for value in (tread[7], tread[9])]
            box = (min(xs), min(ys), max(xs), max(ys))
            short, long = sorted(
                ((box[2] - box[0]) * meters_per_unit, (box[3] - box[1]) * meters_per_unit)
            )
            if short < 0.55 or long > 6.5 or short * long > 28 or long / max(short, 0.01) > 5:
                continue
            found.append(box)
    return found


def _box_samples(box: tuple[float, float, float, float]) -> list[tuple[float, float]]:
    x0, y0, x1, y1 = box
    samples: list[tuple[float, float]] = []
    for step_x in range(4):
        for step_y in range(4):
            samples.append((x0 + (x1 - x0) * (step_x + 0.5) / 4, y0 + (y1 - y0) * (step_y + 0.5) / 4))
    return samples


def _room_is_toilet(room: dict[str, Any]) -> bool:
    return room.get("function") == "卫生间" or "卫生间" in (room.get("kept_functions") or [])


def _punch_stair_box(meta: dict[str, Any], room: dict[str, Any], box: tuple[float, float, float, float]) -> None:
    width = int(meta["width"])
    height = int(meta["height"])
    room_of: list[int] = meta["room_of"]
    slot = int(room["room_slot"])
    scale = float(meta["scale"])
    min_x = float(meta["min_x"])
    max_y = float(meta["max_y"])

    def to_px(x: float, y: float) -> tuple[int, int]:
        return int((x - min_x) * scale + 4), int((max_y - y) * scale + 4)

    left, top = to_px(box[0], box[3])
    right, bottom = to_px(box[2], box[1])
    if left > right:
        left, right = right, left
    if top > bottom:
        top, bottom = bottom, top
    removed = 0
    for y in range(max(0, top), min(height, bottom + 1)):
        for x in range(max(0, left), min(width, right + 1)):
            index = y * width + x
            if room_of[index] == slot:
                room_of[index] = 0
                removed += 1
    if not removed:
        return
    room["pixel_count"] = max(0, int(room["pixel_count"]) - removed)
    room["area_m2"] = round(room["pixel_count"] * float(meta.get("square_meters_per_pixel") or 0), 2)


def _box_overlap_ratio(
    inner: tuple[float, float, float, float],
    outer: tuple[float, float, float, float],
) -> float:
    width = max(0.0, min(inner[2], outer[2]) - max(inner[0], outer[0]))
    height = max(0.0, min(inner[3], outer[3]) - max(inner[1], outer[1]))
    area = max(inner[2] - inner[0], 0.0) * max(inner[3] - inner[1], 0.0)
    if area <= 0:
        return 0.0
    return width * height / area


def _exclude_stairwells(
    rooms: list[dict[str, Any]],
    meta: dict[str, Any],
    boxes: list[tuple[float, float, float, float]],
) -> list[dict[str, Any]]:
    """Drop a small room that is a stairwell. Carve a tread run out of a large room instead of deleting the room."""
    if not boxes:
        return rooms
    drop: set[int] = set()
    for box in boxes:
        center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        containing = [
            room
            for room in rooms
            if room["bbox"][0] <= center[0] <= room["bbox"][2] and room["bbox"][1] <= center[1] <= room["bbox"][3]
        ]
        containing.sort(key=lambda room: float(room.get("area_m2") or 0))
        room = next((item for item in containing if not _room_is_toilet(item)), None)
        if room is None or _box_overlap_ratio(box, tuple(room["bbox"])) < 0.5:
            continue
        if float(room.get("area_m2") or 0) <= 22:
            drop.add(int(room["room_slot"]))
            continue
        hits = sum(1 for x, y in _box_samples(box) if _point_room(meta, x, y) == int(room["room_slot"]))
        if hits >= 6:
            _punch_stair_box(meta, room, box)
    return [
        room
        for room in rooms
        if int(room["room_slot"]) not in drop and int(room.get("pixel_count") or 0) >= 700
    ]


def _raster_rooms(
    segments: list[tuple[float, float, float, float]],
    box: tuple[float, float, float, float],
    *,
    meters_per_unit: float,
    bridges: list[tuple[float, float, float, float]],
    door_bridges: list[tuple[float, float, float, float]],
    window_points: list[tuple[float, float]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    min_x, min_y, max_x, max_y = box
    span_x = max(max_x - min_x, 1.0)
    span_y = max(max_y - min_y, 1.0)
    long_edge = 900
    scale = long_edge / max(span_x, span_y)
    width = max(int(span_x * scale) + 8, 16)
    height = max(int(span_y * scale) + 8, 16)
    wall = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(wall)

    def to_px(x: float, y: float) -> tuple[float, float]:
        return ((x - min_x) * scale + 4, (max_y - y) * scale + 4)

    for x1, y1, x2, y2 in [*segments, *bridges]:
        draw.line([to_px(x1, y1), to_px(x2, y2)], fill=255, width=2)

    thickened = wall.filter(ImageFilter.MaxFilter(_kernel_size(width, height)))
    pixels = thickened.load()
    exterior = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= width or y >= height:
            continue
        index = y * width + x
        if exterior[index] or pixels[x, y] > 40:
            continue
        exterior[index] = 1
        queue.append((x + 1, y))
        queue.append((x - 1, y))
        queue.append((x, y + 1))
        queue.append((x, y - 1))

    seen = bytearray(width * height)
    room_of = [0] * (width * height)
    rooms: list[dict[str, Any]] = []
    room_index = 0
    min_pixels = 700
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or exterior[index] or pixels[x, y] > 40:
                continue
            queue = deque([(x, y)])
            seen[index] = 1
            count = 0
            border = 0
            touches_exterior = False
            min_px_x = max_px_x = x
            min_px_y = max_px_y = y
            cells: list[int] = []
            while queue:
                cx, cy = queue.popleft()
                count += 1
                cells.append(cy * width + cx)
                min_px_x = min(min_px_x, cx)
                max_px_x = max(max_px_x, cx)
                min_px_y = min(min_px_y, cy)
                max_px_y = max(max_px_y, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    next_index = ny * width + nx
                    if exterior[next_index]:
                        touches_exterior = True
                        continue
                    if pixels[nx, ny] > 40:
                        border += 1
                        reach = max(4, int(0.6 / meters_per_unit * scale))
                        for step in range(2, reach + 1):
                            sx = cx + (nx - cx) * step
                            sy = cy + (ny - cy) * step
                            if sx < 0 or sy < 0 or sx >= width or sy >= height:
                                touches_exterior = True
                                break
                            far = sy * width + sx
                            if exterior[far]:
                                touches_exterior = True
                                break
                            if pixels[sx, sy] <= 40:
                                break
                        continue
                    if seen[next_index]:
                        continue
                    seen[next_index] = 1
                    queue.append((nx, ny))
            if count < min_pixels:
                continue
            room_index += 1
            for cell in cells:
                room_of[cell] = room_index
            pixel_width = max_px_x - min_px_x + 1
            pixel_height = max_px_y - min_px_y + 1
            aspect = max(pixel_width, pixel_height) / max(1, min(pixel_width, pixel_height))
            compactness = count / max(1, pixel_width * pixel_height)
            draw_min_x = min_x + (min_px_x - 4) / scale
            draw_max_x = min_x + (max_px_x - 4) / scale
            draw_max_y = max_y - (min_px_y - 4) / scale
            draw_min_y = max_y - (max_px_y - 4) / scale
            rooms.append(
                {
                    "pixel_count": count,
                    "border_pixels": border,
                    "room_slot": room_index,
                    "aspect": round(aspect, 2),
                    "compactness": round(compactness, 2),
                    "touches_exterior": touches_exterior,
                    "bbox": [
                        round(draw_min_x, 1),
                        round(draw_min_y, 1),
                        round(draw_max_x, 1),
                        round(draw_max_y, 1),
                    ],
                }
            )

    total_pixels = sum(room["pixel_count"] for room in rooms) or 1
    kernel = _kernel_size(width, height)
    neighbors = _room_neighbors(room_of, width, height, radius=kernel + 10)
    unit_area = (meters_per_unit / scale) ** 2
    entrance_slots = _entrance_slots(door_bridges, window_points, room_of, exterior, width, height, scale, min_x, max_y, meters_per_unit)
    for room in rooms:
        room["area_ratio"] = round(room["pixel_count"] / total_pixels, 3)
        room["area_m2"] = round(room["pixel_count"] * unit_area, 2)
        room["neighbor_slots"] = sorted(neighbors.get(int(room["room_slot"]), set()))
        room["entrance"] = int(room["room_slot"]) in entrance_slots

    meta = {
        "width": width,
        "height": height,
        "scale": scale,
        "min_x": min_x,
        "max_y": max_y,
        "room_of": room_of,
        "wall": wall,
        "square_meters_per_pixel": unit_area,
    }
    return rooms, meta


def _is_opening_pocket(room: dict[str, Any], meters_per_unit: float) -> bool:
    """A shallow space on the outside edge is a door or window recess, not a room."""
    if room.get("function") in {"卫生间", "电梯", "楼梯"}:
        return False
    box = room["bbox"]
    depth = min(abs(box[2] - box[0]), abs(box[3] - box[1])) * meters_per_unit
    if depth > 1.7 or not room.get("touches_exterior"):
        return False
    return True


def _line_png(wall: Image.Image) -> bytes:
    """Wall drawing on a transparent layer. Range edits never write this file."""
    width, height = wall.size
    lines = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    wall_pixels = wall.load()
    line_pixels = lines.load()
    for y in range(height):
        for x in range(width):
            if wall_pixels[x, y] > 80:
                line_pixels[x, y] = (255, 255, 255, 255)
    buffer = BytesIO()
    lines.save(buffer, format="PNG")
    return buffer.getvalue()


def _paint_preview(rooms: list[dict[str, Any]], meta: dict[str, Any]) -> tuple[bytes, bytes, bytes]:
    wall = meta["wall"]
    width, height = wall.size
    room_of = meta["room_of"]
    preview = Image.new("RGB", (width, height), (12, 12, 12))
    mask = Image.new("L", (width, height), 0)
    preview_pixels = preview.load()
    mask_pixels = mask.load()
    wall_pixels = wall.load()
    marker_by_slot = {int(room["room_slot"]): int(room.get("marker") or 0) for room in rooms}
    for index, room in enumerate(rooms):
        color = _ROOM_COLORS[index % len(_ROOM_COLORS)]
        slot = int(room["room_slot"])
        marker = marker_by_slot[slot]
        for cell, owner in enumerate(room_of):
            if owner == slot:
                preview_pixels[cell % width, cell // width] = color
                if marker:
                    mask_pixels[cell % width, cell // width] = marker
    for y in range(height):
        for x in range(width):
            if wall_pixels[x, y] > 80:
                preview_pixels[x, y] = (255, 255, 255)
    preview_buffer = BytesIO()
    mask_buffer = BytesIO()
    preview.save(preview_buffer, format="PNG")
    mask.save(mask_buffer, format="PNG")
    return preview_buffer.getvalue(), mask_buffer.getvalue(), _line_png(wall)


def _room_neighbors(room_of: list[int], width: int, height: int, radius: int) -> dict[int, set[int]]:
    neighbors: dict[int, set[int]] = {}
    for y in range(height):
        for x in range(width):
            slot = room_of[y * width + x]
            if not slot:
                continue
            if all(
                0 <= nx < width and 0 <= ny < height and room_of[ny * width + nx] == slot
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
            ):
                continue
            for dy in range(-radius, radius + 1):
                yy = y + dy
                if yy < 0 or yy >= height:
                    continue
                for dx in range(-radius, radius + 1):
                    xx = x + dx
                    if xx < 0 or xx >= width:
                        continue
                    other = room_of[yy * width + xx]
                    if other and other != slot:
                        neighbors.setdefault(slot, set()).add(other)
    return neighbors


def _entrance_slots(
    bridges: list[tuple[float, float, float, float]],
    window_points: list[tuple[float, float]],
    room_of: list[int],
    exterior: bytearray,
    width: int,
    height: int,
    scale: float,
    min_x: float,
    max_y: float,
    meters_per_unit: float,
) -> set[int]:
    window_reach = 0.8 / meters_per_unit
    slots: set[int] = set()

    def cell_slot(x: float, y: float) -> tuple[int, bool]:
        px = int((x - min_x) * scale + 4)
        py = int((max_y - y) * scale + 4)
        if px < 0 or py < 0 or px >= width or py >= height:
            return 0, True
        index = py * width + px
        return int(room_of[index]), bool(exterior[index])

    for x1, y1, x2, y2 in bridges:
        mid_x = (x1 + x2) / 2
        mid_y = (y1 + y2) / 2
        if any(math.hypot(mid_x - wx, mid_y - wy) <= window_reach for wx, wy in window_points):
            continue
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1.0
        step = 8 / scale
        px, py = -dy / length * step, dx / length * step
        left_slot, left_out = cell_slot(mid_x + px, mid_y + py)
        right_slot, right_out = cell_slot(mid_x - px, mid_y - py)
        if left_slot and right_out and not right_slot:
            slots.add(left_slot)
        elif right_slot and left_out and not left_slot:
            slots.add(right_slot)
    return slots


def _point_room(meta: dict[str, Any], x: float, y: float) -> int:
    px = int((x - meta["min_x"]) * meta["scale"] + 4)
    py = int((meta["max_y"] - y) * meta["scale"] + 4)
    width = meta["width"]
    height = meta["height"]
    if px < 0 or py < 0 or px >= width or py >= height:
        return 0
    return int(meta["room_of"][py * width + px])


def build_space_layout(msp) -> tuple[dict[str, Any], list[bytes], list[bytes], list[bytes]]:
    """Return floor structure, color previews, room masks, and wall-line overlays."""
    plates: list[dict[str, Any]] = []
    loose: list[tuple[float, float, float, float]] = []
    loops: list[list[tuple[float, float]]] = []
    anchors: list[dict[str, Any]] = []
    window_points: list[tuple[float, float]] = []
    column_points: list[tuple[float, float]] = []

    def _remember_constraint(layer_name: str, box: tuple[float, float, float, float]) -> None:
        blob = layer_name.lower()
        center = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
        if "window" in blob or "窗" in blob:
            window_points.append(center)
        if "column" in blob or "柱" in blob:
            column_points.append(center)

    for entity in msp:
        if isinstance(entity, Insert):
            segments: list[tuple[float, float, float, float]] = []
            try:
                virtual_entities = list(entity.virtual_entities())
            except Exception:
                virtual_entities = []
            for virtual in virtual_entities:
                segments.extend(_segments_of(virtual))
                loop = _closed_points(virtual)
                if loop:
                    loops.append(loop)
            box = _bbox(segments)
            if box is None:
                continue
            label = _function_label(str(entity.dxf.layer or ""), str(entity.dxf.name or ""))
            record = {"segments": segments, "bbox": box, "label": label, "layer": str(entity.dxf.layer or "")}
            _remember_constraint(record["layer"], box)
            for virtual in virtual_entities:
                virtual_box = _bbox(_segments_of(virtual))
                if virtual_box is not None:
                    _remember_constraint(str(virtual.dxf.layer or ""), virtual_box)
            if label and label != "":
                anchors.append(
                    {
                        "label": label,
                        "layer": record["layer"],
                        "bbox": [round(value, 1) for value in box],
                        "center": ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2),
                    }
                )
            plates.append(record)
            continue
        loose_box = _bbox(_segments_of(entity))
        loose.extend(_segments_of(entity))
        loop = _closed_points(entity)
        if loop:
            loops.append(loop)
        if loose_box is not None:
            _remember_constraint(str(getattr(entity.dxf, "layer", "") or ""), loose_box)

    if not plates and loose:
        box = _bbox(loose)
        if box is not None:
            plates.append({"segments": loose, "bbox": box, "label": "", "layer": ""})
            loose = []

    if not plates:
        return {"floors": [], "note": "没有可分开的平面。"}, [], [], []

    largest = max(_area(plate["bbox"]) for plate in plates)
    floors = []
    for plate in plates:
        center_x = (plate["bbox"][0] + plate["bbox"][2]) / 2
        center_y = (plate["bbox"][1] + plate["bbox"][3]) / 2
        inside_larger = any(
            other is not plate
            and _area(other["bbox"]) > _area(plate["bbox"]) * 1.4
            and _contains(other["bbox"], center_x, center_y, pad_ratio=0.0)
            for other in plates
        )
        if inside_larger or _area(plate["bbox"]) < largest * 0.08:
            continue
        floors.append(plate)

    if not floors:
        floors = [max(plates, key=lambda plate: _area(plate["bbox"]))]

    floors.sort(key=lambda plate: (plate["bbox"][0], -plate["bbox"][3]))
    span = max(max(plate["bbox"][2] - plate["bbox"][0], plate["bbox"][3] - plate["bbox"][1]) for plate in floors)
    sample: list[tuple[float, float, float, float]] = []
    for plate in floors:
        sample.extend(plate["segments"])
    unit_info = resolve_unit_scale(msp, span, decimeter_hint=_decimeter_door_gaps(sample))
    meters_per_unit, unit_note = unit_info["meters_per_unit"], unit_info["note"]
    payload_floors: list[dict[str, Any]] = []
    previews: list[bytes] = []
    masks: list[bytes] = []
    line_layers: list[bytes] = []

    for index, plate in enumerate(floors, start=1):
        segments = list(plate["segments"])
        for x1, y1, x2, y2 in loose:
            if _contains(plate["bbox"], (x1 + x2) / 2, (y1 + y2) / 2):
                segments.append((x1, y1, x2, y2))
        box = _bbox(segments) or plate["bbox"]
        barriers = _barrier_segments(segments, meters_per_unit)
        seams = _close_door_gaps(
            barriers,
            meters_per_unit,
            min_meters=0.02,
            max_meters=0.4,
            min_segment_meters=0.2,
            max_offset_meters=0.08,
        )
        bridges = _close_door_gaps(
            barriers,
            meters_per_unit,
            min_meters=0.6,
            max_meters=1.5,
            min_segment_meters=0.45,
            max_offset_meters=0.4,
        )
        floor_windows = [point for point in window_points if _contains(box, point[0], point[1], pad_ratio=0.02)]
        floor_columns = [point for point in column_points if _contains(box, point[0], point[1], pad_ratio=0.02)]
        rooms, meta = _raster_rooms(
            barriers,
            box,
            meters_per_unit=meters_per_unit,
            bridges=[*seams, *bridges],
            door_bridges=bridges,
            window_points=floor_windows,
        )
        floor_loops = []
        for points in loops:
            metrics = _loop_metrics(points)
            if metrics is not None and _contains(box, metrics[1], metrics[2], pad_ratio=0.0):
                floor_loops.append(points)
        _apply_boundary_areas(rooms, meta, floor_loops, meters_per_unit)
        floor_anchors = []
        for anchor in anchors:
            cx, cy = anchor["center"]
            if not _contains(box, cx, cy, pad_ratio=0.02):
                continue
            slot = _point_room(meta, cx, cy)
            floor_anchors.append({"label": anchor["label"], "bbox": anchor["bbox"], "room_slot": slot})
            anchor_area = max(0.0, anchor["bbox"][2] - anchor["bbox"][0]) * max(0.0, anchor["bbox"][3] - anchor["bbox"][1])
            for room in rooms:
                if room["room_slot"] != slot or room.get("function"):
                    continue
                room_box = room["bbox"]
                room_area = max(1.0, (room_box[2] - room_box[0]) * (room_box[3] - room_box[1]))
                if anchor_area / room_area >= 0.35:
                    room["function"] = anchor["label"]
                    room["function_source"] = "layer"
                else:
                    room["kept_functions"] = list(dict.fromkeys([*(room.get("kept_functions") or []), anchor["label"]]))

        rooms = _exclude_stairwells(rooms, meta, _stair_flight_boxes(barriers, meters_per_unit))
        rooms = [room for room in rooms if not _is_opening_pocket(room, meters_per_unit)]
        kept_pixels = sum(room["pixel_count"] for room in rooms) or 1
        for room in rooms:
            room["area_ratio"] = round(room["pixel_count"] / kept_pixels, 3)
        wet_slots = {
            int(room["room_slot"])
            for room in rooms
            if room.get("function") == "卫生间"
            or ("卫生间" in (room.get("kept_functions") or []) and float(room.get("area_m2") or 0) <= 20)
        }
        slot_to_id: dict[int, str] = {}
        ordered = sorted(rooms, key=lambda item: item["pixel_count"], reverse=True)
        for room_number, room in enumerate(ordered, start=1):
            color = _ROOM_COLORS[(room_number - 1) % len(_ROOM_COLORS)]
            room_box = room["bbox"]
            center_x = (room_box[0] + room_box[2]) / 2
            center_y = (room_box[1] + room_box[3]) / 2
            room["marker"] = str(room_number)
            room["swatch"] = f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"
            room["marker_x"] = round(((center_x - meta["min_x"]) * meta["scale"] + 4) / meta["width"], 4)
            room["marker_y"] = round(((meta["max_y"] - center_y) * meta["scale"] + 4) / meta["height"], 4)
            slot_to_id[int(room["room_slot"])] = f"f{index}_r{room_number}"
        preview, mask, lines = _paint_preview(ordered, meta)
        public_rooms = []
        for room in ordered:
            function = room.get("function") or ""
            kept = list(room.get("kept_functions") or [])
            neighbor_slots = {int(item) for item in room.get("neighbor_slots") or []}
            entrance = bool(room.get("entrance"))
            zoning = _zoning_for_room(room, wet_slots=wet_slots, neighbor_slots=neighbor_slots, entrance=entrance)
            proposal = _proposal(zoning, function, entrance=entrance, area_m2=float(room.get("area_m2") or 0))
            public_rooms.append(
                {
                    "room_id": slot_to_id[int(room["room_slot"])],
                    "bbox": room["bbox"],
                    "area_ratio": float(room["area_ratio"]),
                    "area_m2": float(room.get("area_m2") or 0),
                    "marker": room.get("marker") or "",
                    "swatch": room.get("swatch") or "",
                    "marker_x": room.get("marker_x"),
                    "marker_y": room.get("marker_y"),
                    "entrance": entrance,
                    "function": function,
                    "proposal": proposal,
                    "function_source": room.get("function_source") or "unassigned",
                    "zoning": zoning,
                    "adjacent_room_ids": [slot_to_id[item] for item in sorted(neighbor_slots) if item in slot_to_id],
                    "layout_hint": _layout_hint(zoning, kept=kept),
                }
            )
        frame = {
            "min_x": float(meta["min_x"]),
            "max_y": float(meta["max_y"]),
            "scale": float(meta["scale"]),
            "meters_per_unit": float(meters_per_unit),
        }
        mask_image = Image.open(BytesIO(mask)).convert("L")
        lines_image = Image.open(BytesIO(lines)).convert("L")
        floor_record = {
            "floor_index": index,
            "label": f"平面 {index}",
            "bbox": [round(value, 1) for value in box],
            "geometry": frame,
            "unit_info": {**deepcopy(unit_info), "scope": "floor"},
            "scale_note": unit_note,
            "anchors": [{key: value for key, value in anchor.items() if key != "room_slot"} for anchor in floor_anchors],
            "scheme_zh": _scheme_zh(public_rooms),
            "constraints": {
                "entrances": sum(1 for room in public_rooms if room.get("entrance")),
                "doors_closed": len(bridges),
                "windows": len(floor_windows),
                "columns": len(floor_columns),
            },
            "square_meters_per_pixel": float(meta.get("square_meters_per_pixel") or 0),
            "rooms": public_rooms,
        }
        attach_room_polygons(public_rooms, mask_image, floor_record, lines_image)
        payload_floors.append(floor_record)
        previews.append(preview)
        masks.append(mask)
        line_layers.append(lines)

    existing = []
    for floor in payload_floors:
        for anchor in floor["anchors"]:
            if anchor["label"] not in existing:
                existing.append(anchor["label"])
        for room in floor["rooms"]:
            if room["function"] and room["function"] not in existing:
                existing.append(room["function"])
    if existing:
        note = f"按图上位置拆成 {len(payload_floors)} 个平面，已有功能：{'、'.join(existing)}。其余房间待分区。"
    else:
        note = f"按图上位置拆成 {len(payload_floors)} 个平面。房间已圈出，功能待定。"
    return {
        "floors": payload_floors,
        "note": note,
        "relations_zh": _relations_zh(payload_floors),
        "principles": list(_PRINCIPLES),
        "unit_note": unit_note,
        "unit_info": deepcopy(unit_info),
    }, previews, masks, line_layers


def _anchor_norm(floor_box: list[float], anchor_box: list[float]) -> tuple[float, float]:
    width = max(floor_box[2] - floor_box[0], 1.0)
    height = max(floor_box[3] - floor_box[1], 1.0)
    center_x = (anchor_box[0] + anchor_box[2]) / 2
    center_y = (anchor_box[1] + anchor_box[3]) / 2
    return ((center_x - floor_box[0]) / width, (center_y - floor_box[1]) / height)


def _relations_zh(floors: list[dict[str, Any]]) -> str:
    if len(floors) < 2:
        return "只有一个平面，没有层间对应。"
    cores: list[dict[str, Any]] = []
    for floor in floors:
        for anchor in floor.get("anchors") or []:
            if anchor.get("label") not in {"楼梯", "电梯", "卫生间"}:
                continue
            nx, ny = _anchor_norm(floor["bbox"], anchor["bbox"])
            cores.append({"floor": floor["label"], "label": anchor["label"], "nx": nx, "ny": ny})
    if not cores:
        return f"{len(floors)} 个平面各自圈房间。没有识别到楼梯、电梯或卫生间，所以没有建立上下层联系。"
    matched: list[str] = []
    used: set[int] = set()
    for index, left in enumerate(cores):
        for other_index, right in enumerate(cores):
            if other_index <= index or left["label"] != right["label"] or left["floor"] == right["floor"]:
                continue
            distance = math.hypot(left["nx"] - right["nx"], left["ny"] - right["ny"])
            if distance <= 0.22:
                matched.append(left["label"])
                used.add(index)
                used.add(other_index)
    unmatched = [core["label"] for index, core in enumerate(cores) if index not in used]
    parts: list[str] = []
    if matched:
        names = "、".join(dict.fromkeys(matched))
        parts.append(f"{names}在各层外轮廓里的相对位置接近，视为上下对应")
    if unmatched:
        names = "、".join(dict.fromkeys(unmatched))
        parts.append(f"{names}没有在另一层找到接近的位置，这项不建立层间关系")
    return "。".join(parts) + "。"
