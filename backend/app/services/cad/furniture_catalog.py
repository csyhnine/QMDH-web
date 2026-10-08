"""Sizes for furniture the layout is allowed to place.

Pieces stay in the groups the scorer already expects. The cafe adds a prep
counter on the staff side of the bar; guest tables are a separate piece.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FurnitureSpec:
    kind: str
    label: str
    group: str
    along_m: float
    depth_m: float


CATALOG: dict[str, FurnitureSpec] = {
    "reception_desk": FurnitureSpec("counter", "服务台", "接待台", 2.4, 0.7),
    "coffee_table": FurnitureSpec("table", "茶几", "洽谈", 1.0, 0.55),
    "sofa": FurnitureSpec("sofa", "沙发", "洽谈", 1.8, 0.85),
    "waiting_seat": FurnitureSpec("seat", "等候座", "等候", 0.55, 0.55),
    "desk": FurnitureSpec("desk", "工位", "工位", 1.4, 0.7),
    "discussion": FurnitureSpec("table", "讨论桌", "讨论", 1.6, 0.85),
    "meeting_table": FurnitureSpec("table", "会议桌", "会议", 1.8, 0.9),
    "reading_table": FurnitureSpec("table", "阅览桌", "阅览", 1.4, 0.75),
    "shelf": FurnitureSpec("shelf", "书架", "书架", 2.0, 0.4),
    "bench": FurnitureSpec("bench", "休息凳", "休息", 1.6, 0.45),
    "bar": FurnitureSpec("counter", "吧台", "备餐", 2.2, 0.65),
    "prep": FurnitureSpec("counter", "操作台", "备餐", 1.4, 0.6),
    "cafe_table": FurnitureSpec("table", "茶座", "茶座", 0.75, 0.75),
}


def spec(name: str) -> FurnitureSpec:
    return CATALOG[name]
