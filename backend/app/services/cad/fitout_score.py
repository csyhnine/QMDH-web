"""Score one furniture layout. Lower loss is better.

Overlap, leaving the room, and hitting a column, door swing, or stair are a
gate: past 2% the scheme fails and the loss jumps by 100. Passed schemes are
compared on whether the required groups are present, whether furniture is
spread across the room, and whether the occupied share sits in a band.
Reception wants about 15%–35% of the floor covered.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Any

from PIL import Image

from app.services.cad.fitout import _GROUP_BY_LABEL, _layout_kind, _line_grid, _meters_per_pixel, _px, _room_grid

WEIGHTS = {
    "groups": 40.0,
    "coverage": 30.0,
    "density": 28.0,
    "planting": 14.0,
    "toilet": 18.0,
    "meeting_center": 12.0,
}

HARD_LIMIT = 0.02
HARD_PENALTY = 100.0

TERM_LABELS = {
    "overlap": "家具互相重叠",
    "bounds": "家具越出房间",
    "obstacle": "撞到柱、门扇或楼梯",
    "groups": "该有的组团不全",
    "coverage": "家具挤在一侧",
    "density": "家具密度不在区间里",
    "planting": "缺少绿植配景",
    "toilet": "卫生间布置不全",
    "meeting_center": "会议桌不在空出的中间",
}

_DENSITY_BANDS = {
    "reception": (0.15, 0.35),
    "office": (0.18, 0.45),
    "meeting": (0.12, 0.30),
    "reading": (0.15, 0.40),
    "activity": (0.10, 0.30),
    "cafe": (0.15, 0.40),
}

def _required_groups(kind: str, area: float) -> set[str]:
    if kind == "reception":
        return {"接待台", "洽谈", "绿化"}
    if kind == "office":
        groups = {"工位", "绿化"}
        if area >= 32:
            groups.add("讨论")
        return groups
    if kind == "meeting":
        return {"会议", "绿化"}
    if kind == "reading":
        return {"书架", "阅览", "绿化"}
    if kind == "activity":
        return {"休息", "绿化"}
    if kind == "cafe":
        return {"备餐", "茶座"}
    return set()


def _piece_group(item: dict[str, Any]) -> str:
    named = str(item.get("group") or "")
    if named:
        return named
    label = str(item.get("label") or "")
    if "厕" in label or label in {"小便池", "洗手", "洗手池"}:
        return "洁具"
    return _GROUP_BY_LABEL.get(label, "")


def _density_degree(kind: str, occupied_m2: float, area: float) -> float | None:
    band = _DENSITY_BANDS.get(kind)
    if band is None or area <= 0:
        return None
    low, high = band
    ratio = occupied_m2 / area
    if ratio < low:
        return min(1.0, (low - ratio) / low)
    if ratio > high:
        return min(1.0, (ratio - high) / max(high, 0.01))
    return 0.0


def _coverage_degree(grid: list[bytearray], claims: list[bytearray]) -> float | None:
    height = len(grid)
    width = len(grid[0]) if grid else 0
    xs = [x for y, row in enumerate(grid) for x, value in enumerate(row) if value]
    ys = [y for y, row in enumerate(grid) if any(row)]
    if not xs or not ys:
        return None
    x0, x1 = min(xs), max(xs) + 1
    y0, y1 = min(ys), max(ys) + 1
    missing = total = 0
    for gy in range(2):
        for gx in range(2):
            xa = x0 + (x1 - x0) * gx // 2
            xb = x0 + (x1 - x0) * (gx + 1) // 2
            ya = y0 + (y1 - y0) * gy // 2
            yb = y0 + (y1 - y0) * (gy + 1) // 2
            cells = 0
            hit = False
            for y in range(ya, yb):
                row = grid[y]
                claim = claims[y]
                for x in range(xa, xb):
                    if not row[x]:
                        continue
                    cells += 1
                    if claim[x]:
                        hit = True
            if cells < 15:
                continue
            total += 1
            if not hit:
                missing += 1
    if total < 2:
        return None
    return missing / total


def _toilet_degree(room: dict[str, Any], items: list[dict[str, Any]]) -> float | None:
    if _layout_kind(room) != "toilet":
        return None
    name = str(room.get("proposal") or room.get("function") or "")
    labels = [str(item.get("label") or "") for item in items]

    def has(token: str) -> bool:
        return any(token in label for label in labels)

    if "男女" in name:
        checks = [
            has("女厕位"),
            has("男厕位"),
            has("小便池") and not any(label.startswith("女") and "小便" in label for label in labels),
            has("女洗手"),
            has("男洗手"),
        ]
    else:
        checks = [has("厕位"), has("洗手")]
    return sum(1 for ok in checks if not ok) / len(checks)


def _covered(cx: float, cy: float, rw: float, rh: float, angle: float, width: int, height: int) -> list[tuple[int, int]]:
    hw = rw / 2
    hh = rh / 2
    cos = math.cos(angle)
    sin = math.sin(angle)
    corners = []
    for sx in (-hw, hw):
        for sy in (-hh, hh):
            corners.append((cx + sx * cos - sy * sin, cy + sx * sin + sy * cos))
    min_x = max(0, int(min(point[0] for point in corners)) - 1)
    max_x = min(width - 1, int(max(point[0] for point in corners)) + 1)
    min_y = max(0, int(min(point[1] for point in corners)) - 1)
    max_y = min(height - 1, int(max(point[1] for point in corners)) + 1)
    pixels: list[tuple[int, int]] = []
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            dx = x - cx
            dy = y - cy
            if abs(dx * cos + dy * sin) <= hw and abs(-dx * sin + dy * cos) <= hh:
                pixels.append((x, y))
    return pixels


def _outside_distance(grid: list[bytearray]) -> list[list[int]]:
    height = len(grid)
    width = len(grid[0]) if grid else 0
    distance = [[-1] * width for _ in range(height)]
    pending: deque[tuple[int, int]] = deque()
    for y, row in enumerate(grid):
        for x, value in enumerate(row):
            if not value:
                continue
            edge = x == 0 or y == 0 or x == width - 1 or y == height - 1
            if not edge:
                edge = not grid[y][x - 1] or not grid[y][x + 1] or not grid[y - 1][x] or not grid[y + 1][x]
            if edge:
                distance[y][x] = 0
                pending.append((x, y))
    while pending:
        x, y = pending.popleft()
        next_distance = distance[y][x] + 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            if not grid[ny][nx] or distance[ny][nx] >= 0:
                continue
            distance[ny][nx] = next_distance
            pending.append((nx, ny))
    return distance


def score_floor_layout(
    floor: dict[str, Any],
    mask: Image.Image,
    lines: Image.Image | None,
    furniture: list[dict[str, Any]],
) -> dict[str, Any]:
    meters_per_pixel = _meters_per_pixel(floor)
    width, height = mask.size
    mask_l = mask.convert("L")
    line_grid = _line_grid(lines.convert("RGBA") if lines is not None else None, width, height)
    rooms = [room for room in (floor.get("rooms") or []) if int(room.get("marker") or 0) > 0
             and (not floor.get("preparation") or room.get("layout_kind"))]
    grids = {str(room.get("room_id") or ""): _room_grid(mask_l, int(room.get("marker") or 0)) for room in rooms}
    distances = {room_id: _outside_distance(grid) for room_id, grid in grids.items()}
    interior = {
        room_id: _px(0.4, meters_per_pixel, minimum=3)
        for room_id in grids
    }

    claims = [bytearray(width) for _ in range(height)]
    own: list[tuple[dict[str, Any], list[tuple[int, int]]]] = []
    total_pixels = 0
    overlap_pixels = 0
    bound_pixels = 0
    obstacle_pixels = 0
    for item in furniture:
        room_id = str(item.get("room_id") or "")
        grid = grids.get(room_id)
        if grid is None:
            continue
        angle = math.radians(float(item.get("angle") or 0))
        cx = float(item["x"]) * width
        cy = float(item["y"]) * height
        rw = float(item["w"]) * width
        rh = float(item["h"]) * height
        pixels = _covered(cx, cy, rw, rh, angle, width, height)
        if not pixels:
            continue
        own.append((item, pixels))
        total_pixels += len(pixels)
        room_distance = distances[room_id]
        depth = interior[room_id]
        for x, y in pixels:
            inside = bool(grid[y][x])
            if not inside:
                bound_pixels += 1
                continue
            if claims[y][x]:
                overlap_pixels += 1
            claims[y][x] = 1
            if line_grid is not None and line_grid[y][x] and room_distance[y][x] > depth:
                obstacle_pixels += 1

    meeting_offsets: list[float] = []
    for item, _pixels in own:
        if str(item.get("kind") or "") != "table" or str(item.get("label") or "") != "会议桌":
            continue
        room_id = str(item.get("room_id") or "")
        grid = grids[room_id]
        cx = float(item["x"]) * width
        cy = float(item["y"]) * height
        count = sum_x = sum_y = 0.0
        for y, row in enumerate(grid):
            for x, value in enumerate(row):
                if not value:
                    continue
                sum_x += x
                sum_y += y
                count += 1
        if count:
            diagonal = math.hypot(width, height)
            meeting_offsets.append(min(1.0, math.hypot(cx - sum_x / count, cy - sum_y / count) / max(1.0, diagonal * 0.28)))

    by_room: dict[str, list[dict[str, Any]]] = {}
    for item, _pixels in own:
        by_room.setdefault(str(item.get("room_id") or ""), []).append(item)
    occupied_pixels = {room_id: 0 for room_id in grids}
    for room_id, grid in grids.items():
        count = 0
        for y, row in enumerate(grid):
            claim = claims[y]
            for x, value in enumerate(row):
                if value and claim[x]:
                    count += 1
        occupied_pixels[room_id] = count
    cell_m2 = meters_per_pixel * meters_per_pixel
    group_ratios: list[float] = []
    coverage_ratios: list[float] = []
    density_ratios: list[float] = []
    planting_ratios: list[float] = []
    toilet_ratios: list[float] = []
    green_kinds = {"plant", "planter", "tree"}
    from app.services.cad.preparation import reserved_route_mask
    route_pixels = reserved_route_mask(floor, mask.size).load()
    for room in rooms:
        area = float(room.get("area_m2") or 0)
        room_id = str(room.get("room_id") or "")
        kind = _layout_kind(room)
        items = by_room.get(room_id, [])
        toilet_degree = _toilet_degree(room, items)
        if toilet_degree is not None:
            toilet_ratios.append(toilet_degree)
        if kind in {"toilet", "storage", "empty"}:
            continue
        if area >= 16:
            greens = [item for item in items if str(item.get("kind") or "") in green_kinds]
            featured = any(str(item.get("kind") or "") in {"tree", "planter"} for item in greens)
            if not greens:
                planting_ratios.append(1.0)
            elif area >= 36 and (len(greens) < 2 or not featured):
                planting_ratios.append(0.6)
            else:
                planting_ratios.append(0.0)
        if area >= 20:
            expected = _required_groups(kind, area)
            if expected:
                present = {_piece_group(item) for item in items}
                missing = sum(1 for name in expected if name not in present)
                group_ratios.append(missing / len(expected))
            grid = grids.get(room_id)
            if grid is not None:
                available = [bytearray(value and not route_pixels[x, y] for x, value in enumerate(row)) for y, row in enumerate(grid)]
                covered = _coverage_degree(available, claims)
                if covered is not None:
                    coverage_ratios.append(covered)
            # Reserved circulation is intentional empty space, not missing furniture.
            route_area = sum(1 for y, row in enumerate(grid or []) for x, value in enumerate(row) if value and route_pixels[x, y]) * cell_m2
            density = _density_degree(kind, occupied_pixels.get(room_id, 0) * cell_m2, max(0, area - route_area))
            if density is not None:
                density_ratios.append(density)

    def ratio(part: int, whole: int) -> float:
        if whole <= 0:
            return 0.0
        return min(1.0, part / whole)

    terms = {
        "overlap": ratio(overlap_pixels, total_pixels),
        "bounds": ratio(bound_pixels, total_pixels),
        "obstacle": ratio(obstacle_pixels, total_pixels),
        "groups": sum(group_ratios) / len(group_ratios) if group_ratios else 0.0,
        "coverage": sum(coverage_ratios) / len(coverage_ratios) if coverage_ratios else 0.0,
        "density": sum(density_ratios) / len(density_ratios) if density_ratios else 0.0,
        "planting": sum(planting_ratios) / len(planting_ratios) if planting_ratios else 0.0,
        "toilet": sum(toilet_ratios) / len(toilet_ratios) if toilet_ratios else 0.0,
        "meeting_center": sum(meeting_offsets) / len(meeting_offsets) if meeting_offsets else 0.0,
    }
    soft_loss = sum(WEIGHTS[name] * terms[name] for name in WEIGHTS)
    hard = [name for name in ("overlap", "bounds", "obstacle") if terms[name] > HARD_LIMIT]
    loss = round(soft_loss + (HARD_PENALTY if hard else 0.0), 2)
    soft_ranked = sorted(WEIGHTS, key=lambda name: WEIGHTS[name] * terms[name], reverse=True)
    worst = hard[0] if hard else next((name for name in soft_ranked if terms[name] > 0.02), "")
    return {
        "loss": loss,
        "passed": not hard,
        "hard": hard,
        "worst": worst,
        "worst_label": TERM_LABELS.get(worst, ""),
        "terms": {name: round(value, 4) for name, value in terms.items()},
        "labels": TERM_LABELS,
    }
