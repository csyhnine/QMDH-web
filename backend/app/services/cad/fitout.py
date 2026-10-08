"""Place partition walls and furniture inside rooms that are already zoned."""

from __future__ import annotations

import copy
import math
from collections import deque
from io import BytesIO
from typing import Any

from PIL import Image, ImageFilter

from app.services.cad.furniture_catalog import spec
from app.services.cad.room_edit import _measure, _preview_relative, _rewrite_preview
from app.services.cad.space_layout import _ROOM_COLORS
from app.services.media_storage import read_binary_asset, write_binary_asset


def _room_name(room: dict[str, Any]) -> str:
    return str(room.get("proposal") or room.get("function") or "").strip()


def _layout_kind(room: dict[str, Any]) -> str:
    name = _room_name(room)
    area = float(room.get("area_m2") or 0)
    activity = str((room.get("zoning") or {}).get("activity") or "")
    if "卫生" in name:
        return "toilet"
    if "咖啡" in name or "茶座" in name:
        return "cafe"
    if any(token in name for token in ("阅览", "图书", "学习")):
        return "reading"
    if any(token in name for token in ("运动", "文体", "舞蹈", "活动")):
        return "activity"
    if "会议" in name:
        return "meeting"
    if "接待" in name and "办公" not in name:
        return "reception"
    if "办公" in name:
        return "office"
    if area < 8:
        return "storage"
    if activity == "静":
        return "office"
    if activity == "动":
        return "activity"
    return "storage"


def _meters_per_pixel(floor: dict[str, Any]) -> float:
    area = float(floor.get("square_meters_per_pixel") or 0)
    if area <= 0:
        return 0.05
    return math.sqrt(area)


def _wall_pixel(pixel: Any) -> bool:
    if not pixel:
        return False
    channels = tuple(pixel)
    if len(channels) >= 4:
        red, green, blue, alpha = channels[:4]
        return alpha > 80 and red > 180 and green > 180 and blue > 180
    if len(channels) >= 3:
        red, green, blue = channels[:3]
        return red > 180 and green > 180 and blue > 180
    return False


def _room_grid(mask: Image.Image, marker: int) -> list[bytearray]:
    width, height = mask.size
    pixels = mask.load()
    grid = [bytearray(width) for _ in range(height)]
    for y in range(height):
        row = grid[y]
        for x in range(width):
            if int(pixels[x, y]) == marker:
                row[x] = 1
    return grid


def _px(meters: float, meters_per_pixel: float, minimum: int = 3) -> int:
    return max(minimum, int(round(meters / meters_per_pixel)))


def _copy_grid(grid: list[bytearray]) -> list[bytearray]:
    return [bytearray(row) for row in grid]


def _count_cells(grid: list[bytearray]) -> int:
    return sum(int(value) for row in grid for value in row)


def _erode(grid: list[bytearray], margin: int) -> list[bytearray]:
    if margin <= 0 or not grid:
        return _copy_grid(grid)
    height = len(grid)
    width = len(grid[0])
    image = Image.new("L", (width, height), 0)
    pixels = image.load()
    for y, row in enumerate(grid):
        for x, value in enumerate(row):
            if value:
                pixels[x, y] = 255
    image = image.filter(ImageFilter.MinFilter(margin * 2 + 1))
    pixels = image.load()
    eroded = [bytearray(width) for _ in range(height)]
    for y in range(height):
        row = eroded[y]
        for x in range(width):
            if pixels[x, y]:
                row[x] = 1
    return eroded


_NEIGHBORS = (
    (1, 0),
    (1, 1),
    (0, 1),
    (-1, 1),
    (-1, 0),
    (-1, -1),
    (0, -1),
    (1, -1),
)


def _trace_contour(grid: list[bytearray]) -> list[tuple[float, float]]:
    """Walk the outer pixels of a filled room, starting at the top-left occupied cell."""
    height = len(grid)
    width = len(grid[0]) if grid else 0
    start: tuple[int, int] | None = None
    for y in range(height):
        row = grid[y]
        for x in range(width):
            if row[x]:
                start = (x, y)
                break
        if start is not None:
            break
    if start is None:
        return []
    sx, sy = start
    contour: list[tuple[float, float]] = [(float(sx), float(sy))]
    px, py = sx - 1, sy
    cx, cy = sx, sy
    for _ in range(max(32, width * height)):
        dx = px - cx
        dy = py - cy
        try:
            came = _NEIGHBORS.index((dx, dy))
        except ValueError:
            came = 4
        found: tuple[int, int, int] | None = None
        for step in range(1, 9):
            direction = (came + step) % 8
            nx = cx + _NEIGHBORS[direction][0]
            ny = cy + _NEIGHBORS[direction][1]
            if 0 <= nx < width and 0 <= ny < height and grid[ny][nx]:
                found = (nx, ny, direction)
                break
        if found is None:
            break
        nx, ny, direction = found
        prev = (direction - 1) % 8
        px = cx + _NEIGHBORS[prev][0]
        py = cy + _NEIGHBORS[prev][1]
        cx, cy = nx, ny
        if (cx, cy) == (sx, sy):
            break
        contour.append((float(cx), float(cy)))
    if len(contour) > 2:
        contour.append(contour[0])
    return contour


def _point_line_distance(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    px, py = point
    ax, ay = start
    bx, by = end
    dx = bx - ax
    dy = by - ay
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return math.hypot(px - ax, py - ay)
    return abs((px - ax) * dy - (py - ay) * dx) / length


def _simplify(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    start = points[0]
    end = points[-1]
    farthest = 0.0
    index = 0
    for cursor, point in enumerate(points[1:-1], start=1):
        distance = _point_line_distance(point, start, end)
        if distance > farthest:
            farthest = distance
            index = cursor
    if farthest <= epsilon or index == 0:
        return [start, end]
    left = _simplify(points[: index + 1], epsilon)
    right = _simplify(points[index:], epsilon)
    return left[:-1] + right


def _cell(grid: list[bytearray], x: float, y: float) -> bool:
    height = len(grid)
    width = len(grid[0]) if grid else 0
    ix = int(round(x))
    iy = int(round(y))
    return 0 <= ix < width and 0 <= iy < height and bool(grid[iy][ix])


def _wall_runs(grid: list[bytearray], meters_per_pixel: float) -> list[dict[str, float]]:
    """Straight wall pieces. Each run's normal points into the room, and angle follows that wall."""
    epsilon = max(2.5, 0.45 / meters_per_pixel)
    contour = _trace_contour(grid)
    if len(contour) < 4:
        return []
    simple = _simplify(contour, epsilon)
    runs: list[dict[str, float]] = []
    minimum = max(8.0, 0.9 / meters_per_pixel)
    for start, end in zip(simple, simple[1:]):
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        length = math.hypot(dx, dy)
        if length < minimum:
            continue
        tx = dx / length
        ty = dy / length
        nx = -ty
        ny = tx
        mid_x = (start[0] + end[0]) / 2
        mid_y = (start[1] + end[1]) / 2
        facing = 0
        for scale in (0.2, 0.45, 0.75):
            probe = max(2.0, scale / meters_per_pixel)
            if _cell(grid, mid_x + nx * probe, mid_y + ny * probe):
                facing = 1
                break
            if _cell(grid, mid_x - nx * probe, mid_y - ny * probe):
                facing = -1
                break
        if facing == 0:
            continue
        if facing < 0:
            tx, ty = -tx, -ty
            nx, ny = -nx, -ny
            start, end = end, start
        runs.append(
            {
                "ax": start[0],
                "ay": start[1],
                "tx": tx,
                "ty": ty,
                "nx": nx,
                "ny": ny,
                "length": length,
                "angle": math.atan2(ty, tx),
            }
        )
    runs.sort(key=lambda item: item["length"], reverse=True)
    return runs


def _to_image(lx: float, ly: float, cx: float, cy: float, angle: float) -> tuple[float, float]:
    cos = math.cos(angle)
    sin = math.sin(angle)
    return cx + lx * cos - ly * sin, cy + lx * sin + ly * cos


def _rect_samples(cx: float, cy: float, rw: float, rh: float, angle: float) -> list[tuple[float, float]]:
    samples: list[tuple[float, float]] = []
    for fx in (-0.48, 0.0, 0.48):
        for fy in (-0.48, 0.0, 0.48):
            samples.append(_to_image(fx * rw, fy * rh, cx, cy, angle))
    return samples


def _inside(grid: list[bytearray], points: list[tuple[float, float]]) -> bool:
    height = len(grid)
    width = len(grid[0]) if grid else 0
    for x, y in points:
        ix = int(x)
        iy = int(y)
        if ix < 0 or iy < 0 or ix >= width or iy >= height or not grid[iy][ix]:
            return False
    return True


def _stamp(grid: list[bytearray], cx: float, cy: float, rw: float, rh: float, angle: float) -> None:
    hw = rw / 2
    hh = rh / 2
    corners = [_to_image(sx, sy, cx, cy, angle) for sx in (-hw, hw) for sy in (-hh, hh)]
    height = len(grid)
    width = len(grid[0]) if grid else 0
    min_x = max(0, int(min(point[0] for point in corners)) - 1)
    max_x = min(width - 1, int(max(point[0] for point in corners)) + 1)
    min_y = max(0, int(min(point[1] for point in corners)) - 1)
    max_y = min(height - 1, int(max(point[1] for point in corners)) + 1)
    cos = math.cos(angle)
    sin = math.sin(angle)
    for y in range(min_y, max_y + 1):
        row = grid[y]
        for x in range(min_x, max_x + 1):
            dx = x - cx
            dy = y - cy
            if abs(dx * cos + dy * sin) <= hw and abs(-dx * sin + dy * cos) <= hh:
                row[x] = 0


def _item(
    room_id: str,
    kind: str,
    label: str,
    center: tuple[float, float],
    size: tuple[float, float],
    angle: float,
    width: int,
    height: int,
    index: int,
) -> dict[str, Any]:
    return {
        "id": f"{room_id}-{kind}-{index}",
        "room_id": room_id,
        "kind": kind,
        "label": label,
        "x": round(center[0] / width, 4),
        "y": round(center[1] / height, 4),
        "w": round(size[0] / width, 4),
        "h": round(size[1] / height, 4),
        "angle": round(math.degrees(angle), 1),
    }


def _line_grid(lines: Image.Image | None, width: int, height: int) -> list[bytearray] | None:
    if lines is None:
        return None
    image = lines.convert("RGBA")
    if image.size != (width, height):
        image = image.resize((width, height))
    source = image.load()
    grid = [bytearray(width) for _ in range(height)]
    for y in range(height):
        row = grid[y]
        for x in range(width):
            if _wall_pixel(source[x, y]):
                row[x] = 1
    return grid


def _apply_obstacles(
    room: list[bytearray],
    lines: list[bytearray] | None,
    meters_per_pixel: float,
) -> list[bytearray]:
    """Keep a strip inside the wall, and block columns, stairs and door swings."""
    placeable = _erode(room, max(1, _px(0.08, meters_per_pixel, minimum=1)))
    if lines is None or _count_cells(placeable) < 20:
        return placeable
    height = len(room)
    width = len(room[0]) if room else 0
    # The wall stroke itself sits a few centimetres inside the mask. Blocking it
    # pushes every desk off the wall. Only lines farther in are swings or columns.
    inner = _erode(room, _px(0.25, meters_per_pixel, minimum=2))
    thin = Image.new("L", (width, height), 0)
    thin_pixels = thin.load()
    for y in range(height):
        room_row = room[y]
        line_row = lines[y]
        inner_row = inner[y]
        for x in range(width):
            if room_row[x] and line_row[x] and inner_row[x]:
                thin_pixels[x, y] = 255
    pad = _px(0.08, meters_per_pixel, minimum=1)
    thin = thin.filter(ImageFilter.MaxFilter(pad * 2 + 1))
    deep = _erode(room, _px(0.55, meters_per_pixel, minimum=4))
    columns = Image.new("L", (width, height), 0)
    column_pixels = columns.load()
    for y in range(height):
        line_row = lines[y]
        deep_row = deep[y]
        for x in range(width):
            if line_row[x] and deep_row[x]:
                column_pixels[x, y] = 255
    close = _px(0.42, meters_per_pixel, minimum=3)
    columns = columns.filter(ImageFilter.MaxFilter(close * 2 + 1)).filter(ImageFilter.MinFilter(close * 2 + 1))
    margin = _px(0.2, meters_per_pixel, minimum=2)
    columns = columns.filter(ImageFilter.MaxFilter(margin * 2 + 1))
    thin_pixels = thin.load()
    column_pixels = columns.load()
    for y in range(height):
        row = placeable[y]
        for x in range(width):
            if thin_pixels[x, y] or column_pixels[x, y]:
                row[x] = 0
    if _count_cells(placeable) < 20:
        return _erode(room, 1)
    return placeable


def _fits(grid: list[bytearray], cx: float, cy: float, along: float, depth: float, angle: float) -> bool:
    return _inside(grid, _rect_samples(cx, cy, along, depth, angle))


def _lay_along(
    pieces: list[dict[str, Any]],
    room_id: str,
    kind: str,
    label: str,
    runs: list[dict[str, float]],
    along_m: float,
    depth_m: float,
    gap_m: float,
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    limit: int,
    *,
    per_wall: int | None = None,
    inset_m: float = 0.16,
    end_m: float = 0.5,
) -> None:
    if limit <= 0 or not runs:
        return
    along = float(_px(along_m, meters_per_pixel))
    depth = float(_px(depth_m, meters_per_pixel))
    gap = float(_px(gap_m, meters_per_pixel, minimum=1))
    inset = depth / 2 + float(_px(inset_m, meters_per_pixel, minimum=1))
    end = float(_px(end_m, meters_per_pixel, minimum=2))
    by_wall: list[list[tuple[float, float, float]]] = []
    for run in runs:
        length = float(run["length"])
        stop = length - end - along / 2
        if stop < end + along / 2:
            continue
        search = max(float(_px(0.3, meters_per_pixel, minimum=2)), along * 0.35)
        cap = per_wall if per_wall is not None else 99
        angle = float(run["angle"])
        spots: list[tuple[float, float, float]] = []
        dist = end + along / 2
        last: float | None = None
        while dist <= stop + 0.01 and len(spots) < cap:
            cx = float(run["ax"]) + float(run["tx"]) * dist + float(run["nx"]) * inset
            cy = float(run["ay"]) + float(run["ty"]) * dist + float(run["ny"]) * inset
            if _fits(grid, cx, cy, along, depth, angle) and (last is None or dist - last >= along + gap - 1):
                spots.append((cx, cy, angle))
                last = dist
                dist += along + gap
                continue
            dist += search
        if spots:
            by_wall.append(spots)
    pending = [list(spots) for spots in by_wall]
    budget = limit
    while budget > 0 and any(pending):
        progressed = False
        for spots in pending:
            if budget <= 0 or not spots:
                continue
            cx, cy, angle = spots.pop(0)
            if not _fits(grid, cx, cy, along, depth, angle):
                continue
            pieces.append(_item(room_id, kind, label, (cx, cy), (along, depth), angle, width, height, len(pieces) + 1))
            _stamp(grid, cx, cy, along, depth, angle)
            budget -= 1
            progressed = True
        if not progressed:
            break


def _centroid(grid: list[bytearray]) -> tuple[float, float]:
    count = 0
    sum_x = sum_y = 0.0
    height = len(grid)
    width = len(grid[0]) if grid else 0
    step = 2 if width * height > 250_000 else 1
    for y in range(0, height, step):
        row = grid[y]
        for x in range(0, width, step):
            if not row[x]:
                continue
            sum_x += x
            sum_y += y
            count += 1
    if count < 1:
        return width / 2, height / 2
    return sum_x / count, sum_y / count


def _face_angle(dx: float, dy: float) -> float:
    length = math.hypot(dx, dy)
    if length < 1e-6:
        return 0.0
    return math.atan2(-dx / length, dy / length)


def _lay_meeting(
    pieces: list[dict[str, Any]],
    room_id: str,
    runs: list[dict[str, float]],
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
) -> None:
    angle = float(runs[0]["angle"]) if runs else 0.0
    cx, cy = _centroid(grid)
    tx = math.cos(angle)
    ty = math.sin(angle)
    nx = -ty
    ny = tx
    step = float(_px(0.9, meters_per_pixel, minimum=2))
    offsets = [(0.0, 0.0), (step, 0.0), (-step, 0.0), (0.0, step), (0.0, -step), (step, step), (-step, step)]
    table: tuple[float, float] | None = None
    along = depth = 0.0
    for along_m, depth_m in ((3.0, 1.3), (2.4, 1.1), (1.8, 0.9)):
        along = float(_px(along_m, meters_per_pixel))
        depth = float(_px(depth_m, meters_per_pixel))
        for ox, oy in offsets:
            candidate = (cx + tx * ox + nx * oy, cy + ty * ox + ny * oy)
            if _fits(grid, candidate[0], candidate[1], along, depth, angle):
                table = candidate
                break
        if table is not None:
            break
    if table is None:
        return
    pieces.append(_item(room_id, "table", "会议桌", table, (along, depth), angle, width, height, len(pieces) + 1))
    _stamp(grid, table[0], table[1], along, depth, angle)
    chair = float(_px(0.5, meters_per_pixel))
    gap = float(_px(0.15, meters_per_pixel, minimum=1))
    side = depth / 2 + gap + chair / 2
    end = along / 2 + gap + chair / 2
    seats = [(lx, side) for lx in (-along * 0.32, 0.0, along * 0.32)]
    seats += [(lx, -side) for lx in (-along * 0.32, 0.0, along * 0.32)]
    seats += [(end, 0.0), (-end, 0.0)]
    for lx, ly in seats:
        pos = _to_image(lx, ly, table[0], table[1], angle)
        if not _fits(grid, pos[0], pos[1], chair, chair, angle):
            continue
        face = _face_angle(table[0] - pos[0], table[1] - pos[1])
        pieces.append(_item(room_id, "chair", "会议椅", pos, (chair, chair), face, width, height, len(pieces) + 1))
        _stamp(grid, pos[0], pos[1], chair, chair, face)


def _clear_openings(
    placeable: list[bytearray],
    room: list[bytearray],
    lines: list[bytearray] | None,
    meters_per_pixel: float,
) -> list[bytearray]:
    """Keep a walkway inside each door-sized gap in the wall drawing."""
    if lines is None or not room:
        return placeable
    contour = _trace_contour(room)
    if len(contour) < 8:
        return placeable
    height = len(room)
    width = len(room[0]) if room else 0
    radius = _px(0.16, meters_per_pixel, minimum=1)
    open_flags: list[bool] = []
    for x, y in contour:
        ix = int(round(x))
        iy = int(round(y))
        solid = False
        for oy in range(-radius, radius + 1):
            yy = iy + oy
            if yy < 0 or yy >= height:
                continue
            row = lines[yy]
            for ox in range(-radius, radius + 1):
                xx = ix + ox
                if 0 <= xx < width and row[xx]:
                    solid = True
                    break
            if solid:
                break
        open_flags.append(not solid)
    if sum(open_flags) / len(open_flags) > 0.45:
        return placeable
    start = 0
    if open_flags[0] and open_flags[-1]:
        for index, flag in enumerate(open_flags):
            if not flag:
                start = (index + 1) % len(open_flags)
                break
    flags = open_flags[start:] + open_flags[:start]
    points = contour[start:] + contour[:start]
    spans: list[list[tuple[float, float]]] = []
    cursor = 0
    count = len(flags)
    while cursor < count:
        if not flags[cursor]:
            cursor += 1
            continue
        end = cursor
        while end < count and flags[end]:
            end += 1
        spans.append(points[cursor:end])
        cursor = end
    min_span = 0.55 / meters_per_pixel
    max_span = 2.3 / meters_per_pixel
    depth = float(_px(1.6, meters_per_pixel))
    pad = float(_px(0.45, meters_per_pixel, minimum=1))
    for span in spans:
        if len(span) < 2:
            continue
        ax, ay = span[0]
        bx, by = span[-1]
        dx = bx - ax
        dy = by - ay
        length = math.hypot(dx, dy)
        if length < min_span or length > max_span:
            continue
        tx = dx / length
        ty = dy / length
        nx = -ty
        ny = tx
        mid_x = (ax + bx) / 2
        mid_y = (ay + by) / 2
        probe = max(3.0, 0.4 / meters_per_pixel)
        if not _cell(room, mid_x + nx * probe, mid_y + ny * probe):
            nx, ny = -nx, -ny
        steps_along = int(length + pad * 2) + 2
        steps_in = int(depth) + 2
        for along_index in range(steps_along):
            along = -pad + (length + pad * 2) * along_index / max(1, steps_along - 1)
            for inward_index in range(steps_in):
                inward = depth * inward_index / max(1, steps_in - 1)
                x = int(ax + tx * along + nx * inward)
                y = int(ay + ty * along + ny * inward)
                if 0 <= x < width and 0 <= y < height:
                    placeable[y][x] = 0
    return placeable


def _lay_one(
    pieces: list[dict[str, Any]],
    room_id: str,
    kind: str,
    label: str,
    runs: list[dict[str, float]],
    along_choices: tuple[float, ...],
    depth_m: float,
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
) -> int | None:
    """Place one counter, stepping in from a wall when drawn lines already occupy it."""
    for index, run in enumerate(runs[:4]):
        for along_m in along_choices:
            for inset_m in (0.16, 0.7, 1.35):
                before = len(pieces)
                _lay_along(
                    pieces, room_id, kind, label, [run], along_m, depth_m, 0.25,
                    grid, meters_per_pixel, width, height, 1, per_wall=1,
                    inset_m=inset_m, end_m=0.35,
                )
                if len(pieces) > before:
                    return index
    return None


def _block_in_front(
    grid: list[bytearray],
    item: dict[str, Any],
    clearance_m: float,
    meters_per_pixel: float,
    width: int,
    height: int,
) -> None:
    """Keep the guest side of a counter clear so seats are not in the service line."""
    angle = math.radians(float(item.get("angle") or 0))
    cx = float(item["x"]) * width
    cy = float(item["y"]) * height
    rw = float(item["w"]) * width
    rh = float(item["h"]) * height
    fx, fy = -math.sin(angle), math.cos(angle)
    reach = float(_px(clearance_m, meters_per_pixel, minimum=2))
    _stamp(grid, cx + fx * (rh / 2 + reach / 2), cy + fy * (rh / 2 + reach / 2), max(rw, reach), reach, angle)


def _lay_island(
    pieces: list[dict[str, Any]],
    room_id: str,
    kind: str,
    label: str,
    runs: list[dict[str, float]],
    along_m: float,
    depth_m: float,
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    limit: int,
    *,
    spread_m: float = 2.4,
) -> None:
    if limit <= 0 or not runs:
        return
    angle = float(runs[0]["angle"])
    along = float(_px(along_m, meters_per_pixel))
    depth = float(_px(depth_m, meters_per_pixel))
    cx, cy = _centroid(grid)
    tx = math.cos(angle)
    ty = math.sin(angle)
    nx = -ty
    ny = tx
    spread = float(_px(spread_m, meters_per_pixel, minimum=2))
    offsets = ((0.0, 0.0), (spread, 0.0), (-spread, 0.0), (0.0, spread), (0.0, -spread), (spread, spread))
    placed = 0
    for ox, oy in offsets:
        if placed >= limit:
            break
        center = (cx + tx * ox + nx * oy, cy + ty * ox + ny * oy)
        if not _fits(grid, center[0], center[1], along, depth, angle):
            continue
        pieces.append(_item(room_id, kind, label, center, (along, depth), angle, width, height, len(pieces) + 1))
        _stamp(grid, center[0], center[1], along, depth, angle)
        placed += 1


def _chairs_around(
    pieces: list[dict[str, Any]],
    room_id: str,
    label: str,
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
) -> None:
    tables = [item for item in pieces if item["room_id"] == room_id and item["label"] == label]
    chair = float(_px(0.45, meters_per_pixel))
    gap = float(_px(0.12, meters_per_pixel, minimum=1))
    for table in tables:
        angle = math.radians(float(table.get("angle") or 0))
        cx = float(table["x"]) * width
        cy = float(table["y"]) * height
        along = float(table["w"]) * width
        depth = float(table["h"]) * height
        side = depth / 2 + gap + chair / 2
        for ly, face_sign in ((side, -1.0), (-side, 1.0)):
            pos = _to_image(0.0, ly, cx, cy, angle)
            if not _fits(grid, pos[0], pos[1], chair, chair, angle):
                continue
            face = angle if face_sign < 0 else angle + math.pi
            pieces.append(_item(room_id, "chair", "座椅", pos, (chair, chair), face, width, height, len(pieces) + 1))
            _stamp(grid, pos[0], pos[1], chair, chair, face)


def _lay_grid(
    pieces: list[dict[str, Any]],
    room_id: str,
    kind: str,
    label: str,
    runs: list[dict[str, float]],
    along_m: float,
    depth_m: float,
    gap_m: float,
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    limit: int,
) -> None:
    """Fill the open part of the room with a grid parallel to the longest wall."""
    if limit <= 0 or not runs:
        return
    angle = float(runs[0]["angle"])
    cos = math.cos(angle)
    sin = math.sin(angle)
    min_x = min_y = 10**9
    max_x = max_y = -10**9
    step = 2 if len(grid) * (len(grid[0]) if grid else 0) > 250_000 else 1
    for y in range(0, len(grid), step):
        row = grid[y]
        for x in range(0, len(row), step):
            if not row[x]:
                continue
            lx = x * cos + y * sin
            ly = -x * sin + y * cos
            min_x = min(min_x, lx)
            max_x = max(max_x, lx)
            min_y = min(min_y, ly)
            max_y = max(max_y, ly)
    if max_x <= min_x or max_y <= min_y:
        return
    along = float(_px(along_m, meters_per_pixel))
    depth = float(_px(depth_m, meters_per_pixel))
    gap = float(_px(gap_m, meters_per_pixel, minimum=1))
    margin = float(_px(0.7, meters_per_pixel, minimum=2))
    span_x = max_x - min_x - margin * 2
    span_y = max_y - min_y - margin * 2
    cols = int((span_x + gap) / (along + gap)) if along + gap else 0
    rows = int((span_y + gap) / (depth + gap)) if depth + gap else 0
    cols = max(0, min(cols, 8))
    rows = max(0, min(rows, 6))
    if cols < 1 or rows < 1:
        return
    block_w = cols * along + (cols - 1) * gap
    block_h = rows * depth + (rows - 1) * gap
    origin_x = (min_x + max_x) / 2 - block_w / 2 + along / 2
    origin_y = (min_y + max_y) / 2 - block_h / 2 + depth / 2
    spots: list[tuple[float, float]] = []
    for row_index in range(rows):
        for col_index in range(cols):
            lx = origin_x + col_index * (along + gap)
            ly = origin_y + row_index * (depth + gap)
            center = _to_image(lx, ly, 0, 0, angle)
            if _fits(grid, center[0], center[1], along, depth, angle):
                spots.append(center)
    if len(spots) > limit:
        picked = [spots[int(index * (len(spots) - 1) / max(1, limit - 1))] for index in range(limit)]
        spots = picked
    for center in spots:
        if not _fits(grid, center[0], center[1], along, depth, angle):
            continue
        pieces.append(_item(room_id, kind, label, center, (along, depth), angle, width, height, len(pieces) + 1))
        _stamp(grid, center[0], center[1], along, depth, angle)


def _clear_swings(
    placeable: list[bytearray],
    room: list[bytearray],
    lines: list[bytearray] | None,
    meters_per_pixel: float,
) -> list[bytearray]:
    """A door drawn as a swing, not as a gap, still needs a clear approach."""
    if lines is None or not room:
        return placeable
    height = len(room)
    width = len(room[0]) if room else 0
    near = _px(1.15, meters_per_pixel, minimum=4)
    distance = [[-1] * width for _ in range(height)]
    pending: list[tuple[int, int]] = []
    for y, row in enumerate(room):
        for x, value in enumerate(row):
            if not value:
                continue
            edge = x == 0 or y == 0 or x == width - 1 or y == height - 1
            if not edge:
                edge = not room[y][x - 1] or not room[y][x + 1] or not room[y - 1][x] or not room[y + 1][x]
            if edge:
                distance[y][x] = 0
                pending.append((x, y))
    cursor = 0
    while cursor < len(pending):
        x, y = pending[cursor]
        cursor += 1
        step = distance[y][x] + 1
        if step > near:
            continue
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            if not room[ny][nx] or distance[ny][nx] >= 0:
                continue
            distance[ny][nx] = step
            pending.append((nx, ny))
    seen = bytearray(width * height)
    face = _px(0.22, meters_per_pixel, minimum=2)
    min_span = 0.3 / meters_per_pixel
    max_span = 1.8 / meters_per_pixel
    depth = float(_px(1.5, meters_per_pixel))
    half = float(_px(0.65, meters_per_pixel))
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not lines[y][x] or distance[y][x] < face or distance[y][x] > near:
                continue
            stack = [(x, y)]
            seen[index] = 1
            cells: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nindex = ny * width + nx
                    if seen[nindex] or not lines[ny][nx] or distance[ny][nx] < face or distance[ny][nx] > near:
                        continue
                    seen[nindex] = 1
                    stack.append((nx, ny))
            if len(cells) < 6:
                continue
            xs = [cell[0] for cell in cells]
            ys = [cell[1] for cell in cells]
            span = max(max(xs) - min(xs), max(ys) - min(ys))
            if span < min_span or span > max_span:
                continue
            cx = sum(xs) / len(xs)
            cy = sum(ys) / len(ys)
            best = 10**9
            bx = by = 0
            for cell_x, cell_y in cells:
                gap = distance[cell_y][cell_x]
                if 0 <= gap < best:
                    best = gap
                    bx, by = cell_x, cell_y
            inward_x = cx - bx
            inward_y = cy - by
            length = math.hypot(inward_x, inward_y)
            if length < 1:
                continue
            nx = inward_x / length
            ny = inward_y / length
            tx, ty = -ny, nx
            for along in range(int(half * 2) + 1):
                offset = -half + along
                for step in range(int(depth) + 1):
                    px = int(bx + tx * offset + nx * step)
                    py = int(by + ty * offset + ny * step)
                    if 0 <= px < width and 0 <= py < height:
                        placeable[py][px] = 0
    return placeable


def _lay_corners(
    pieces: list[dict[str, Any]],
    room_id: str,
    runs: list[dict[str, float]],
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    limit: int,
) -> None:
    """Plants sit in corners, off the aisle and off the door."""
    if limit <= 0 or not runs:
        return
    along = float(_px(0.65, meters_per_pixel))
    depth = float(_px(0.65, meters_per_pixel))
    margin = float(_px(0.7, meters_per_pixel, minimum=2))
    inset = depth / 2 + float(_px(0.18, meters_per_pixel, minimum=1))
    placed = 0
    for run in runs:
        length = float(run["length"])
        if length < margin * 2 + along:
            continue
        angle = float(run["angle"])
        for dist in (margin + along / 2, length - margin - along / 2):
            if placed >= limit:
                return
            cx = float(run["ax"]) + float(run["tx"]) * dist + float(run["nx"]) * inset
            cy = float(run["ay"]) + float(run["ty"]) * dist + float(run["ny"]) * inset
            if not _fits(grid, cx, cy, along, depth, angle):
                continue
            pieces.append(_item(room_id, "plant", "绿植", (cx, cy), (along, depth), angle, width, height, len(pieces) + 1))
            _stamp(grid, cx, cy, along, depth, angle)
            placed += 1


def _cluster_count(area: float, scheme: str) -> int:
    count = 1 if area < 55 else 2 if area < 120 else 3
    if scheme == "anchor":
        return max(1, count - 1)
    return count


def _lay_grove(
    pieces: list[dict[str, Any]],
    room_id: str,
    host_label: str,
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    companions: int,
) -> None:
    """A tree and a few plants beside one center piece, not out in the aisle."""
    hosts = [item for item in pieces if item.get("room_id") == room_id and item.get("label") == host_label]
    if not hosts or companions < 0:
        return
    host = hosts[-1]
    angle = math.radians(float(host.get("angle") or 0))
    hx = float(host["x"]) * width
    hy = float(host["y"]) * height
    host_along = float(host["w"]) * width
    host_depth = float(host["h"]) * height
    tree = float(_px(0.8, meters_per_pixel))
    shrub = float(_px(0.5, meters_per_pixel))
    gap = float(_px(0.4, meters_per_pixel, minimum=1))
    side = max(host_along, host_depth) / 2 + gap + tree / 2
    tree_at: tuple[float, float] | None = None
    for lx, ly in ((side, 0.0), (-side, 0.0), (0.0, side), (0.0, -side), (side, side * 0.45), (-side, side * 0.45)):
        cx, cy = _to_image(lx, ly, hx, hy, angle)
        if not _fits(grid, cx, cy, tree, tree, angle):
            continue
        pieces.append(_item(room_id, "tree", "乔木", (cx, cy), (tree, tree), angle, width, height, len(pieces) + 1))
        _stamp(grid, cx, cy, tree, tree, angle)
        tree_at = (cx, cy)
        break
    anchor = tree_at
    plant_from = tree / 2 if tree_at is not None else max(host_along, host_depth) / 2
    if anchor is None:
        anchor = (hx, hy)
    plant_side = plant_from + gap + shrub / 2
    placed = 0
    for lx, ly in ((plant_side, 0.0), (-plant_side, 0.0), (0.0, plant_side), (0.0, -plant_side)):
        if placed >= companions:
            break
        cx, cy = _to_image(lx, ly, anchor[0], anchor[1], angle)
        if not _fits(grid, cx, cy, shrub, shrub, angle):
            continue
        pieces.append(_item(room_id, "plant", "绿植", (cx, cy), (shrub, shrub), angle, width, height, len(pieces) + 1))
        _stamp(grid, cx, cy, shrub, shrub, angle)
        placed += 1


def _lay_clusters(
    pieces: list[dict[str, Any]],
    room_id: str,
    runs: list[dict[str, float]],
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    *,
    kind: str,
    label: str,
    along_m: float,
    depth_m: float,
    clusters: int,
    companions: int,
    sofa: bool = False,
) -> None:
    """Repeat one furniture group down the room so a large floor is not one empty middle."""
    if clusters <= 0 or not runs:
        return
    angle = float(runs[0]["angle"])
    cx, cy = _centroid(grid)
    tx = math.cos(angle)
    ty = math.sin(angle)
    spacing = float(_px(4.6, meters_per_pixel, minimum=4))
    along = float(_px(along_m, meters_per_pixel))
    depth = float(_px(depth_m, meters_per_pixel))
    sofa_along = float(_px(1.8, meters_per_pixel))
    sofa_depth = float(_px(0.85, meters_per_pixel))
    nx = -ty
    ny = tx
    slots = ((0.0, 0.0), (spacing, 0.0), (0.0, spacing), (-spacing, 0.0), (0.0, -spacing))
    for index in range(min(clusters, len(slots))):
        slot_x, slot_y = slots[index]
        origin_x = cx + tx * slot_x + nx * slot_y
        origin_y = cy + ty * slot_x + ny * slot_y
        placed_at: tuple[float, float] | None = None
        for ox, oy in ((0.0, 0.0), (spacing * 0.35, 0.0), (-spacing * 0.35, 0.0), (0.0, spacing * 0.35)):
            px = origin_x + tx * ox + nx * oy
            py = origin_y + ty * ox + ny * oy
            if not _fits(grid, px, py, along, depth, angle):
                continue
            pieces.append(_item(room_id, kind, label, (px, py), (along, depth), angle, width, height, len(pieces) + 1))
            _stamp(grid, px, py, along, depth, angle)
            placed_at = (px, py)
            break
        if placed_at is None:
            continue
        if sofa:
            front = depth / 2 + float(_px(0.35, meters_per_pixel, minimum=1)) + sofa_depth / 2
            for ly, face in ((front, angle + math.pi), (-front, angle)):
                sx, sy = _to_image(0.0, ly, placed_at[0], placed_at[1], angle)
                if not _fits(grid, sx, sy, sofa_along, sofa_depth, face):
                    continue
                pieces.append(_item(room_id, "sofa", "沙发", (sx, sy), (sofa_along, sofa_depth), face, width, height, len(pieces) + 1))
                _stamp(grid, sx, sy, sofa_along, sofa_depth, face)
                break
        _lay_grove(pieces, room_id, label, grid, meters_per_pixel, width, height, companions)


def _dress_room(
    pieces: list[dict[str, Any]],
    room_id: str,
    kind: str,
    area: float,
    runs: list[dict[str, float]],
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    scheme: str,
) -> None:
    """Corner plants and one planter. Nothing is dropped in the aisle."""
    if kind == "toilet" or not runs or area < 6:
        return
    if kind in {"office", "reading", "reception"} and area >= 18 and scheme != "grid":
        _lay_along(
            pieces, room_id, "cabinet", "边柜", runs[-1:], 1.1, 0.4, 0.3,
            grid, meters_per_pixel, width, height, 1, per_wall=1, end_m=0.6,
        )
    if area >= 16:
        _lay_along(
            pieces, room_id, "planter", "花槽", runs[-1:], 1.2, 0.32, 0.2,
            grid, meters_per_pixel, width, height, 1, per_wall=1, end_m=0.45,
        )
    _lay_corners(
        pieces, room_id, runs, grid, meters_per_pixel, width, height,
        2 if area >= 20 else 1,
    )


def _fill_bare_areas(
    pieces: list[dict[str, Any]],
    room_id: str,
    kind: str,
    area: float,
    runs: list[dict[str, float]],
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
) -> None:
    """Put one group in each large patch that the wall pass left empty."""
    if area < 28 or kind in {"toilet", "storage"} or not runs or not grid:
        return
    specs = {
        "reception": ("table", "茶几", 1.0, 0.55),
        "office": ("table", "讨论桌", 1.6, 0.85),
        "meeting": ("table", "会议桌", 1.8, 0.9),
        "reading": ("table", "阅览桌", 1.4, 0.75),
        "activity": ("bench", "休息凳", 1.6, 0.45),
        "cafe": ("table", "茶座", spec("cafe_table").along_m, spec("cafe_table").depth_m),
    }
    chosen = specs.get(kind)
    if chosen is None:
        return
    piece_kind, label, along_m, depth_m = chosen
    cover = {"table", "sofa", "counter", "desk", "seat", "bench", "shelf"}
    centers = [
        (float(item["x"]) * width, float(item["y"]) * height)
        for item in pieces
        if item.get("room_id") == room_id and str(item.get("kind") or "") in cover
    ]
    reach = 2.8 / meters_per_pixel
    reach_sq = reach * reach
    bare = [bytearray(width) for _ in range(height)]
    for y, row in enumerate(grid):
        for x, value in enumerate(row):
            if not value:
                continue
            if any((x - cx) * (x - cx) + (y - cy) * (y - cy) <= reach_sq for cx, cy in centers):
                continue
            bare[y][x] = 1
    minimum = int(10 / (meters_per_pixel * meters_per_pixel))
    seen = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []
    for y, row in enumerate(bare):
        for x, value in enumerate(row):
            index = y * width + x
            if not value or seen[index]:
                continue
            stack = [(x, y)]
            seen[index] = 1
            cells: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nindex = ny * width + nx
                    if seen[nindex] or not bare[ny][nx]:
                        continue
                    seen[nindex] = 1
                    stack.append((nx, ny))
            if len(cells) >= minimum:
                components.append(cells)
    components.sort(key=len, reverse=True)
    angle = float(runs[0]["angle"])
    along = float(_px(along_m, meters_per_pixel))
    depth = float(_px(depth_m, meters_per_pixel))
    limit = 3 if area >= 80 else 2
    for cells in components[:limit]:
        cx = sum(point[0] for point in cells) / len(cells)
        cy = sum(point[1] for point in cells) / len(cells)
        spots = [(cx, cy)]
        stride = max(1, len(cells) // 6)
        spots.extend((float(point[0]), float(point[1])) for point in cells[::stride])
        placed_at: tuple[float, float] | None = None
        for px, py in spots:
            if _fits(grid, px, py, along, depth, angle):
                placed_at = (px, py)
                break
        if placed_at is None:
            continue
        pieces.append(_item(room_id, piece_kind, label, placed_at, (along, depth), angle, width, height, len(pieces) + 1))
        _stamp(grid, placed_at[0], placed_at[1], along, depth, angle)
        if kind == "reception":
            sofa_along = float(_px(1.8, meters_per_pixel))
            sofa_depth = float(_px(0.85, meters_per_pixel))
            front = depth / 2 + float(_px(0.35, meters_per_pixel, minimum=1)) + sofa_depth / 2
            for ly, face in ((front, angle + math.pi), (-front, angle)):
                sx, sy = _to_image(0.0, ly, placed_at[0], placed_at[1], angle)
                if not _fits(grid, sx, sy, sofa_along, sofa_depth, face):
                    continue
                pieces.append(_item(room_id, "sofa", "沙发", (sx, sy), (sofa_along, sofa_depth), face, width, height, len(pieces) + 1))
                _stamp(grid, sx, sy, sofa_along, sofa_depth, face)
                break
        _lay_grove(pieces, room_id, label, grid, meters_per_pixel, width, height, 1)


_GROUP_BY_LABEL = {
    "服务台": "接待台",
    "边柜": "接待台",
    "等候座": "等候",
    "茶几": "洽谈",
    "沙发": "洽谈",
    "乔木": "绿化",
    "绿植": "绿化",
    "花槽": "绿化",
    "讨论桌": "讨论",
    "工位": "工位",
    "会议桌": "会议",
    "会议椅": "会议",
    "吧台": "备餐",
    "操作台": "备餐",
    "茶座": "茶座",
    "阅览桌": "阅览",
    "书架": "书架",
    "休息凳": "休息",
    "边凳": "休息",
    "货架": "储藏",
}


def _assign_groups(pieces: list[dict[str, Any]]) -> None:
    """Name the group a piece belongs to. Placement stays on the piece."""
    for item in pieces:
        label = str(item.get("label") or "")
        if "厕" in label or label in {"小便池", "洗手", "洗手池"}:
            item["group"] = "洁具"
            continue
        group = _GROUP_BY_LABEL.get(label)
        if group:
            item["group"] = group
    for item in pieces:
        if item.get("group") or str(item.get("label") or "") != "座椅":
            continue
        room_id = item.get("room_id")
        prior = [
            other
            for other in pieces
            if other.get("room_id") == room_id and other.get("group") and other.get("group") != "绿化"
        ]
        if prior:
            item["group"] = prior[-1]["group"]


def _usable_pixel_polygons(room: dict[str, Any], frame: dict[str, Any] | None) -> list[Any]:
    rings = ((room.get("usable") or {}).get("polygons") or [])
    if not isinstance(frame, dict) or not rings:
        return []
    scale = float(frame.get("scale") or 0)
    meters_per_unit = float(frame.get("meters_per_unit") or 0)
    if scale <= 0 or meters_per_unit <= 0:
        return []
    from shapely.geometry import Polygon
    from shapely.validation import make_valid

    min_x = float(frame["min_x"])
    max_y = float(frame["max_y"])
    found: list[Any] = []
    for ring in rings:
        points = []
        for pair in ring:
            if len(pair) < 2:
                continue
            drawing_x = float(pair[0]) / meters_per_unit
            drawing_y = float(pair[1]) / meters_per_unit
            points.append(((drawing_x - min_x) * scale + 4, (max_y - drawing_y) * scale + 4))
        if len(points) < 4:
            continue
        polygon = Polygon(points)
        if not polygon.is_valid:
            polygon = make_valid(polygon)
        if polygon.geom_type == "MultiPolygon":
            polygon = max(polygon.geoms, key=lambda item: item.area)
        if polygon.geom_type == "Polygon" and not polygon.is_empty and polygon.area >= 400:
            found.append(polygon)
    found.sort(key=lambda item: item.area, reverse=True)
    return found


def _seek_in_usable(
    grid: list[bytearray],
    polygons: list[Any],
    x: float,
    y: float,
    along: float,
    depth: float,
    angle: float,
    meters_per_pixel: float,
) -> tuple[float, float] | None:
    from shapely.geometry import Point

    def open_at(px: float, py: float) -> bool:
        if polygons and not any(polygon.covers(Point(px, py)) for polygon in polygons):
            return False
        return _fits(grid, px, py, along, depth, angle)

    if open_at(x, y):
        return x, y
    step = float(_px(0.7, meters_per_pixel, minimum=2))
    for ring in range(1, 6):
        reach = step * ring
        for dx, dy in (
            (reach, 0.0),
            (-reach, 0.0),
            (0.0, reach),
            (0.0, -reach),
            (reach, reach),
            (-reach, reach),
            (reach, -reach),
            (-reach, -reach),
        ):
            if open_at(x + dx, y + dy):
                return x + dx, y + dy
    return None


def _lay_talk_group(
    pieces: list[dict[str, Any]],
    room_id: str,
    grid: list[bytearray],
    polygons: list[Any],
    x: float,
    y: float,
    angle: float,
    meters_per_pixel: float,
    width: int,
    height: int,
    companions: int,
) -> bool:
    along = float(_px(1.0, meters_per_pixel))
    depth = float(_px(0.55, meters_per_pixel))
    spot = _seek_in_usable(grid, polygons, x, y, along, depth, angle, meters_per_pixel)
    if spot is None:
        return False
    pieces.append(_item(room_id, "table", "茶几", spot, (along, depth), angle, width, height, len(pieces) + 1))
    _stamp(grid, spot[0], spot[1], along, depth, angle)
    sofa_along = float(_px(1.8, meters_per_pixel))
    sofa_depth = float(_px(0.85, meters_per_pixel))
    front = depth / 2 + float(_px(0.35, meters_per_pixel, minimum=1)) + sofa_depth / 2
    for ly, face in ((front, angle + math.pi), (-front, angle)):
        sx, sy = _to_image(0.0, ly, spot[0], spot[1], angle)
        sofa_at = _seek_in_usable(grid, polygons, sx, sy, sofa_along, sofa_depth, face, meters_per_pixel)
        if sofa_at is None:
            continue
        pieces.append(_item(room_id, "sofa", "沙发", sofa_at, (sofa_along, sofa_depth), face, width, height, len(pieces) + 1))
        _stamp(grid, sofa_at[0], sofa_at[1], sofa_along, sofa_depth, face)
        break
    _lay_grove(pieces, room_id, "茶几", grid, meters_per_pixel, width, height, companions)
    return True


def _furniture_for_room(
    room: dict[str, Any],
    grid: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
    lines: list[bytearray] | None = None,
    scheme: str = "wall",
    frame: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    kind = _layout_kind(room)
    area = float(room.get("area_m2") or 0)
    room_id = str(room.get("room_id") or "")
    placeable = _clear_swings(
        _clear_openings(_apply_obstacles(grid, lines, meters_per_pixel), grid, lines, meters_per_pixel),
        grid,
        lines,
        meters_per_pixel,
    )
    runs = _wall_runs(grid, meters_per_pixel)
    pieces: list[dict[str, Any]] = []
    if kind == "meeting":
        _lay_meeting(pieces, room_id, runs, placeable, meters_per_pixel, width, height)
        if area >= 28:
            _lay_grove(pieces, room_id, "会议桌", placeable, meters_per_pixel, width, height, 2 if scheme != "anchor" else 1)
        _dress_room(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height, scheme)
        _fill_bare_areas(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height)
        return pieces
    if kind == "reception":
        usable = _usable_pixel_polygons(room, frame)
        if usable and area >= 40 and runs:
            angle = float(runs[0]["angle"])
            companions = 1 if scheme == "anchor" else 2
            for polygon in usable[:3]:
                point = polygon.representative_point()
                _lay_talk_group(
                    pieces, room_id, placeable, usable, point.x, point.y, angle,
                    meters_per_pixel, width, height, companions,
                )
            if scheme == "grid":
                point = usable[0].representative_point()
                _lay_talk_group(
                    pieces, room_id, placeable, usable,
                    point.x + math.cos(angle) * float(_px(4.6, meters_per_pixel, minimum=4)),
                    point.y + math.sin(angle) * float(_px(4.6, meters_per_pixel, minimum=4)),
                    angle, meters_per_pixel, width, height, companions,
                )
        if area >= 40 and not any(item.get("label") == "茶几" for item in pieces):
            _lay_clusters(
                pieces, room_id, runs, placeable, meters_per_pixel, width, height,
                kind="table", label="茶几", along_m=1.0, depth_m=0.55,
                clusters=_cluster_count(area, scheme), companions=2 if scheme != "anchor" else 1, sofa=True,
            )
        _lay_along(
            pieces, room_id, "counter", "服务台", runs[:1], 2.4, 0.7, 0.4,
            placeable, meters_per_pixel, width, height, 1, per_wall=1, end_m=1.0,
        )
        sofa_runs = runs[1:3] or runs[:1]
        sofa_limit = 1 if scheme == "anchor" else 2
        _lay_along(
            pieces, room_id, "sofa", "沙发", sofa_runs, 1.8, 0.8, 0.8,
            placeable, meters_per_pixel, width, height, sofa_limit, per_wall=1, end_m=1.0,
        )
        _lay_along(
            pieces, room_id, "table", "茶几", sofa_runs, 0.9, 0.5, 0.4,
            placeable, meters_per_pixel, width, height, sofa_limit, per_wall=1, inset_m=1.25, end_m=1.0,
        )
        if scheme == "grid":
            _lay_grid(
                pieces, room_id, "seat", "等候座", runs, 0.55, 0.55, 1.1,
                placeable, meters_per_pixel, width, height, min(8, max(4, int(area / 18))),
            )
        elif scheme == "wall":
            _lay_along(
                pieces, room_id, "seat", "等候座", runs[3:4] or runs[:1], 0.55, 0.55, 0.6,
                placeable, meters_per_pixel, width, height, 4, per_wall=4, end_m=1.0,
            )
        _dress_room(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height, scheme)
        if not usable:
            _fill_bare_areas(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height)
        elif pieces:
            from shapely.geometry import Point

            kept = [
                item
                for item in pieces
                if any(polygon.buffer(12).covers(Point(float(item["x"]) * width, float(item["y"]) * height)) for polygon in usable)
            ]
            if any(item.get("label") == "茶几" for item in kept):
                pieces = kept
        return pieces
    if kind == "office":
        if area >= 32:
            _lay_clusters(
                pieces, room_id, runs, placeable, meters_per_pixel, width, height,
                kind="table", label="讨论桌", along_m=1.6, depth_m=0.85,
                clusters=_cluster_count(area, scheme), companions=2 if scheme != "anchor" else 1,
            )
            _chairs_around(pieces, room_id, "讨论桌", placeable, meters_per_pixel, width, height)
        desk_limit = max(2, int(area / 8))
        if scheme == "grid":
            before = len(pieces)
            _lay_grid(
                pieces, room_id, "desk", "工位", runs, 1.4, 0.7, 1.0,
                placeable, meters_per_pixel, width, height, desk_limit,
            )
            other_runs = [
                run
                for run in runs
                if min(abs(math.degrees(float(run["angle"]) - float(runs[0]["angle"]))) % 180, 180 - abs(math.degrees(float(run["angle"]) - float(runs[0]["angle"]))) % 180) > 25
            ]
            if other_runs:
                _lay_along(
                    pieces, room_id, "desk", "工位", other_runs, 1.4, 0.7, 0.45,
                    placeable, meters_per_pixel, width, height, max(2, desk_limit // 3), per_wall=3, end_m=0.9,
                )
            if len(pieces) - before < 2:
                _lay_along(
                    pieces, room_id, "desk", "工位", runs, 1.4, 0.7, 0.45,
                    placeable, meters_per_pixel, width, height, desk_limit, end_m=0.9,
                )
        else:
            _lay_along(
                pieces, room_id, "desk", "工位", runs if scheme == "wall" else runs[:2], 1.4, 0.7, 0.45,
                placeable, meters_per_pixel, width, height, desk_limit,
                per_wall=4 if scheme == "wall" else 3, end_m=0.9,
            )
        _dress_room(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height, scheme)
        _fill_bare_areas(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height)
        return pieces
    if kind == "reading":
        if area >= 32:
            _lay_clusters(
                pieces, room_id, runs, placeable, meters_per_pixel, width, height,
                kind="table", label="阅览桌", along_m=1.4, depth_m=0.75,
                clusters=_cluster_count(area, scheme), companions=2 if scheme != "anchor" else 1,
            )
        shelf_runs = runs[:2] if scheme == "wall" else runs[:1]
        _lay_along(
            pieces, room_id, "shelf", "书架", shelf_runs, 2.0, 0.4, 0.35,
            placeable, meters_per_pixel, width, height, 3, per_wall=2, end_m=0.8,
        )
        table_runs = runs[1:2] or runs[:1]
        table_limit = 2 if scheme == "anchor" else max(2, int(area / 16))
        if scheme == "grid":
            _lay_grid(
                pieces, room_id, "table", "阅览桌", runs, 1.4, 0.75, 1.0,
                placeable, meters_per_pixel, width, height, table_limit,
            )
        else:
            _lay_along(
                pieces, room_id, "table", "阅览桌", table_runs, 1.4, 0.75, 0.7,
                placeable, meters_per_pixel, width, height, table_limit, per_wall=2, inset_m=1.35, end_m=0.9,
            )
        _chairs_around(pieces, room_id, "阅览桌", placeable, meters_per_pixel, width, height)
        _dress_room(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height, scheme)
        _fill_bare_areas(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height)
        return pieces
    if kind == "activity":
        if area >= 40:
            _lay_clusters(
                pieces, room_id, runs, placeable, meters_per_pixel, width, height,
                kind="bench", label="休息凳", along_m=1.6, depth_m=0.45,
                clusters=_cluster_count(area, scheme), companions=2 if scheme != "anchor" else 1,
            )
        bench_runs = runs[:2] if scheme == "anchor" else runs
        _lay_along(
            pieces, room_id, "bench", "边凳", bench_runs, 1.5, 0.45, 1.1,
            placeable, meters_per_pixel, width, height, max(3, int(area / 20)),
            per_wall=2, end_m=1.0,
        )
        _dress_room(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height, scheme)
        _fill_bare_areas(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height)
        return pieces
    if kind == "cafe":
        bar = spec("bar")
        prep = spec("prep")
        table = spec("cafe_table")
        bar_wall = _lay_one(
            pieces, room_id, bar.kind, bar.label, runs, (bar.along_m, 1.6), bar.depth_m,
            placeable, meters_per_pixel, width, height,
        )
        prep_runs = runs
        if bar_wall is not None:
            prep_runs = [runs[bar_wall], *[run for index, run in enumerate(runs[:4]) if index != bar_wall]]
        _lay_one(
            pieces, room_id, prep.kind, prep.label, prep_runs, (prep.along_m, 1.0), prep.depth_m,
            placeable, meters_per_pixel, width, height,
        )
        for item in pieces:
            if item.get("room_id") == room_id and item.get("label") in {bar.label, prep.label}:
                _block_in_front(placeable, item, 0.9, meters_per_pixel, width, height)
        guest_runs = [run for index, run in enumerate(runs) if index != bar_wall] or runs[:1]
        _lay_along(
            pieces, room_id, table.kind, table.label, guest_runs, table.along_m, table.depth_m, 0.7,
            placeable, meters_per_pixel, width, height, max(2, int(area / 8)), per_wall=3,
        )
        _chairs_around(pieces, room_id, table.label, placeable, meters_per_pixel, width, height)
        _dress_room(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height, scheme)
        _fill_bare_areas(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height)
        return pieces
    if kind == "toilet":
        _lay_toilet(pieces, room, grid, placeable, meters_per_pixel, width, height)
        return pieces
    _lay_along(
        pieces, room_id, "shelf", "货架", runs[:1], 0.9, 0.35, 0.2,
        placeable, meters_per_pixel, width, height, 2, per_wall=1,
    )
    _dress_room(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height, scheme)
    _fill_bare_areas(pieces, room_id, kind, area, runs, placeable, meters_per_pixel, width, height)
    return pieces


def _largest_component(grid: list[bytearray]) -> list[bytearray]:
    height = len(grid)
    width = len(grid[0]) if grid else 0
    seen = bytearray(width * height)
    best: list[tuple[int, int]] = []
    for y, row in enumerate(grid):
        for x, value in enumerate(row):
            index = y * width + x
            if not value or seen[index]:
                continue
            stack = [(x, y)]
            seen[index] = 1
            cells: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nindex = ny * width + nx
                    if seen[nindex] or not grid[ny][nx]:
                        continue
                    seen[nindex] = 1
                    stack.append((nx, ny))
            if len(cells) > len(best):
                best = cells
    kept = [bytearray(width) for _ in range(height)]
    for x, y in best:
        kept[y][x] = 1
    return kept


def _side_masks(
    grid: list[bytearray],
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    pad: float,
) -> tuple[list[bytearray], list[bytearray]]:
    height = len(grid)
    width = len(grid[0]) if grid else 0
    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy) or 1.0
    female = [bytearray(width) for _ in range(height)]
    male = [bytearray(width) for _ in range(height)]
    for y, row in enumerate(grid):
        for x, value in enumerate(row):
            if not value:
                continue
            signed = dx * (y - y1) - dy * (x - x1)
            if abs(signed) / length <= pad:
                continue
            if signed >= 0:
                female[y][x] = 1
            else:
                male[y][x] = 1
    return female, male


def _toilet_sides(
    room: dict[str, Any],
    room_grid: list[bytearray],
    placeable: list[bytearray],
    width: int,
    height: int,
    meters_per_pixel: float,
) -> list[tuple[str, list[bytearray], list[bytearray]]]:
    """Split a shared toilet on the gender wall. A single toilet stays one piece."""
    split = _split_toilet(room, room_grid, width, height, meters_per_pixel)
    if split is None:
        return [("", room_grid, placeable)]
    x1 = float(split["x1"]) * width
    y1 = float(split["y1"]) * height
    x2 = float(split["x2"]) * width
    y2 = float(split["y2"]) * height
    pad = float(_px(0.12, meters_per_pixel, minimum=1))
    female_room, male_room = _side_masks(room_grid, x1, y1, x2, y2, pad)
    female_place, male_place = _side_masks(placeable, x1, y1, x2, y2, pad)
    return [
        ("女", _largest_component(female_room), _largest_component(female_place)),
        ("男", _largest_component(male_room), _largest_component(male_place)),
    ]


def _lay_toilet(
    pieces: list[dict[str, Any]],
    room: dict[str, Any],
    room_grid: list[bytearray],
    placeable: list[bytearray],
    meters_per_pixel: float,
    width: int,
    height: int,
) -> None:
    """Women get stalls and basins. Men get stalls, urinals and basins."""
    room_id = str(room.get("room_id") or "")
    area = float(room.get("area_m2") or 0)
    sides = _toilet_sides(room, room_grid, placeable, width, height, meters_per_pixel)
    share = area / max(1, len(sides))
    stalls = 3 if share >= 10 else 2 if share >= 6 else 1
    urinals = 2 if share >= 8 else 1
    sinks = 2 if share >= 12 else 1
    for prefix, room_side, place_side in sides:
        if sum(sum(row) for row in place_side) < 12:
            continue
        runs = _wall_runs(room_side, meters_per_pixel) or _wall_runs(place_side, meters_per_pixel)
        if not runs:
            continue
        _lay_along(
            pieces, room_id, "wc", f"{prefix}厕位", runs[:1], 0.9, 1.2, 0.15,
            place_side, meters_per_pixel, width, height, stalls, per_wall=stalls, end_m=0.4,
        )
        rest = runs[1:]
        if prefix == "男":
            urinal_runs = rest[:1] or runs[:1]
            _lay_along(
                pieces, room_id, "urinal", f"{prefix}小便池", urinal_runs, 0.42, 0.55, 0.12,
                place_side, meters_per_pixel, width, height, urinals, per_wall=urinals, end_m=0.35,
            )
            rest = rest[1:]
        before = len(pieces)
        for sink_run in list(rest) + list(runs[:1]):
            _lay_along(
                pieces, room_id, "sink", f"{prefix}洗手池", [sink_run], 0.55, 0.42, 0.1,
                place_side, meters_per_pixel, width, height, sinks, per_wall=sinks, end_m=0.25,
            )
            if len(pieces) > before:
                break


def _split_toilet(
    room: dict[str, Any],
    grid: list[bytearray],
    width: int,
    height: int,
    meters_per_pixel: float,
) -> dict[str, Any] | None:
    """A gender wall across the room, parallel to the short walls, with a door gap."""
    name = _room_name(room)
    if "男女" not in name or float(room.get("area_m2") or 0) < 8:
        return None
    runs = _wall_runs(grid, meters_per_pixel)
    if not runs:
        return None
    angle = float(runs[0]["angle"])
    dx, dy = -math.sin(angle), math.cos(angle)
    cx, cy = _centroid(grid)
    if not _cell(grid, cx, cy):
        return None

    def reach(sign: float) -> int:
        last = 0
        limit = max(width, height)
        for step in range(1, limit):
            if not _cell(grid, cx + dx * sign * step, cy + dy * sign * step):
                break
            last = step
        return last

    back = reach(-1.0)
    fore = reach(1.0)
    gap = float(_px(0.8, meters_per_pixel, minimum=4))
    fore_wall = fore - gap
    gap_px = gap
    if back + fore_wall < 8:
        fore_wall = float(fore)
        gap_px = 0.0
    if back + fore_wall < 8:
        return None
    x1 = cx - dx * back
    y1 = cy - dy * back
    x2 = cx + dx * fore_wall
    y2 = cy + dy * fore_wall
    return {
        "id": f"{room.get('room_id')}-split",
        "room_id": room.get("room_id") or "",
        "label": "男女分隔",
        "x1": round(x1 / width, 4),
        "y1": round(y1 / height, 4),
        "x2": round(x2 / width, 4),
        "y2": round(y2 / height, 4),
        "gap_px": gap_px,
    }


def _partition(
    room_id: str,
    label: str,
    ident: str,
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    width: int,
    height: int,
) -> dict[str, Any]:
    return {
        "id": ident,
        "room_id": room_id,
        "label": label,
        "x1": round(x1 / width, 4),
        "y1": round(y1 / height, 4),
        "x2": round(x2 / width, 4),
        "y2": round(y2 / height, 4),
    }


def _stall_partitions(
    furniture: list[dict[str, Any]],
    width: int,
    height: int,
    meters_per_pixel: float,
) -> list[dict[str, Any]]:
    """Each stall is a closed cubicle: sides meet the back wall, the front door is shut."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in furniture:
        if item.get("kind") != "wc":
            continue
        groups.setdefault(str(item.get("room_id") or "") + ":" + str(item.get("label") or ""), []).append(item)
    segments: list[dict[str, Any]] = []
    seen: set[tuple[int, int]] = set()
    back_extra = 0.22 / meters_per_pixel
    for group in groups.values():
        angle = math.radians(float(group[0].get("angle") or 0))
        tx, ty = math.cos(angle), math.sin(angle)
        fx, fy = -math.sin(angle), math.cos(angle)
        group.sort(key=lambda item: float(item["x"]) * width * tx + float(item["y"]) * height * ty)
        sample = group[0]
        half_w = float(sample["w"]) * width / 2
        half_d = float(sample["h"]) * height / 2
        room_id = str(sample.get("room_id") or "")
        for item in group:
            cx = float(item["x"]) * width
            cy = float(item["y"]) * height
            front = half_d
            back = half_d + back_extra
            corners: dict[float, tuple[float, float]] = {}
            for side in (-1.0, 1.0):
                ox = cx + tx * side * half_w
                oy = cy + ty * side * half_w
                key = (int(ox) // 3, int(oy) // 3)
                x1 = ox - fx * back
                y1 = oy - fy * back
                x2 = ox + fx * front
                y2 = oy + fy * front
                corners[side] = (x2, y2)
                if key in seen:
                    continue
                seen.add(key)
                segments.append(
                    _partition(
                        room_id,
                        "厕位隔板",
                        f"{room_id}-stall-{len(segments) + 1}",
                        x1,
                        y1,
                        x2,
                        y2,
                        width,
                        height,
                    )
                )
            hinge_x, hinge_y = corners[-1.0]
            stop_x, stop_y = corners[1.0]
            back_left = (cx - tx * half_w - fx * back, cy - ty * half_w - fy * back)
            back_right = (cx + tx * half_w - fx * back, cy + ty * half_w - fy * back)
            segments.append(
                _partition(
                    room_id,
                    "厕位隔板",
                    f"{room_id}-stall-back-{len(segments) + 1}",
                    back_left[0],
                    back_left[1],
                    back_right[0],
                    back_right[1],
                    width,
                    height,
                )
            )
            segments.append(
                _partition(
                    room_id,
                    "厕位门",
                    f"{room_id}-door-{len(segments) + 1}",
                    hinge_x,
                    hinge_y,
                    stop_x,
                    stop_y,
                    width,
                    height,
                )
            )
    return segments


def _gender_door(
    split: dict[str, Any],
    width: int,
    height: int,
    meters_per_pixel: float,
) -> dict[str, Any] | None:
    """Close the gender-wall doorway so the two rooms meet only at a shut door."""
    del meters_per_pixel
    gap = float(split.get("gap_px") or 0)
    if gap < 4:
        return None
    x1 = float(split["x1"]) * width
    y1 = float(split["y1"]) * height
    x2 = float(split["x2"]) * width
    y2 = float(split["y2"]) * height
    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy) or 1.0
    tx, ty = dx / length, dy / length
    return _partition(
        str(split.get("room_id") or ""),
        "卫生间门",
        f"{split.get('room_id')}-entry",
        x2,
        y2,
        x2 + tx * gap,
        y2 + ty * gap,
        width,
        height,
    )


def _entry_screen(
    mask: Image.Image,
    lines: Image.Image | None,
    room: dict[str, Any],
    width: int,
    height: int,
    meters_per_pixel: float,
) -> list[dict[str, Any]]:
    """Close an open edge between the toilet and the next room so the lobby cannot see in."""
    marker = int(room.get("marker") or 0)
    if marker <= 0:
        return []
    pixels = mask.load()
    line_pixels = lines.load() if lines is not None and lines.size == mask.size else None
    groups: dict[int, list[tuple[float, float]]] = {}
    for y in range(height):
        for x in range(width):
            if int(pixels[x, y]) != marker:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                other = int(pixels[nx, ny])
                if other <= 0 or other == marker:
                    continue
                if line_pixels is not None and (_wall_pixel(line_pixels[x, y]) or _wall_pixel(line_pixels[nx, ny])):
                    continue
                groups.setdefault(other, []).append(((x + nx) / 2, (y + ny) / 2))
    room_id = str(room.get("room_id") or "")
    segments: list[dict[str, Any]] = []
    minimum = 1.2 / meters_per_pixel
    for points in groups.values():
        if len(points) < 6:
            continue
        mean_x = sum(point[0] for point in points) / len(points)
        mean_y = sum(point[1] for point in points) / len(points)
        sxx = syy = sxy = 0.0
        for x, y in points:
            dx, dy = x - mean_x, y - mean_y
            sxx += dx * dx
            syy += dy * dy
            sxy += dx * dy
        angle = 0.5 * math.atan2(2 * sxy, sxx - syy)
        cos, sin = math.cos(angle), math.sin(angle)
        ordered = sorted(points, key=lambda point: point[0] * cos + point[1] * sin)
        x1, y1 = ordered[0]
        x2, y2 = ordered[-1]
        span = math.hypot(x2 - x1, y2 - y1)
        if span < minimum:
            continue
        gap = min(span * 0.45, float(_px(0.8, meters_per_pixel, minimum=4)))
        tx, ty = (x2 - x1) / span, (y2 - y1) / span
        door_x = x2 - tx * gap
        door_y = y2 - ty * gap
        segments.append(
            _partition(room_id, "入口隔墙", f"{room_id}-entry-wall-{len(segments) + 1}", x1, y1, door_x, door_y, width, height)
        )
        segments.append(
            _partition(room_id, "入口门", f"{room_id}-entry-door-{len(segments) + 1}", door_x, door_y, x2, y2, width, height)
        )
    return segments


def _adjacency_partitions(
    mask: Image.Image,
    lines: Image.Image | None,
    rooms: list[dict[str, Any]],
    meters_per_pixel: float,
) -> list[dict[str, Any]]:
    """Walls along room edges that are not already drawn on the wall layer."""
    width, height = mask.size
    pixels = mask.load()
    line_pixels = lines.load() if lines is not None and lines.size == mask.size else None
    minimum = max(8, int(0.8 / meters_per_pixel))
    room_of_marker = {int(room.get('marker') or 0): str(room.get('room_id') or '') for room in rooms}
    segments: list[dict[str, Any]] = []

    def wall(x: int, y: int) -> bool:
        if line_pixels is None:
            return False
        return _wall_pixel(line_pixels[x, y])

    def add(axis: str, fixed: int, start: int, end: int, left: int, right: int) -> None:
        if end - start + 1 < minimum or len(segments) >= 80:
            return
        room_id = room_of_marker.get(left) or room_of_marker.get(right) or ''
        if axis == 'h':
            y = (fixed + 0.5) / height
            x1 = start / width
            x2 = (end + 1) / width
            y1 = y2 = y
        else:
            x = (fixed + 0.5) / width
            y1 = start / height
            y2 = (end + 1) / height
            x1 = x2 = x
        segments.append(
            {
                'id': f'part-{len(segments) + 1}',
                'room_id': room_id,
                'label': '分隔墙',
                'x1': round(x1, 4),
                'y1': round(y1, 4),
                'x2': round(x2, 4),
                'y2': round(y2, 4),
            }
        )

    for y in range(height - 1):
        start_x = None
        pair = (0, 0)
        last_x = 0
        for x in range(width):
            above = int(pixels[x, y])
            below = int(pixels[x, y + 1])
            open_edge = bool(above and below and above != below and not wall(x, y) and not wall(x, y + 1))
            if open_edge and start_x is not None and pair == (above, below) and x == last_x + 1:
                last_x = x
                continue
            if start_x is not None:
                add('h', y, start_x, last_x, pair[0], pair[1])
                start_x = None
            if open_edge:
                start_x = x
                last_x = x
                pair = (above, below)
        if start_x is not None:
            add('h', y, start_x, last_x, pair[0], pair[1])

    for x in range(width - 1):
        start_y = None
        pair = (0, 0)
        last_y = 0
        for y in range(height):
            left = int(pixels[x, y])
            right = int(pixels[x + 1, y])
            open_edge = bool(left and right and left != right and not wall(x, y) and not wall(x + 1, y))
            if open_edge and start_y is not None and pair == (left, right) and y == last_y + 1:
                last_y = y
                continue
            if start_y is not None:
                add('v', x, start_y, last_y, pair[0], pair[1])
                start_y = None
            if open_edge:
                start_y = y
                last_y = y
                pair = (left, right)
        if start_y is not None:
            add('v', x, start_y, last_y, pair[0], pair[1])
    return segments


def build_floor_fitout(
    floor: dict[str, Any],
    mask: Image.Image,
    lines: Image.Image | None,
) -> dict[str, Any]:
    meters_per_pixel = _meters_per_pixel(floor)
    width, height = mask.size
    mask_l = mask.convert("L")
    line_image = lines.convert("RGBA") if lines is not None else None
    partitions = _adjacency_partitions(mask_l, line_image, list(floor.get("rooms") or []), meters_per_pixel)
    line_grid = _line_grid(line_image, width, height)
    room_grids: list[tuple[dict[str, Any], list[bytearray]]] = []
    for room in floor.get("rooms") or []:
        marker = int(room.get("marker") or 0)
        if marker <= 0 or float(room.get("area_m2") or 0) < 1.5:
            continue
        grid = _room_grid(mask_l, marker)
        split = _split_toilet(room, grid, width, height, meters_per_pixel)
        if split is not None:
            door = _gender_door(split, width, height, meters_per_pixel)
            split.pop("gap_px", None)
            partitions.append(split)
            if door is not None:
                partitions.append(door)
        if "卫生" in _room_name(room):
            partitions.extend(_entry_screen(mask_l, line_image, room, width, height, meters_per_pixel))
        room_grids.append((room, grid))
    from app.services.cad.fitout_score import score_floor_layout

    schemes = (
        ("wall", "沿墙", "接待台、等候、洽谈、绿化按组团靠墙摆，每块可摆区域至少一组洽谈。"),
        ("anchor", "主家具", "每块可摆区域放一组洽谈，接待台靠长墙，旁边配绿化。"),
        ("grid", "网格", "洽谈组团铺在各块可摆区域里，等候沿墙散开。"),
    )
    variants: list[dict[str, Any]] = []
    for scheme, label, note in schemes:
        furniture: list[dict[str, Any]] = []
        for room, grid in room_grids:
            furniture.extend(
            _furniture_for_room(
                room, grid, meters_per_pixel, width, height, line_grid, scheme, floor.get("geometry") if isinstance(floor.get("geometry"), dict) else None,
            )
        )
        _assign_groups(furniture)
        variants.append(
            {
                "id": scheme,
                "label": label,
                "note": note,
                "furniture": furniture,
                "score": score_floor_layout(floor, mask_l, line_image, furniture),
            }
        )
    best = min(variants, key=lambda item: (not item["score"]["passed"], item["score"]["loss"]))
    partitions.extend(_stall_partitions(best["furniture"], width, height, meters_per_pixel))
    return {
        "width": width,
        "height": height,
        "scheme": best["id"],
        "note": best["note"],
        "partitions": partitions,
        "furniture": best["furniture"],
        "score": best["score"],
        "variants": variants,
    }


def _long_wall_components(
    room: list[bytearray],
    lines: list[bytearray],
    meters_per_pixel: float,
) -> list[list[tuple[int, int]]]:
    height = len(room)
    width = len(room[0]) if room else 0
    inset = _px(0.35, meters_per_pixel, minimum=3)
    eroded = _erode(room, inset)
    seen = bytearray(width * height)
    minimum = 2.8 / meters_per_pixel
    found: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not eroded[y][x] or not lines[y][x]:
                continue
            stack = [(x, y)]
            seen[index] = 1
            cells: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nindex = ny * width + nx
                    if seen[nindex] or not eroded[ny][nx] or not lines[ny][nx]:
                        continue
                    seen[nindex] = 1
                    stack.append((nx, ny))
            mean_x = sum(cell[0] for cell in cells) / len(cells)
            mean_y = sum(cell[1] for cell in cells) / len(cells)
            sxx = syy = sxy = 0.0
            for x, y in cells:
                dx, dy = x - mean_x, y - mean_y
                sxx += dx * dx
                syy += dy * dy
                sxy += dx * dy
            angle = 0.5 * math.atan2(2 * sxy, sxx - syy)
            cos, sin = math.cos(angle), math.sin(angle)
            along = [x * cos + y * sin for x, y in cells]
            across = [-x * sin + y * cos for x, y in cells]
            long_side = max(along) - min(along)
            short_side = max(1.0, max(across) - min(across))
            if long_side >= minimum and long_side / short_side >= 4:
                found.append(cells)
    return found


def _split_one_room(
    floor: dict[str, Any],
    mask: Image.Image,
    lines: list[bytearray],
    room: dict[str, Any],
    meters_per_pixel: float,
) -> dict[str, Any] | None:
    marker = int(room.get("marker") or 0)
    if marker <= 0 or float(room.get("area_m2") or 0) < 16:
        return None
    width, height = mask.size
    grid = _room_grid(mask, marker)
    components = _long_wall_components(grid, lines, meters_per_pixel)
    if not components:
        return None
    cells = max(components, key=len)
    count = len(cells)
    mean_x = sum(cell[0] for cell in cells) / count
    mean_y = sum(cell[1] for cell in cells) / count
    sxx = syy = sxy = 0.0
    for x, y in cells:
        dx, dy = x - mean_x, y - mean_y
        sxx += dx * dx
        syy += dy * dy
        sxy += dx * dy
    angle = 0.5 * math.atan2(2 * sxy, sxx - syy)
    tx, ty = math.cos(angle), math.sin(angle)
    projections = [x * tx + y * ty for x, y in cells]
    start = cells[projections.index(min(projections))]
    end = cells[projections.index(max(projections))]
    reach = _px(1.8, meters_per_pixel, minimum=4)

    def gap(px: int, py: int, direction: float) -> int | None:
        for step in range(1, reach + 1):
            if not _cell(grid, px + tx * direction * step, py + ty * direction * step):
                return step
        return None

    start_gap = gap(start[0], start[1], -1)
    end_gap = gap(end[0], end[1], 1)
    if start_gap is None or end_gap is None:
        return None
    barrier = [bytearray(row) for row in grid]
    thickness = _px(0.18, meters_per_pixel, minimum=2)

    def block(px: float, py: float) -> None:
        for oy in range(-thickness, thickness + 1):
            for ox in range(-thickness, thickness + 1):
                ix, iy = int(px) + ox, int(py) + oy
                if 0 <= ix < width and 0 <= iy < height and grid[iy][ix]:
                    barrier[iy][ix] = 0

    for x, y in cells:
        block(x, y)
    for direction, origin, steps in ((-1, start, start_gap), (1, end, end_gap)):
        for step in range(steps + 1):
            block(origin[0] + tx * direction * step, origin[1] + ty * direction * step)
    seen = bytearray(width * height)
    parts: list[list[tuple[int, int]]] = []
    for y, row in enumerate(barrier):
        for x, value in enumerate(row):
            index = y * width + x
            if not value or seen[index]:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            seen[index] = 1
            part: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                part.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nindex = ny * width + nx
                    if seen[nindex] or not barrier[ny][nx]:
                        continue
                    seen[nindex] = 1
                    queue.append((nx, ny))
            if len(part) * meters_per_pixel * meters_per_pixel >= 8:
                parts.append(part)
    if len(parts) != 2:
        return None
    parts.sort(key=len)
    new_marker = max(int(item.get("marker") or 0) for item in floor.get("rooms") or []) + 1
    pixels = mask.load()
    for x, y in parts[0]:
        pixels[x, y] = new_marker
    child = copy.deepcopy(room)
    floor_index = int(floor.get("floor_index") or 1)
    child["room_id"] = f"f{floor_index}_s{new_marker}"
    child["marker"] = str(new_marker)
    child["function_source"] = "split"
    child["entrance"] = False
    child["layout_hint"] = "按图上没接通的隔墙从原房间拆出，名称先沿用，可以再改。"
    color = _ROOM_COLORS[new_marker % len(_ROOM_COLORS)]
    child["swatch"] = f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"
    rooms = floor.setdefault("rooms", [])
    rooms.append(child)
    return child


def split_interior_walls(floor: dict[str, Any], mask: Image.Image, lines: Image.Image | None) -> int:
    """Split a room when a drawn wall crosses it but stops short of the boundary."""
    if lines is None:
        return 0
    meters_per_pixel = _meters_per_pixel(floor)
    width, height = mask.size
    line_grid = _line_grid(lines.convert("RGBA"), width, height)
    if line_grid is None:
        return 0
    created = 0
    for room in list(floor.get("rooms") or []):
        if _split_one_room(floor, mask, line_grid, room, meters_per_pixel) is not None:
            created += 1
    if created == 0:
        return 0
    square = float(floor.get("square_meters_per_pixel") or meters_per_pixel ** 2)
    total = 0
    measured: list[tuple[dict[str, Any], int]] = []
    for room in floor.get("rooms") or []:
        count, area, marker_x, marker_y = _measure(mask, int(room.get("marker") or 0), square)
        room["area_m2"] = area
        room["marker_x"] = marker_x
        room["marker_y"] = marker_y
        measured.append((room, count))
        total += count
    for room, count in measured:
        room["area_ratio"] = round(count / total, 3) if total else 0
    names = []
    for room in floor.get("rooms") or []:
        if float(room.get("area_ratio") or 0) < 0.005:
            continue
        name = str(room.get("proposal") or room.get("function") or "")
        if name and name not in names:
            names.append(name)
    if names:
        floor["scheme_zh"] = f"方案：{'、'.join(names)}。"
    mask_file = str(floor.get("mask_file") or "")
    if not mask_file:
        return created
    buffer = BytesIO()
    mask.save(buffer, format="PNG")
    write_binary_asset(mask_file, buffer.getvalue())
    try:
        preview = Image.open(BytesIO(read_binary_asset(_preview_relative(mask_file)))).convert("RGB")
    except FileNotFoundError:
        return created
    if preview.size != mask.size:
        preview = preview.resize(mask.size)
    _rewrite_preview(preview, mask, list(floor.get("rooms") or []), lines.convert("RGBA"))
    buffer = BytesIO()
    preview.save(buffer, format="PNG")
    write_binary_asset(_preview_relative(mask_file), buffer.getvalue())
    return created


def write_floor_fitout(payload: dict[str, Any], floor_index: int, *, clear: bool = False) -> dict[str, Any]:
    spaces = payload.get("spaces")
    if not isinstance(spaces, dict):
        raise ValueError("floor_not_found")
    floors = spaces.get("floors") or []
    floor = next((item for item in floors if int(item.get("floor_index") or 0) == floor_index), None)
    if floor is None:
        raise ValueError("floor_not_found")
    fitout = spaces.get("fitout") if isinstance(spaces.get("fitout"), dict) else {"floors": []}
    kept = [item for item in (fitout.get("floors") or []) if int(item.get("floor_index") or 0) != floor_index]
    if not clear:
        mask_image = Image.open(BytesIO(read_binary_asset(str(floor.get("mask_file") or "")))).convert("L")
        line_file = str(floor.get("line_file") or "")
        line_image = Image.open(BytesIO(read_binary_asset(line_file))) if line_file else None
        split_interior_walls(floor, mask_image, line_image)
        built = build_floor_fitout(floor, mask_image, line_image)
        kept.append({"floor_index": floor_index, **built})
    fitout["floors"] = kept
    spaces["fitout"] = fitout
    payload["spaces"] = spaces
    return payload
