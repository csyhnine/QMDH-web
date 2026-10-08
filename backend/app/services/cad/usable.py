"""Placeable area inside a room polygon.

The room ring is the outer boundary. Usable area is that ring pulled off the
wall, then minus columns, door swings, enclosed holes such as stairs, and one
aisle in a large room. Furniture placement still uses the pixel plan.
"""

from __future__ import annotations

import math
from typing import Any

from PIL import Image, ImageFilter
from shapely.geometry import Polygon
from shapely.validation import make_valid

from app.services.cad.polygons import _clean_ring, _largest_polygon, _pixel_to_meters, _trace_contour

_WALL_CLEARANCE_M = 0.15
_AISLE_WIDTH_M = 1.1
_AISLE_MIN_SHORT_M = 4.2
_AISLE_MIN_AREA_M2 = 36.0
_HOLE_MIN_M2 = 0.4


def attach_usable_areas(
    rooms: list[dict[str, Any]],
    mask: Image.Image,
    floor: dict[str, Any],
    lines: Image.Image | None,
    frame: dict[str, float],
) -> None:
    holes = _hole_polygons(mask, frame)
    obstacles = _obstacle_polygons(mask, lines, frame) if lines is not None and lines.size == mask.size else []
    blockers = holes + obstacles
    for room in rooms:
        ring = room.get("polygon") or []
        if len(ring) < 4:
            room.pop("usable", None)
            continue
        room["usable"] = usable_region(ring, blockers)


def usable_region(ring: list[list[float]], blockers: list[Polygon]) -> dict[str, Any]:
    room = _as_polygon(Polygon(ring))
    if room is None:
        return {"area_m2": 0, "polygons": []}
    placeable = room.buffer(-_WALL_CLEARANCE_M)
    if placeable.is_empty or placeable.area < 0.8:
        placeable = room.buffer(-0.05)
    if placeable.is_empty:
        placeable = room
    for blocker in blockers:
        if blocker.is_empty or not placeable.intersects(blocker):
            continue
        placeable = placeable.difference(blocker)
    pieces = [item for item in _pieces(placeable) if item.area >= 0.5]
    if not pieces:
        pieces = _pieces(placeable)
    if not pieces:
        return {"area_m2": 0, "polygons": []}
    pieces.sort(key=lambda item: item.area, reverse=True)
    host = pieces[0]
    aisle = _aisle(host)
    if aisle is not None and host.intersects(aisle):
        carved = [item for item in _pieces(host.difference(aisle)) if item.area >= 0.5]
        carved_area = sum(item.area for item in carved)
        if carved and carved_area >= host.area * 0.55:
            pieces = carved + pieces[1:]
            pieces.sort(key=lambda item: item.area, reverse=True)
    kept = pieces[:6]
    rings: list[list[list[float]]] = []
    area = 0.0
    for piece in kept:
        simplified = _as_polygon(piece.simplify(0.12, preserve_topology=True))
        if simplified is None:
            continue
        ring_out = _clean_ring(list(simplified.exterior.coords))
        if not ring_out:
            continue
        rings.append(ring_out)
        area += simplified.area
    return {"area_m2": round(area, 2), "polygons": rings}


def _obstacle_polygons(mask: Image.Image, lines: Image.Image, frame: dict[str, float]) -> list[Polygon]:
    """Columns deep inside a room, and smaller swings in the band just off the wall."""
    mpp = _meters_per_pixel(frame)
    if mpp <= 0:
        return []
    rooms = _rooms_image(mask)
    line = _line_image(lines)
    deep = _erode(rooms, _px(0.55, mpp))
    columns = _closed_components(
        _close(_and_images(deep, line), _px(0.35, mpp)),
        frame,
        minimum_m2=0.08,
        maximum_m2=2.5,
    )
    band = _subtract(_erode(rooms, _px(0.22, mpp)), deep)
    swings = _closed_components(
        _close(_and_images(band, line), _px(0.25, mpp)),
        frame,
        minimum_m2=0.15,
        maximum_m2=1.6,
    )
    found: list[Polygon] = []
    for polygon in columns:
        grown = _as_polygon(polygon.buffer(0.2))
        if grown is not None:
            found.append(grown)
    for polygon in swings:
        grown = _as_polygon(polygon.buffer(0.05))
        if grown is not None:
            found.append(grown)
    return found


def _hole_polygons(mask: Image.Image, frame: dict[str, float]) -> list[Polygon]:
    mpp = _meters_per_pixel(frame)
    if mpp <= 0:
        return []
    width, height = mask.size
    pixels = mask.load()
    outside = bytearray(width * height)
    stack: list[tuple[int, int]] = []
    for x in range(width):
        stack.append((x, 0))
        stack.append((x, height - 1))
    for y in range(height):
        stack.append((0, y))
        stack.append((width - 1, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= width or y >= height:
            continue
        index = y * width + x
        if outside[index] or pixels[x, y] != 0:
            continue
        outside[index] = 1
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    holes = Image.new("L", (width, height), 0)
    hole_pixels = holes.load()
    for y in range(height):
        for x in range(width):
            if pixels[x, y] == 0 and not outside[y * width + x]:
                hole_pixels[x, y] = 255
    return _closed_components(holes, frame, minimum_m2=_HOLE_MIN_M2, maximum_m2=40)


def _closed_components(image: Image.Image, frame: dict[str, float], *, minimum_m2: float, maximum_m2: float) -> list[Polygon]:
    mpp = _meters_per_pixel(frame)
    cell = mpp * mpp
    if cell <= 0:
        return []
    width, height = image.size
    pixels = image.load()
    seen = bytearray(width * height)
    found: list[Polygon] = []
    min_cells = max(4, int(minimum_m2 / cell))
    max_cells = max(min_cells, int(maximum_m2 / cell))
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not pixels[x, y]:
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
                    if seen[neighbor] or not pixels[nx, ny]:
                        continue
                    seen[neighbor] = 1
                    stack.append((nx, ny))
            if not (min_cells <= len(cells) <= max_cells):
                continue
            grid = [bytearray(width) for _ in range(height)]
            for cx, cy in cells:
                grid[cy][cx] = 1
            contour = _trace_contour(grid)
            if len(contour) < 4:
                continue
            ring = [_pixel_to_meters(px + 0.5, py + 0.5, frame) for px, py in contour]
            polygon = _as_polygon(Polygon(ring))
            if polygon is not None and polygon.area > 0:
                found.append(polygon)
    return found


def _aisle(polygon: Polygon) -> Polygon | None:
    if polygon.area < _AISLE_MIN_AREA_M2:
        return None
    rect = polygon.minimum_rotated_rectangle
    coords = list(rect.exterior.coords)
    if len(coords) < 5:
        return None
    edges: list[tuple[float, float, float, float, float]] = []
    for index in range(4):
        ax, ay = coords[index]
        bx, by = coords[index + 1]
        edges.append((math.hypot(bx - ax, by - ay), ax, ay, bx, by))
    edges.sort(key=lambda item: item[0], reverse=True)
    long_len, ax, ay, bx, by = edges[0]
    short_len = edges[-1][0]
    if short_len < _AISLE_MIN_SHORT_M or long_len < _AISLE_WIDTH_M + 1:
        return None
    length = max(long_len - 1.0, _AISLE_WIDTH_M)
    angle = math.atan2(by - ay, bx - ax)
    cx = sum(coords[index][0] for index in range(4)) / 4
    cy = sum(coords[index][1] for index in range(4)) / 4
    hx = math.cos(angle) * length / 2
    hy = math.sin(angle) * length / 2
    px = -math.sin(angle) * _AISLE_WIDTH_M / 2
    py = math.cos(angle) * _AISLE_WIDTH_M / 2
    return Polygon(
        [
            (cx - hx + px, cy - hy + py),
            (cx + hx + px, cy + hy + py),
            (cx + hx - px, cy + hy - py),
            (cx - hx - px, cy - hy - py),
        ]
    )


def _rooms_image(mask: Image.Image) -> Image.Image:
    width, height = mask.size
    pixels = mask.load()
    image = Image.new("L", (width, height), 0)
    out = image.load()
    for y in range(height):
        for x in range(width):
            if pixels[x, y]:
                out[x, y] = 255
    return image


def _line_image(lines: Image.Image) -> Image.Image:
    gray = lines.convert("L")
    pixels = gray.load()
    image = Image.new("L", gray.size, 0)
    out = image.load()
    width, height = gray.size
    for y in range(height):
        for x in range(width):
            if pixels[x, y] > 200:
                out[x, y] = 255
    return image


def _and_images(left: Image.Image, right: Image.Image) -> Image.Image:
    width, height = left.size
    a = left.load()
    b = right.load()
    image = Image.new("L", (width, height), 0)
    out = image.load()
    for y in range(height):
        for x in range(width):
            if a[x, y] and b[x, y]:
                out[x, y] = 255
    return image


def _subtract(left: Image.Image, right: Image.Image) -> Image.Image:
    width, height = left.size
    a = left.load()
    b = right.load()
    image = Image.new("L", (width, height), 0)
    out = image.load()
    for y in range(height):
        for x in range(width):
            if a[x, y] and not b[x, y]:
                out[x, y] = 255
    return image


def _close(image: Image.Image, radius: int) -> Image.Image:
    return _erode(_dilate(image, radius), radius)


def _dilate(image: Image.Image, radius: int) -> Image.Image:
    return _morph(image, radius, ImageFilter.MaxFilter)


def _erode(image: Image.Image, radius: int) -> Image.Image:
    return _morph(image, radius, ImageFilter.MinFilter)


def _morph(image: Image.Image, radius: int, kind: type[ImageFilter.MinFilter] | type[ImageFilter.MaxFilter]) -> Image.Image:
    radius = int(radius)
    if radius < 1:
        return image
    if radius <= 12:
        return image.filter(kind(radius * 2 + 1))
    factor = radius / 8
    small = image.resize(
        (max(1, int(image.width / factor)), max(1, int(image.height / factor))),
        Image.Resampling.NEAREST,
    )
    small = small.filter(kind(17))
    return small.resize(image.size, Image.Resampling.NEAREST)


def _px(meters: float, meters_per_pixel: float) -> int:
    return max(1, int(round(meters / meters_per_pixel)))


def _meters_per_pixel(frame: dict[str, float]) -> float:
    scale = float(frame.get("scale") or 0)
    if scale <= 0:
        return 0
    return float(frame.get("meters_per_unit") or 0) / scale


def _as_polygon(geom: Any) -> Polygon | None:
    polygon = _largest_polygon(geom if getattr(geom, "is_valid", True) else make_valid(geom))
    if polygon is None:
        return None
    if not polygon.is_valid:
        polygon = _largest_polygon(make_valid(polygon))
    return polygon


def _pieces(geom: Any) -> list[Polygon]:
    prepared = geom if getattr(geom, "is_valid", False) else make_valid(geom)
    if prepared is None or prepared.is_empty:
        return []
    kind = prepared.geom_type
    if kind == "Polygon":
        return [prepared]
    if kind == "MultiPolygon":
        return [item for item in prepared.geoms if not item.is_empty]
    if kind == "GeometryCollection":
        found: list[Polygon] = []
        for item in prepared.geoms:
            found.extend(_pieces(item))
        return found
    return []
