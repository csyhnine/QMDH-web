"""Ask a text model to rename rooms from saved review notes. Boundaries stay put."""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.cad.room_edit import adjust_floor_room

_ACTIVITIES = {"静", "动", "中性"}
_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*\})\s*```", re.DOTALL)

SYSTEM_PROMPT = """你是居委会平面的功能编排。只根据给定的房间面积、现名和审查意见，决定功能名称和动静。
不要改边界，不要输出坐标，不要布置家具。
只把有审查意见的房间放进 items。没有意见的房间不要出现。整图意见如果点名了某间，可以改那间。
proposal 不超过 20 个字，优先沿用意见里的叫法。activity 只能是 静、动、中性。
reason 只用一句话，说明为什么这样排。人数和座位数是布置估计，不要写成规范。
split_hint 只在必须改边界时填写，例如「建议从这间隔出约 8–12㎡ 卫生间」。不需要改边界时用空字符串。不要写画法。
名称和动静都已经符合意见时，不要再输出这间。
只输出 JSON，不要写别的文字：{"items":[{"room_id":"","proposal":"","activity":"静","reason":"","split_hint":""}]}"""


def _listed_rooms(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    floors = ((payload.get("spaces") or {}).get("floors") or []) if isinstance(payload.get("spaces"), dict) else []
    for floor in floors:
        if not isinstance(floor, dict):
            continue
        for room in floor.get("rooms") or []:
            if not isinstance(room, dict):
                continue
            listed = float(room.get("area_ratio") or 0) >= 0.005 or room.get("function_source") == "edited"
            if not listed:
                continue
            zoning = room.get("zoning") if isinstance(room.get("zoning"), dict) else {}
            rows.append(
                {
                    "room_id": str(room.get("room_id") or ""),
                    "floor_index": int(floor.get("floor_index") or 0),
                    "floor_label": str(floor.get("label") or f"平面 {floor.get('floor_index') or ''}"),
                    "marker": str(room.get("marker") or ""),
                    "name": str(room.get("proposal") or room.get("function") or "待分区"),
                    "activity": str((zoning or {}).get("activity") or "中性"),
                    "area_m2": room.get("area_m2") or 0,
                    "entrance": bool(room.get("entrance")),
                    "hygiene": str((zoning or {}).get("hygiene") or "中性"),
                }
            )
    return [row for row in rows if row["room_id"]]


def _notes(payload: dict[str, Any]) -> dict[str, str]:
    spaces = payload.get("spaces") if isinstance(payload.get("spaces"), dict) else {}
    review = spaces.get("program_review") if isinstance(spaces, dict) else {}
    raw = review.get("notes") if isinstance(review, dict) else {}
    if not isinstance(raw, dict):
        return {}
    return {str(key): str(value or "").strip() for key, value in raw.items() if str(value or "").strip()}


def _eligible_ids(rooms: list[dict[str, Any]], notes: dict[str, str]) -> set[str]:
    if notes.get("general"):
        return {row["room_id"] for row in rooms}
    return {row["room_id"] for row in rooms if notes.get(row["room_id"])}


def has_rearrange_notes(payload: dict[str, Any]) -> bool:
    return bool(_eligible_ids(_listed_rooms(payload), _notes(payload)))


def build_rearrange_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    notes = _notes(payload)
    rooms = _listed_rooms(payload)
    eligible = _eligible_ids(rooms, notes)
    brief = []
    for room in rooms:
        brief.append(
            {
                "room_id": room["room_id"],
                "floor": room["floor_label"],
                "marker": room["marker"],
                "area_m2": room["area_m2"],
                "name": room["name"],
                "activity": room["activity"],
                "entrance": room["entrance"],
                "hygiene": room["hygiene"],
                "note": notes.get(room["room_id"]) or "",
                "may_change": room["room_id"] in eligible,
            }
        )
    user = {
        "general_note": notes.get("general") or "",
        "rooms": brief,
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]


def _load_object(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    fenced = _FENCE_RE.search(cleaned)
    if fenced:
        cleaned = fenced.group(1)
    else:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            cleaned = cleaned[start : end + 1]
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError("model_output") from exc
    if not isinstance(data, dict):
        raise ValueError("model_output")
    return data


def parse_rearrange_text(text: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    notes = _notes(payload)
    rooms = {row["room_id"]: row for row in _listed_rooms(payload)}
    eligible = _eligible_ids(list(rooms.values()), notes)
    if not eligible:
        raise ValueError("no_notes")
    data = _load_object(text)
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("model_output")
    parsed: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_items:
        if not isinstance(item, dict) or len(parsed) >= 40:
            continue
        room_id = str(item.get("room_id") or "").strip()
        room = rooms.get(room_id)
        if room is None or room_id not in eligible or room_id in seen:
            continue
        proposal = str(item.get("proposal") or "").strip()[:40]
        activity = str(item.get("activity") or "").strip()
        reason = str(item.get("reason") or "").strip()[:80]
        split_hint = str(item.get("split_hint") or "").strip()[:80]
        if not proposal or activity not in _ACTIVITIES or not reason:
            continue
        unchanged = proposal == room["name"] and activity == room["activity"] and not split_hint
        if unchanged:
            continue
        seen.add(room_id)
        parsed.append(
            {
                "floor_index": room["floor_index"],
                "floor_label": room["floor_label"],
                "room_id": room_id,
                "marker": room["marker"],
                "current_name": room["name"],
                "current_activity": room["activity"],
                "proposal": proposal,
                "activity": activity,
                "reason": reason,
                "split_hint": split_hint,
            }
        )
    return parsed


def apply_program_changes(payload: dict[str, Any], items: list[dict[str, Any]]) -> dict[str, Any]:
    """Rename and set 动静. Masks and wall lines are not edited."""
    rooms = {row["room_id"]: row for row in _listed_rooms(payload)}
    applied = 0
    for item in items:
        if applied >= 40:
            break
        room_id = str(item.get("room_id") or "").strip()
        room = rooms.get(room_id)
        proposal = str(item.get("proposal") or "").strip()[:40]
        activity = str(item.get("activity") or "").strip()
        reason = str(item.get("reason") or "").strip()[:80]
        if room is None or not proposal or activity not in _ACTIVITIES:
            continue
        payload = adjust_floor_room(
            payload,
            floor_index=int(room["floor_index"]),
            room_id=room_id,
            action="rename",
            proposal=proposal,
        )
        floor = next(
            entry
            for entry in payload["spaces"]["floors"]
            if int(entry.get("floor_index") or 0) == int(room["floor_index"])
        )
        target = next(entry for entry in floor["rooms"] if entry.get("room_id") == room_id)
        zoning = dict(target.get("zoning") or {})
        zoning["activity"] = activity
        target["zoning"] = zoning
        if reason:
            target["layout_hint"] = reason
        target["function_source"] = "edited"
        rooms[room_id] = {**room, "name": proposal, "activity": activity}
        applied += 1
    if applied == 0:
        raise ValueError("nothing_to_apply")
    return payload
