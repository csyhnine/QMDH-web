"""Turn a discovered room mask into a meter polygon.

Pixel flood still finds rooms when walls are not closed. After that, each room
keeps an outer ring in drawing meters so later edits can use a real boundary.
The preview image stays the mask.
"""

from __future__ import annotations

import math
from typing import Any

from PIL import Image
from shapely.geometry import Polygon
from shapely.validation import make_valid

_LONG_EDGE = 900
_SIMPLIFY_METERS = 0.15
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


def frame_of(floor: dict[str, Any]) -> dict[str, float]:
    """Return the pixel-to-meter frame, deriving one for older floors."""
    geo = floor.get("geometry")
    if isinstance(geo, dict) and float(geo.get("scale") or 0) > 0 and float(geo.get("meters_per_unit") or 0) > 0:
        return {
            "min_x": float(geo["min_x"]),
            "max_y": float(geo["max_y"]),
            "scale": float(geo["scale"]),
            "meters_per_unit": float(geo["meters_per_unit"]),
        }
    bbox = list(floor.get("bbox") or [0, 0, 1, 1])
    min_x = float(bbox[0])
    min_y = float(bbox[1])
    max_x = float(bbox[2])
    max_y = float(bbox[3])
    span_x = max(max_x - min_x, 1.0)
    span_y = max(max_y - min_y, 1.0)
    scale = _LONG_EDGE / max(span_x, span_y)
    unit_area = float(floor.get("square_meters_per_pixel") or 0)
    meters_per_unit = scale * math.sqrt(unit_area) if unit_area > 0 else 1.0
    derived = {
        "min_x": min_x,
        "max_y": max_y,
        "scale": scale,
        "meters_per_unit": meters_per_unit,
    }
    floor["geometry"] = derived
    return derived


def attach_room_polygons(
    rooms: list[dict[str, Any]],
    mask: Image.Image,
    floor: dict[str, Any],
    lines: Image.Image | None = None,
) -> None:
    frame = frame_of(floor)
    for room in rooms:
        marker = int(room.get("marker") or 0)
        ring = room_ring_meters(mask, marker, frame) if marker else []
        if ring:
            room["polygon"] = ring
        else:
            room.pop("polygon", None)
    from app.services.cad.usable import attach_usable_areas

    attach_usable_areas(rooms, mask, floor, lines, frame)


def room_ring_meters(mask: Image.Image, marker: int, frame: dict[str, float]) -> list[list[float]]:
    grid = _largest_component(mask, marker)
    if grid is None:
        return []
    contour = _trace_contour(grid)
    if len(contour) < 4:
        return []
    ring = [_pixel_to_meters(x + 0.5, y + 0.5, frame) for x, y in contour]
    polygon = Polygon(ring)
    if not polygon.is_valid:
        polygon = make_valid(polygon)
    polygon = _largest_polygon(polygon)
    if polygon is None or polygon.is_empty:
        return []
    simplified = polygon.simplify(_SIMPLIFY_METERS, preserve_topology=True)
    simplified = _largest_polygon(simplified)
    if simplified is None or simplified.area <= 0:
        return []
    return _clean_ring(list(simplified.exterior.coords))


def _pixel_to_meters(px: float, py: float, frame: dict[str, float]) -> tuple[float, float]:
    scale = float(frame["scale"])
    meters = float(frame["meters_per_unit"])
    drawing_x = (px - 4) / scale + float(frame["min_x"])
    drawing_y = float(frame["max_y"]) - (py - 4) / scale
    return drawing_x * meters, drawing_y * meters


def _largest_component(mask: Image.Image, marker: int) -> list[bytearray] | None:
    width, height = mask.size
    pixels = mask.load()
    seen = bytearray(width * height)
    best: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] != marker:
                continue
            stack = [(x, y)]
            seen[index] = 1
            cells: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                cells.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    neighbor = ny * width + nx
                    if seen[neighbor] or pixels[nx, ny] != marker:
                        continue
                    seen[neighbor] = 1
                    stack.append((nx, ny))
            if len(cells) > len(best):
                best = cells
    if len(best) < 4:
        return None
    grid = [bytearray(width) for _ in range(height)]
    for x, y in best:
        grid[y][x] = 1
    return grid


def _trace_contour(grid: list[bytearray]) -> list[tuple[float, float]]:
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


def _largest_polygon(geom: Any) -> Polygon | None:
    if geom is None or geom.is_empty:
        return None
    kind = geom.geom_type
    if kind == "Polygon":
        return geom
    if kind == "MultiPolygon":
        return max(geom.geoms, key=lambda item: item.area)
    if kind == "GeometryCollection":
        polygons = [item for item in geom.geoms if item.geom_type in {"Polygon", "MultiPolygon"} and not item.is_empty]
        if not polygons:
            return None
        return _largest_polygon(max(polygons, key=lambda item: item.area))
    return None


def _clean_ring(coords: list[tuple[float, float]]) -> list[list[float]]:
    cleaned: list[list[float]] = []
    for x, y in coords:
        point = [round(float(x), 3), round(float(y), 3)]
        if cleaned and cleaned[-1] == point:
            continue
        cleaned.append(point)
    if len(cleaned) >= 2 and cleaned[0] != cleaned[-1]:
        cleaned.append(cleaned[0])
    if len(cleaned) < 4 or cleaned[0] != cleaned[-1]:
        return []
    return cleaned
