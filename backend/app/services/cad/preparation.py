"""Explicit, per-floor layout inputs. No writes to drawing or mask assets."""
from __future__ import annotations

import hashlib
import json
import math
from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw

from app.services.cad.polygons import attach_room_polygons, frame_of
from app.services.media_storage import read_binary_asset

ROOM_KINDS = {"office", "reception", "meeting", "reading", "activity", "cafe", "toilet", "storage", "empty"}
ROOM_LABELS = dict(zip(("office", "reception", "meeting", "reading", "activity", "cafe", "toilet", "storage", "empty"),
                      ("办公", "接待", "会议", "阅览", "活动", "茶座", "卫生间", "储藏", "保留空白")))


def preparation_state(floor: dict[str, Any]) -> bytes:
    state = {key: floor.get(key) for key in ("geometry", "square_meters_per_pixel", "rooms")}
    return json.dumps(state, sort_keys=True, ensure_ascii=False).encode()


def preparation_signature(floor: dict[str, Any], mask_bytes: bytes) -> str:
    inputs = floor.get("preparation") or {}
    constraints = {key: inputs.get(key) for key in ("calibration", "room_kinds", "routes")}
    if inputs.get("entry") is not None:
        constraints["entry"] = inputs["entry"]
    return hashlib.sha256(mask_bytes + preparation_state(floor) + json.dumps(constraints, sort_keys=True).encode()).hexdigest()


def preparation_current(floor: dict[str, Any]) -> bool:
    return (floor.get("preparation") or {}).get("state_signature") == hashlib.sha256(preparation_state(floor)).hexdigest()


def save_preparation(payload: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    spaces = payload.get("spaces") or {}
    floor = next((f for f in spaces.get("floors", []) if f.get("floor_index") == inputs["floor_index"]), None)
    if floor is None:
        raise ValueError("没有这一层")
    raw = read_binary_asset(str(floor.get("mask_file") or ""))
    mask = Image.open(BytesIO(raw)).convert("L")
    width, height = mask.size
    a, b = inputs["calibration"]["points"]
    pixels = math.hypot((a["x"] - b["x"]) * width, (a["y"] - b["y"]) * height)
    if pixels < 10:
        raise ValueError("校准线太短，请选择相距至少 10 个图像像素的两点")
    mpp = inputs["calibration"]["meters"] / pixels
    if not 0.001 <= mpp <= 1:
        raise ValueError("校准比例超出支持范围，请核对长度单位（米）")
    rooms = floor.get("rooms") or []
    required = {r["room_id"] for r in rooms if float(r.get("area_ratio") or 0) >= 0.005 or r.get("function_source") == "edited"}
    kinds = inputs["room_kinds"]
    known = {r["room_id"] for r in rooms}
    if not required.issubset(kinds) or not set(kinds).issubset(known) or any(k not in ROOM_KINDS for k in kinds.values()):
        raise ValueError("请为每个分区明确选择一种功能，也可以选择保留空白")
    for route in inputs["routes"]:
        points = route["points"]
        if any(math.hypot((a["x"]-b["x"])*width, (a["y"]-b["y"])*height) < .5 for a, b in zip(points, points[1:])):
            raise ValueError("通路相邻点太近，请撤销重复点")
    previous_mpp = math.sqrt(float(floor.get("square_meters_per_pixel") or 0.0025))
    factor = mpp / previous_mpp
    # Preserve undo history while bringing its measurements into the new scale.
    for snap in floor.get("undo_stack") or []:
        for room in snap.get("rooms") or []:
            room["area_m2"] = round(float(room.get("area_m2") or 0) * factor * factor, 2)
            if room.get("polygon"):
                room["polygon"] = [[x * factor, y * factor] for x, y in room["polygon"]]
            usable = room.get("usable")
            if isinstance(usable, dict):
                usable["area_m2"] = round(float(usable.get("area_m2") or 0) * factor * factor, 2)
                usable["polygons"] = [[[x * factor, y * factor] for x, y in ring] for ring in usable.get("polygons", [])]
    frame = frame_of(floor)
    frame["meters_per_unit"] = mpp * frame["scale"]
    floor["geometry"] = frame
    floor["square_meters_per_pixel"] = mpp * mpp
    counts = mask.histogram()
    for room in rooms:
        room["area_m2"] = round(counts[int(room.get("marker") or 0)] * mpp * mpp, 2)
        room.pop("layout_kind", None)
        if room["room_id"] in kinds:
            from app.services.cad.fitout import _layout_kind
            chosen = kinds[room["room_id"]]
            if _layout_kind(room) != chosen or "或" in str(room.get("proposal") or room.get("function") or ""):
                room["proposal"] = ROOM_LABELS[chosen]
            room["layout_kind"] = chosen
    lines = Image.open(BytesIO(read_binary_asset(floor["line_file"]))) if floor.get("line_file") else None
    attach_room_polygons(rooms, mask, floor, lines)
    floor["preparation"] = {**inputs, "version": 1,
                            "state_signature": hashlib.sha256(preparation_state(floor)).hexdigest(),
                            "confirmed_proposals": {r["room_id"]: r.get("proposal") or r.get("function") for r in rooms},
                            "image_width": width, "image_height": height}
    floor["preparation"]["signature"] = preparation_signature(floor, raw)
    floor["scheme_zh"] = "方案：" + "、".join(dict.fromkeys(str(r.get("proposal") or r.get("function") or "") for r in rooms if r["room_id"] in required)) + "。"
    floor["scale_note"] = "本平面已按两点已知长度校准，面积随比例更新。"
    return payload


def require_preparation(floor: dict[str, Any], raw: bytes) -> None:
    prep = floor.get("preparation") or {}
    if prep.get("version") != 1 or prep.get("signature") != preparation_signature(floor, raw):
        raise ValueError("请先保存本层的尺度、明确功能和主通路；分区修改后需要重新确认")


def reserved_route_mask(floor: dict[str, Any], size: tuple[int, int]) -> Image.Image:
    width, height = size
    image = Image.new("L", size, 0)
    draw = ImageDraw.Draw(image)
    mpp = math.sqrt(float(floor.get("square_meters_per_pixel") or 0.0025))
    for route in (floor.get("preparation") or {}).get("routes", []):
        pixels = [(p["x"] * width, p["y"] * height) for p in route["points"]]
        thickness = max(1, math.ceil(route["width_m"] / mpp))
        draw.line(pixels, fill=255, width=thickness, joint="curve")
        radius = thickness / 2
        for x, y in pixels:
            draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=255)
    return image
