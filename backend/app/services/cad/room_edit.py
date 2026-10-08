"""Manual adjustments to a parsed floor: rename, remove, or repaint a room."""

from __future__ import annotations

import copy
from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw

from app.services.cad.polygons import attach_room_polygons
from app.services.cad.space_layout import _ROOM_COLORS
from app.services.media_storage import get_local_storage, read_binary_asset, resolve_storage_path, write_binary_asset

_UNDO_LIMIT = 20

def _paint(mask: Image.Image, marker: int, strokes: list[dict[str, Any]]) -> None:
    """Fill a closed polygon. Erase only clears the current room inside it."""
    if len(strokes) < 3:
        return
    width, height = mask.size
    points: list[tuple[float, float]] = []
    erase = False
    for stroke in strokes:
        x = min(width - 1, max(0, float(stroke.get("x") or 0) * width))
        y = min(height - 1, max(0, float(stroke.get("y") or 0) * height))
        points.append((x, y))
        erase = erase or bool(stroke.get("erase"))
    if not erase:
        ImageDraw.Draw(mask).polygon(points, fill=marker)
        return
    overlay = Image.new("L", mask.size, 0)
    ImageDraw.Draw(overlay).polygon(points, fill=255)
    mask_pixels = mask.load()
    overlay_pixels = overlay.load()
    for y in range(height):
        for x in range(width):
            if overlay_pixels[x, y] and int(mask_pixels[x, y]) == marker:
                mask_pixels[x, y] = 0


def _scheme_text(rooms: list[dict[str, Any]]) -> str:
    names: list[str] = []
    for room in rooms:
        if float(room.get("area_ratio") or 0) < 0.005:
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


def _swatch_rgb(value: str) -> tuple[int, int, int]:
    text = value.removeprefix("#")
    if len(text) != 6:
        return (180, 180, 180)
    return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))


def _preview_relative(mask_file: str) -> str:
    return mask_file.replace("-mask.png", ".png")


def _line_relative(mask_file: str) -> str:
    return mask_file.replace("-mask.png", "-lines.png")


def _peel_lines(preview: Image.Image) -> Image.Image:
    """Lift the white wall drawing off a combined preview. Color edits never write it back."""
    source = preview.convert("RGB")
    width, height = source.size
    lines = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    source_pixels = source.load()
    line_pixels = lines.load()
    for y in range(height):
        for x in range(width):
            red, green, blue = source_pixels[x, y]
            if red > 230 and green > 230 and blue > 230:
                line_pixels[x, y] = (255, 255, 255, 255)
    return lines


def _rewrite_preview(
    preview: Image.Image,
    mask: Image.Image,
    rooms: list[dict[str, Any]],
    lines: Image.Image,
) -> None:
    colors = {int(room["marker"]): _swatch_rgb(str(room.get("swatch") or "")) for room in rooms if str(room.get("marker") or "").isdigit()}
    preview_pixels = preview.load()
    mask_pixels = mask.load()
    line_pixels = lines.convert("RGBA").load()
    width, height = mask.size
    for y in range(height):
        for x in range(width):
            if int(line_pixels[x, y][3]) > 0:
                preview_pixels[x, y] = (255, 255, 255)
                continue
            marker = int(mask_pixels[x, y])
            if marker:
                preview_pixels[x, y] = colors.get(marker, (180, 180, 180))
                continue
            red, green, blue = preview_pixels[x, y]
            if red > 230 and green > 230 and blue > 230:
                continue
            preview_pixels[x, y] = (12, 12, 12)


def ensure_line_layers(payload: dict[str, Any]) -> bool:
    """Give each floor an immutable wall layer. Existing previews are split once."""
    changed = False
    for floor in (payload.get("spaces") or {}).get("floors") or []:
        mask_file = str(floor.get("mask_file") or "")
        if not mask_file:
            continue
        line_file = _line_relative(mask_file)
        try:
            read_binary_asset(line_file)
        except FileNotFoundError:
            try:
                preview = Image.open(BytesIO(read_binary_asset(_preview_relative(mask_file)))).convert("RGB")
            except FileNotFoundError:
                continue
            buffer = BytesIO()
            _peel_lines(preview).save(buffer, format="PNG")
            write_binary_asset(line_file, buffer.getvalue())
        if floor.get("line_file") != line_file:
            floor["line_file"] = line_file
            changed = True
        line_path = resolve_storage_path(line_file)
        if floor.get("line_path") != line_path:
            floor["line_path"] = line_path
            changed = True
    return changed


def _measure(mask: Image.Image, marker: int, square_meters: float) -> tuple[int, float, float, float]:
    pixels = mask.load()
    width, height = mask.size
    count = 0
    sum_x = 0
    sum_y = 0
    for y in range(height):
        for x in range(width):
            if int(pixels[x, y]) != marker:
                continue
            count += 1
            sum_x += x
            sum_y += y
    if not count:
        return 0, 0.0, 0.0, 0.0
    return count, round(count * square_meters, 2), round((sum_x / count) / width, 4), round((sum_y / count) / height, 4)


def _discard_asset(relative_path: str) -> None:
    if not relative_path:
        return
    try:
        target = get_local_storage()._resolved_file(relative_path)
    except ValueError:
        return
    if target.is_file():
        target.unlink()


def _push_undo(floor: dict[str, Any], mask_file: str) -> None:
    preview_rel = _preview_relative(mask_file)
    seq = int(floor.get("undo_seq") or 0) + 1
    floor["undo_seq"] = seq
    mask_undo = mask_file.replace("-mask.png", f"-undo-{seq}-mask.png")
    preview_undo = mask_file.replace("-mask.png", f"-undo-{seq}.png")
    write_binary_asset(mask_undo, read_binary_asset(mask_file))
    write_binary_asset(preview_undo, read_binary_asset(preview_rel))
    stack = list(floor.get("undo_stack") or [])
    stack.append(
        {
            "rooms": copy.deepcopy(list(floor.get("rooms") or [])),
            "scheme_zh": floor.get("scheme_zh") or "",
            "mask_file": mask_undo,
            "preview_file": preview_undo,
        }
    )
    while len(stack) > _UNDO_LIMIT:
        _discard_asset(str(stack[0].get("mask_file") or ""))
        _discard_asset(str(stack[0].get("preview_file") or ""))
        stack.pop(0)
    floor["undo_stack"] = stack
    floor["undo_count"] = len(stack)


def undo_floor_edit(payload: dict[str, Any], *, floor_index: int) -> dict[str, Any]:
    floors = (payload.get("spaces") or {}).get("floors") or []
    floor = next((item for item in floors if int(item.get("floor_index") or 0) == floor_index), None)
    if floor is None:
        raise ValueError("floor_not_found")
    stack = list(floor.get("undo_stack") or [])
    if not stack:
        raise ValueError("nothing_to_undo")
    snap = stack.pop()
    mask_file = str(floor.get("mask_file") or "")
    if not mask_file:
        raise ValueError("mask_missing")
    preview_rel = _preview_relative(mask_file)
    write_binary_asset(mask_file, read_binary_asset(str(snap["mask_file"])))
    write_binary_asset(preview_rel, read_binary_asset(str(snap["preview_file"])))
    _discard_asset(str(snap.get("mask_file") or ""))
    _discard_asset(str(snap.get("preview_file") or ""))
    floor["rooms"] = snap.get("rooms") or []
    floor["scheme_zh"] = snap.get("scheme_zh") or ""
    floor["undo_stack"] = stack
    floor["undo_count"] = len(stack)
    version = int(floor.get("preview_version") or 0) + 1
    floor["preview_version"] = version
    base = str(floor.get("preview_path") or "").split("?", 1)[0]
    if base:
        floor["preview_path"] = f"{base}?v={version}"
    return payload


def _lines_image(floor: dict[str, Any]) -> Image.Image | None:
    line_file = str(floor.get("line_file") or "")
    if not line_file:
        mask_file = str(floor.get("mask_file") or "")
        line_file = _line_relative(mask_file) if mask_file else ""
    if not line_file:
        return None
    try:
        return Image.open(BytesIO(read_binary_asset(line_file))).convert("L")
    except Exception:
        return None


def _sync_areas(rooms: list[dict[str, Any]], mask: Image.Image, floor: dict[str, Any]) -> list[dict[str, Any]]:
    square = float(floor.get("square_meters_per_pixel") or 0)
    kept: list[tuple[dict[str, Any], int]] = []
    for item in rooms:
        count, area_m2, marker_x, marker_y = _measure(mask, int(item.get("marker") or 0), square)
        if count == 0:
            continue
        item["area_m2"] = area_m2
        item["marker_x"] = marker_x
        item["marker_y"] = marker_y
        kept.append((item, count))
    total = sum(count for _, count in kept) or 1
    for item, count in kept:
        item["area_ratio"] = round(count / total, 3)
    kept_rooms = [item for item, _ in kept]
    attach_room_polygons(kept_rooms, mask, floor, _lines_image(floor))
    return kept_rooms


def _next_marker(rooms: list[dict[str, Any]]) -> int:
    used = {int(item.get("marker") or 0) for item in rooms}
    marker = 1
    while marker in used:
        marker += 1
    if marker > 250:
        raise ValueError("too_many_rooms")
    return marker


def _next_room_id(rooms: list[dict[str, Any]], floor_index: int) -> str:
    used = {str(item.get("room_id") or "") for item in rooms}
    number = 1
    while f"f{floor_index}_n{number}" in used:
        number += 1
    return f"f{floor_index}_n{number}"


def adjust_floor_room(
    payload: dict[str, Any],
    *,
    floor_index: int,
    room_id: str,
    action: str,
    proposal: str | None = None,
    strokes: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    ensure_line_layers(payload)
    floors = ((payload.get("spaces") or {}).get("floors") or [])
    floor = next((item for item in floors if int(item.get("floor_index") or 0) == floor_index), None)
    if floor is None:
        raise ValueError("floor_not_found")
    rooms = list(floor.get("rooms") or [])
    room = next((item for item in rooms if item.get("room_id") == room_id), None)
    if action != "create" and room is None:
        raise ValueError("room_not_found")
    mask_file = str(floor.get("mask_file") or "")
    if not mask_file:
        raise ValueError("mask_missing")
    if action in {"paint", "create"} and len(strokes or []) < 3:
        raise ValueError("polygon_required")
    _push_undo(floor, mask_file)

    if action == "rename":
        name = (proposal or "").strip()
        if not name:
            raise ValueError("proposal_required")
        room["proposal"] = name[:40]
        room["function_source"] = "edited"
        room["layout_hint"] = "这是手动改过的功能。"
        floor["scheme_zh"] = _scheme_text(rooms)
        floor["rooms"] = rooms
        return payload

    mask = Image.open(BytesIO(read_binary_asset(mask_file))).convert("L")
    preview_rel = _preview_relative(mask_file)
    preview = Image.open(BytesIO(read_binary_asset(preview_rel))).convert("RGB")
    marker = int(room.get("marker") or 0) if room is not None else 0
    if action == "remove":
        pixels = mask.load()
        width, height = mask.size
        for y in range(height):
            for x in range(width):
                if int(pixels[x, y]) == marker:
                    pixels[x, y] = 0
        rooms = [item for item in rooms if item.get("room_id") != room_id]
    elif action == "paint":
        _paint(mask, marker, strokes or [])
        if room is not None:
            room["function_source"] = "edited"
        rooms = _sync_areas(rooms, mask, floor)
    elif action == "create":
        new_marker = _next_marker(rooms)
        _paint(mask, new_marker, strokes or [])
        color = _ROOM_COLORS[(new_marker - 1) % len(_ROOM_COLORS)]
        name = ((proposal or "").strip() or "新分区")[:40]
        rooms.append(
            {
                "room_id": _next_room_id(rooms, floor_index),
                "area_ratio": 0,
                "area_m2": 0,
                "marker": str(new_marker),
                "swatch": f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}",
                "entrance": False,
                "function": "",
                "proposal": name,
                "function_source": "edited",
                "zoning": {"role": "辅助", "activity": "静", "hygiene": "中性"},
                "adjacent_room_ids": [],
                "layout_hint": "这是手动新建的分区。",
            }
        )
        rooms = _sync_areas(rooms, mask, floor)
        if not any(int(item.get("marker") or 0) == new_marker for item in rooms):
            raise ValueError("empty_polygon")
    else:
        raise ValueError("bad_action")

    line_file = str(floor.get("line_file") or _line_relative(mask_file))
    lines = Image.open(BytesIO(read_binary_asset(line_file))).convert("RGBA")
    _rewrite_preview(preview, mask, rooms, lines)
    preview_buffer = BytesIO()
    mask_buffer = BytesIO()
    preview.save(preview_buffer, format="PNG")
    mask.save(mask_buffer, format="PNG")
    write_binary_asset(preview_rel, preview_buffer.getvalue())
    write_binary_asset(mask_file, mask_buffer.getvalue())
    version = int(floor.get("preview_version") or 0) + 1
    floor["preview_version"] = version
    base = str(floor.get("preview_path") or "").split("?", 1)[0]
    floor["preview_path"] = f"{base}?v={version}"
    floor["scheme_zh"] = _scheme_text(rooms)
    floor["rooms"] = rooms
    return payload


def save_program_review(payload: dict[str, Any], notes: dict[str, Any] | None) -> dict[str, Any]:
    """Store review comments on the extract. Empty text drops that note."""
    cleaned: dict[str, str] = {}
    for key, value in (notes or {}).items():
        if len(cleaned) >= 40:
            break
        if not isinstance(key, str) or not key or len(key) > 40:
            continue
        if any(not (char.isalnum() or char in "_-") for char in key):
            continue
        text = str(value or "").strip()
        if not text:
            continue
        cleaned[key] = text[:500]
    spaces = payload.get("spaces")
    if not isinstance(spaces, dict):
        spaces = {}
        payload["spaces"] = spaces
    spaces["program_review"] = {"notes": cleaned}
    return payload
