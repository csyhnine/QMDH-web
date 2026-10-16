"""Read-only circulation suggestions on a conservative raster clearance grid."""
from __future__ import annotations

import copy
import math
from array import array
from collections import deque
from io import BytesIO
from typing import Any

from PIL import Image, ImageChops, ImageDraw, ImageFilter

from app.services.cad.preparation import save_preparation
from app.services.media_storage import read_binary_asset


def clearance_grid(mask: Image.Image, lines: Image.Image, floor: dict[str, Any], width_m: float) -> bytearray:
    """Square erosion is conservative for the round-ended reserved route footprint.

    Close only tiny segmentation seams; never close gaps in the actual wall image.
    Integral sums keep exact erosion linear even at large calibration radii.
    """
    width, height = mask.size
    if lines.size != mask.size or width * height > 1_200_000:
        raise ValueError("底图尺寸不匹配或超出自动通路支持范围")
    interior = mask.point(lambda value: 255 if value else 0).convert("L")
    interior = interior.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    rgba = lines.convert("RGBA")
    walls = ImageChops.multiply(rgba.convert("L").point(lambda v: 255 if v > 180 else 0), rgba.getchannel("A"))
    allowed = ImageChops.subtract(interior, walls).point(lambda v: 255 if v == 255 else 0)
    # Known stair/lift blocks are excluded even when their interior has no strokes.
    frame = floor.get("geometry") or {}
    draw = ImageDraw.Draw(allowed)
    for anchor in floor.get("anchors") or []:
        if not any(word in str(anchor.get("label") or "") for word in ("楼梯", "电梯", "stair", "lift")):
            continue
        box = anchor.get("bbox") or []
        if len(box) == 4 and frame.get("scale"):
            scale = frame["scale"]
            x0, x1 = [(x - frame["min_x"]) * scale + 4 for x in (box[0], box[2])]
            y0, y1 = [(frame["max_y"] - y) * scale + 4 for y in (box[3], box[1])]
            draw.rectangle((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), fill=0)
    mpp = math.sqrt(floor["square_meters_per_pixel"])
    radius = math.ceil(width_m / (2 * mpp)) + 1
    free = bytearray(width * height)
    if radius * 2 >= min(width, height):
        return free
    stride = width + 1
    sums = array("I", [0]) * (stride * (height + 1))
    pixels = allowed.load()
    for y in range(height):
        total = 0
        for x in range(width):
            total += pixels[x, y] != 255
            sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + total
    for y in range(radius, height - radius):
        top, bottom = (y - radius) * stride, (y + radius + 1) * stride
        for x in range(radius, width - radius):
            left, right = x - radius, x + radius + 1
            if sums[bottom + right] - sums[top + right] - sums[bottom + left] + sums[top + left] == 0:
                free[y * width + x] = 1
    return free


def _neighbors(index: int, width: int, length: int):
    if index % width: yield index - 1
    if index % width < width - 1: yield index + 1
    if index >= width: yield index - width
    if index + width < length: yield index + width


def _components(free: bytearray, width: int) -> array:
    labels = array("i", [-1]) * len(free)
    label = 0
    for start, value in enumerate(free):
        if not value or labels[start] >= 0: continue
        labels[start] = label
        queue = deque([start])
        while queue:
            for node in _neighbors(queue.popleft(), width, len(free)):
                if free[node] and labels[node] < 0:
                    labels[node] = label; queue.append(node)
        label += 1
    return labels


def _targets(mask: Image.Image, free: bytearray, labels: array, rooms: list[dict]) -> dict[str, int]:
    """Use each room's largest usable component, avoiding small enclosed columns."""
    width, _ = mask.size
    marks = {int(r["marker"]): r["room_id"] for r in rooms if r.get("marker")}
    values = mask.tobytes()
    sums: dict[tuple[str, int], list[int]] = {}
    for node, value in enumerate(free):
        room_id = marks.get(values[node])
        if not value or not room_id: continue
        item = sums.setdefault((room_id, labels[node]), [0, 0, 0])
        item[0] += 1; item[1] += node % width; item[2] += node // width
    centers = {}
    for room in rooms:
        choices = [(key, data) for key, data in sums.items() if key[0] == room["room_id"]]
        if choices:
            key, data = max(choices, key=lambda item: item[1][0])
            centers[key[0]] = (key[1], data[1] / data[0], data[2] / data[0])
    targets: dict[str, int] = {}; best: dict[str, float] = {}
    for node, value in enumerate(free):
        room_id = marks.get(values[node]); center = centers.get(room_id)
        if not value or center is None or labels[node] != center[0]: continue
        distance = (node % width - center[1]) ** 2 + (node // width - center[2]) ** 2
        if distance < best.get(room_id, math.inf): best[room_id] = distance; targets[room_id] = node
    return targets


def _turns(path: list[int], width: int, height: int) -> list[dict[str, float]]:
    kept = [path[0]]
    for a, b, c in zip(path, path[1:], path[2:]):
        if b - a != c - b: kept.append(b)
    kept.append(path[-1])
    return [{"x": (n % width + .5) / width, "y": (n // width + .5) / height} for n in kept]


def suggest_routes(payload: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    # Reuse scale/function validation on an isolated copy; never persist suggestions.
    prepared = save_preparation(copy.deepcopy(payload), {**inputs, "routes": []})
    floor = next(f for f in prepared["spaces"]["floors"] if f["floor_index"] == inputs["floor_index"])
    result: dict[str, Any] = {"routes": [], "entry": None, "entry_source": "unavailable", "connected_room_ids": [],
                              "unreachable_room_ids": [], "status": "unavailable", "warnings": []}
    rooms = [r for r in floor.get("rooms", []) if r.get("layout_kind") and r["layout_kind"] != "empty"]
    result["unreachable_room_ids"] = [r["room_id"] for r in rooms]
    if not floor.get("line_file"):
        result["warnings"].append("缺少墙线图，无法自动避让；仍可手动画通路。")
        return result
    mask = Image.open(BytesIO(read_binary_asset(floor["mask_file"]))).convert("L")
    lines = Image.open(BytesIO(read_binary_asset(floor["line_file"])))
    width, height = mask.size
    free = clearance_grid(mask, lines, floor, inputs["width_m"])
    labels = _components(free, width)
    targets = _targets(mask, free, labels, rooms)
    order = sorted(rooms, key=lambda r: (not r.get("entrance"), r.get("layout_kind") != "reception", -float(r.get("area_m2") or 0)))
    entry = inputs.get("entry")
    if entry is not None:
        root = min(height - 1, int(entry["y"] * height)) * width + min(width - 1, int(entry["x"] * width))
        result["entry_source"] = "user"
        if not free[root]:
            result["warnings"].append("指定起点靠墙、在障碍内或净宽不足，请在入口内侧宽敞处重新点选。")
            return result
    else:
        root_room = next((r for r in order if r["room_id"] in targets), None)
        if root_room is None:
            result["warnings"].append("当前宽度下没有可用空间，请核对尺度、调小预留宽度或手动画。")
            return result
        root = targets[root_room["room_id"]]
        result["entry_source"] = "entrance_room" if root_room.get("entrance") else "suggested"
        result["warnings"].append("起点为入口分区内的建议位置，请确认实际门口。" if root_room.get("entrance") else "未识别明确入口，暂以接待区或较大分区为起点；可在图上指定真实起点重算。")
    result["entry"] = {"x": (root % width + .5) / width, "y": (root // width + .5) / height}
    parents = array("i", [-1]) * len(free); distances = array("i", [-1]) * len(free)
    parents[root] = root; distances[root] = 0; queue = deque([root])
    while queue:
        current = queue.popleft()
        for node in _neighbors(current, width, len(free)):
            if free[node] and parents[node] < 0:
                parents[node] = current; distances[node] = distances[current] + 1; queue.append(node)
    tree = {root}; connected = []

    def append_branch(goal: int) -> bool:
        path = [goal]
        while path[-1] not in tree: path.append(parents[path[-1]])
        if len(path) < 2: return True
        path.reverse(); points = _turns(path, width, height)
        chunks = [points[i:i + 30] for i in range(0, len(points) - 1, 29)]
        if len(result["routes"]) + len(chunks) > 12: return False
        result["routes"].extend({"points": chunk, "width_m": inputs["width_m"], "origin": "system"} for chunk in chunks)
        tree.update(path)
        return True

    for room in order:
        goal = targets.get(room["room_id"])
        if goal is not None and parents[goal] >= 0 and append_branch(goal): connected.append(room["room_id"])
    # A single open room still receives a usable internal spine, not a lone dot.
    if not result["routes"] and connected:
        marker = mask.tobytes()[root]
        # Keep the image bytes outside the loop (large masks must remain bounded).
        values = mask.tobytes()
        goal = max((n for n, d in enumerate(distances) if d > 0 and values[n] == marker), key=distances.__getitem__, default=root)
        if goal != root: append_branch(goal)
    result["connected_room_ids"] = connected
    result["unreachable_room_ids"] = [r["room_id"] for r in rooms if r["room_id"] not in connected]
    if result["unreachable_room_ids"]:
        result["warnings"].append("部分分区在当前净宽与墙线下无法连通，未用穿墙直线补接；请核对门洞或手动修改。")
    result["warnings"].append("建议只校验当前图像上的宽度与避障，不代替门洞识别、疏散及实际通行核验。")
    if result["routes"]: result["status"] = "partial" if result["unreachable_room_ids"] else "ok"
    else: result["connected_room_ids"] = []; result["unreachable_room_ids"] = [r["room_id"] for r in rooms]
    return result
