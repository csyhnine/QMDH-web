import base64
import io
import unittest

import ezdxf
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.security import hash_password
from app.database import Base, get_db
from app.models import User
from app.routers import auth, cad
from app.services.cad.dxf_reader import parse_dxf_bytes
from app.services.cad.text_extractor import bucket_text_label


def _build_sample_dxf_bytes() -> bytes:
    doc = ezdxf.new("R2010")
    doc.header["$INSUNITS"] = 4  # This fixture uses millimetres.
    msp = doc.modelspace()
    msp.add_line((0, 0), (5000, 0), dxfattribs={"layer": "A-WALL"})
    msp.add_line((5000, 0), (5000, 4000), dxfattribs={"layer": "A-WALL"})
    msp.add_lwpolyline([(0, 4000), (5000, 4000), (5000, 0)], dxfattribs={"layer": "A-WALL"})
    msp.add_text("会议室", dxfattribs={"layer": "PUB_TEXT", "height": 250}).set_placement((1200, 2200))
    msp.add_text("3000", dxfattribs={"layer": "DIM", "height": 200}).set_placement((2500, 200))
    stream = io.StringIO()
    doc.write(stream)
    return stream.getvalue().encode("utf-8")


def _to_data_url(content: bytes, *, mime: str = "application/dxf") -> str:
    encoded = base64.b64encode(content).decode("ascii")
    return f"data:{mime};base64,{encoded}"


class CadExtractServiceTests(unittest.TestCase):
    def test_parse_dxf_extracts_layers_and_room_labels(self) -> None:
        parsed = parse_dxf_bytes(_build_sample_dxf_bytes(), source_file_name="plan.dxf", max_entities=10_000)
        payload = parsed.payload
        layer_names = {item["name"] for item in payload["layers"]}
        self.assertIn("A-WALL", layer_names)
        self.assertIn("会议室", payload["texts"]["room_labels"])
        self.assertIn("3000", payload["texts"]["dimensions"])
        self.assertTrue(any(item["role"] == "wall" for item in payload["layers"] if item["name"] == "A-WALL"))

    def test_closed_rectangle_becomes_an_unassigned_room(self) -> None:
        doc = ezdxf.new("R2010")
        doc.header["$INSUNITS"] = 4  # This fixture uses millimetres.
        doc.modelspace().add_lwpolyline([(0, 0), (4000, 0), (4000, 3000), (0, 3000)], close=True)
        stream = io.StringIO()
        doc.write(stream)
        parsed = parse_dxf_bytes(stream.getvalue().encode("utf-8"), source_file_name="room.dxf", max_entities=10_000)
        floors = parsed.payload["spaces"]["floors"]
        self.assertEqual(len(floors), 1)
        self.assertGreaterEqual(len(floors[0]["rooms"]), 1)
        self.assertEqual(floors[0]["rooms"][0]["function_source"], "unassigned")
        self.assertEqual(floors[0]["rooms"][0]["zoning"]["activity"], "静")
        self.assertAlmostEqual(floors[0]["rooms"][0]["area_m2"], 12.0, delta=1.5)
        ring = floors[0]["rooms"][0]["polygon"]
        self.assertGreaterEqual(len(ring), 4)
        self.assertEqual(ring[0], ring[-1])
        self.assertLess(max(abs(value) for point in ring for value in point), 20)
        from shapely.geometry import Polygon

        self.assertAlmostEqual(Polygon(ring).area, 12.0, delta=2.0)
        usable = floors[0]["rooms"][0]["usable"]
        self.assertGreater(usable["area_m2"], 7)
        self.assertLess(usable["area_m2"], floors[0]["rooms"][0]["area_m2"])
        self.assertGreaterEqual(len(usable["polygons"][0]), 4)
        self.assertGreater(floors[0]["geometry"]["scale"], 0)
        self.assertEqual(floors[0]["rooms"][0]["proposal"], "办公或会议")
        self.assertIn("方案", floors[0]["scheme_zh"])
        self.assertEqual(floors[0]["rooms"][0]["zoning"]["hygiene"], "中性")
        self.assertIn("没有层间对应", parsed.payload["spaces"]["relations_zh"])

    def test_usable_area_keeps_out_a_column_and_an_aisle(self) -> None:
        from PIL import Image, ImageDraw
        from shapely.geometry import Polygon

        from app.services.cad.usable import _hole_polygons, _obstacle_polygons, usable_region

        mask = Image.new("L", (220, 180), 0)
        ImageDraw.Draw(mask).rectangle((20, 20, 219, 179), fill=1)
        ImageDraw.Draw(mask).rectangle((70, 70, 110, 110), fill=0)
        lines = Image.new("L", (220, 180), 0)
        ImageDraw.Draw(lines).rectangle((150, 90, 166, 106), fill=255)
        frame = {"min_x": 0.0, "max_y": 8.0, "scale": 20.0, "meters_per_unit": 1.0}
        ring = [[0.8, -0.8], [10.8, -0.8], [10.8, 7.2], [0.8, 7.2], [0.8, -0.8]]
        blockers = _obstacle_polygons(mask, lines, frame)
        blockers.extend(_hole_polygons(mask, frame))
        usable = usable_region(ring, blockers)
        self.assertGreaterEqual(len(blockers), 2)
        self.assertGreater(usable["area_m2"], 40)
        self.assertLess(usable["area_m2"], Polygon(ring).area - 8)

    def test_toilet_marks_dirty_side_and_stacked_cores_align(self) -> None:
        doc = ezdxf.new("R2010")
        doc.header["$INSUNITS"] = 4  # This fixture uses millimetres.
        floor_a = doc.blocks.new("FLOOR_A")
        floor_a.add_lwpolyline([(0, 0), (10000, 0), (10000, 8000), (0, 8000)], close=True)
        floor_a.add_line((6000, 0), (6000, 8000))
        floor_b = doc.blocks.new("FLOOR_B")
        floor_b.add_lwpolyline([(0, 0), (10000, 0), (10000, 8000), (0, 8000)], close=True)
        stair = doc.blocks.new("STAIR")
        stair.add_lwpolyline([(0, 0), (500, 0), (500, 900), (0, 900)], close=True)
        toilet = doc.blocks.new("WC")
        toilet.add_lwpolyline([(0, 0), (900, 0), (900, 700), (0, 700)], close=True)
        msp = doc.modelspace()
        msp.add_blockref("FLOOR_A", (0, 0))
        msp.add_blockref("FLOOR_B", (20000, 0))
        msp.add_blockref("STAIR", (400, 400), dxfattribs={"layer": "楼梯"})
        msp.add_blockref("STAIR", (20400, 400), dxfattribs={"layer": "楼梯"})
        msp.add_blockref("WC", (800, 800), dxfattribs={"layer": "卫生间"})
        stream = io.StringIO()
        doc.write(stream)
        parsed = parse_dxf_bytes(stream.getvalue().encode("utf-8"), source_file_name="zones.dxf", max_entities=10_000)
        spaces = parsed.payload["spaces"]
        self.assertEqual(len(spaces["floors"]), 2)
        first_floor_rooms = spaces["floors"][0]["rooms"]
        dirty = [room for room in first_floor_rooms if room["zoning"]["hygiene"] == "污"]
        self.assertTrue(dirty)
        self.assertTrue(all(room["area_m2"] > 20 for room in dirty))
        self.assertFalse(any(room["proposal"] == "卫生间配套" for room in first_floor_rooms))
        self.assertIn("楼梯", spaces["relations_zh"])
        self.assertIn("上下对应", spaces["relations_zh"])

    def test_door_gap_splits_rooms_and_marks_entrance(self) -> None:
        doc = ezdxf.new("R2010")
        doc.header["$INSUNITS"] = 4  # This fixture uses millimetres.
        msp = doc.modelspace()
        msp.add_line((0, 0), (2000, 0))
        msp.add_line((2900, 0), (10000, 0))
        msp.add_line((10000, 0), (10000, 8000))
        msp.add_line((10000, 8000), (0, 8000))
        msp.add_line((0, 8000), (0, 0))
        msp.add_line((5000, 0), (5000, 3000))
        msp.add_line((5000, 3900), (5000, 8000))
        msp.add_line((1500, 8000), (2700, 8000), dxfattribs={"layer": "WINDOW"})
        stream = io.StringIO()
        doc.write(stream)
        parsed = parse_dxf_bytes(stream.getvalue().encode("utf-8"), source_file_name="doors.dxf", max_entities=10_000)
        rooms = parsed.payload["spaces"]["floors"][0]["rooms"]
        self.assertGreaterEqual(len(rooms), 2)
        self.assertTrue(any(room.get("entrance") for room in rooms))
        self.assertGreater(parsed.payload["spaces"]["floors"][0]["constraints"]["windows"], 0)
        self.assertIn("毫米", parsed.payload["spaces"]["unit_note"])

    def test_stair_flight_is_not_parsed_as_a_room(self) -> None:
        doc = ezdxf.new("R2010")
        doc.header["$INSUNITS"] = 4  # This fixture uses millimetres.
        msp = doc.modelspace()
        msp.add_lwpolyline([(0, 0), (15000, 0), (15000, 12000), (0, 12000)], close=True)
        msp.add_lwpolyline([(4000, 4000), (7600, 4000), (7600, 8200), (4000, 8200)], close=True)
        for index in range(8):
            y = 4500 + index * 280
            msp.add_line((4300, y), (7300, y))
        stream = io.StringIO()
        doc.write(stream)
        parsed = parse_dxf_bytes(stream.getvalue().encode("utf-8"), source_file_name="stair.dxf", max_entities=10_000)
        rooms = parsed.payload["spaces"]["floors"][0]["rooms"]
        self.assertEqual(len(rooms), 1)
        self.assertGreater(rooms[0]["area_m2"], 80)
        self.assertTrue(all(room["area_m2"] > 20 for room in rooms))

    def test_window_recess_is_not_a_room(self) -> None:
        doc = ezdxf.new("R2010")
        doc.header["$INSUNITS"] = 4  # This fixture uses millimetres.
        msp = doc.modelspace()
        msp.add_lwpolyline([(0, 0), (10000, 0), (10000, 8000), (0, 8000)], close=True)
        msp.add_lwpolyline([(2000, 8000), (6000, 8000), (6000, 8400), (2000, 8400)], close=True)
        stream = io.StringIO()
        doc.write(stream)
        parsed = parse_dxf_bytes(stream.getvalue().encode("utf-8"), source_file_name="window.dxf", max_entities=10_000)
        rooms = parsed.payload["spaces"]["floors"][0]["rooms"]
        self.assertEqual(len(rooms), 1)
        self.assertGreater(rooms[0]["area_m2"], 50)

    def test_fitout_splits_toilet_and_keeps_existing_walls(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (200, 160), 0)
        ImageDraw.Draw(mask).rectangle((10, 10, 120, 140), fill=1)
        ImageDraw.Draw(mask).rectangle((130, 20, 190, 140), fill=2)
        lines = Image.new("RGBA", (200, 160), (0, 0, 0, 0))
        ImageDraw.Draw(lines).rectangle((121, 10, 129, 140), fill=(255, 255, 255, 255))
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "接待大厅", "area_m2": 80, "zoning": {"activity": "动"}},
                {"room_id": "f1_n3", "marker": "2", "proposal": "卫生间（含男女卫）", "area_m2": 20, "zoning": {"activity": "中性"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, lines)
        gender = [item for item in fitout["partitions"] if item["label"] == "男女分隔"]
        self.assertEqual(len(gender), 1)
        span = (
            (gender[0]["x2"] - gender[0]["x1"]) ** 2 * 200**2
            + (gender[0]["y2"] - gender[0]["y1"]) ** 2 * 160**2
        ) ** 0.5
        self.assertLess(span, 58)
        self.assertTrue(any(item["label"] == "厕位隔板" for item in fitout["partitions"]))
        self.assertTrue(any(item["label"] == "厕位门" for item in fitout["partitions"]))
        self.assertTrue(any(item["label"] == "卫生间门" for item in fitout["partitions"]))
        door = next(item for item in fitout["partitions"] if item["label"] == "卫生间门")
        wall = gender[0]
        self.assertLess(
            ((door["x1"] - wall["x2"]) ** 2 * 200**2 + (door["y1"] - wall["y2"]) ** 2 * 160**2) ** 0.5,
            1.5,
        )
        cross = abs(
            (wall["x2"] - wall["x1"]) * (door["y2"] - door["y1"])
            - (wall["y2"] - wall["y1"]) * (door["x2"] - door["x1"])
        )
        self.assertLess(cross, 0.002)
        stall_doors = [item for item in fitout["partitions"] if item["label"] == "厕位门"]
        panels = [item for item in fitout["partitions"] if item["label"] == "厕位隔板"]

        def near(ax: float, ay: float, bx: float, by: float) -> bool:
            return ((ax - bx) ** 2 * 200**2 + (ay - by) ** 2 * 160**2) ** 0.5 < 1.5

        for leaf in stall_doors:
            span_px = ((leaf["x2"] - leaf["x1"]) ** 2 * 200**2 + (leaf["y2"] - leaf["y1"]) ** 2 * 160**2) ** 0.5
            self.assertGreater(span_px, 8)
            self.assertTrue(
                any(near(leaf["x1"], leaf["y1"], panel["x1"], panel["y1"]) or near(leaf["x1"], leaf["y1"], panel["x2"], panel["y2"]) for panel in panels)
            )
            self.assertTrue(
                any(near(leaf["x2"], leaf["y2"], panel["x1"], panel["y1"]) or near(leaf["x2"], leaf["y2"], panel["x2"], panel["y2"]) for panel in panels)
            )
        self.assertFalse(any(item["label"] == "分隔墙" for item in fitout["partitions"]))
        self.assertFalse(any(item["label"] == "入口隔墙" for item in fitout["partitions"]))

    def test_fitout_closes_the_open_edge_in_front_of_a_toilet(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (200, 160), 0)
        ImageDraw.Draw(mask).rectangle((10, 20, 99, 140), fill=1)
        ImageDraw.Draw(mask).rectangle((100, 20, 180, 140), fill=2)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "接待大厅", "area_m2": 40, "zoning": {"activity": "动"}},
                {"room_id": "f1_n3", "marker": "2", "proposal": "卫生间（含男女卫）", "area_m2": 20, "zoning": {"activity": "中性"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, None)
        wall = next(item for item in fitout["partitions"] if item["label"] == "入口隔墙")
        door = next(item for item in fitout["partitions"] if item["label"] == "入口门")
        span = (
            (wall["x2"] - wall["x1"]) ** 2 * 200**2
            + (wall["y2"] - wall["y1"]) ** 2 * 160**2
        ) ** 0.5
        door_span = (
            (door["x2"] - door["x1"]) ** 2 * 200**2
            + (door["y2"] - door["y1"]) ** 2 * 160**2
        ) ** 0.5
        self.assertGreater(span, 90)
        self.assertGreater(door_span, 6)
        self.assertLess(
            ((door["x1"] - wall["x2"]) ** 2 * 200**2 + (door["y1"] - wall["y2"]) ** 2 * 160**2) ** 0.5,
            1.5,
        )
        self.assertTrue(any(item["kind"] == "counter" and item["room_id"] == "f1_r1" for item in fitout["furniture"]))
        self.assertTrue(any(item["kind"] in {"plant", "planter", "tree"} and item["room_id"] == "f1_r1" for item in fitout["furniture"]))
        toilet = [item for item in fitout["furniture"] if item["room_id"] == "f1_n3"]
        labels = [item["label"] for item in toilet]
        self.assertTrue(any(item["kind"] == "wc" for item in toilet))
        self.assertTrue(any("女厕位" in label for label in labels))
        self.assertTrue(any("男厕位" in label for label in labels))
        self.assertTrue(any("小便池" in label for label in labels))
        self.assertFalse(any(label.startswith("女") and "小便" in label for label in labels))
        self.assertTrue(any("女洗手" in label for label in labels))
        self.assertTrue(any("男洗手" in label for label in labels))

    def test_fitout_desks_follow_a_rotated_room(self) -> None:
        import math

        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        angle = math.radians(32)
        cx, cy = 110, 100
        half_w, half_h = 72, 26
        corners = []
        for sx, sy in ((-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h)):
            corners.append((cx + sx * math.cos(angle) - sy * math.sin(angle), cy + sx * math.sin(angle) + sy * math.cos(angle)))
        mask = Image.new("L", (220, 200), 0)
        ImageDraw.Draw(mask).polygon(corners, fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r2", "marker": "1", "proposal": "办公", "area_m2": 28, "zoning": {"activity": "静"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, None)
        desks = [item for item in fitout["furniture"] if item["kind"] == "desk"]
        self.assertGreaterEqual(len(desks), 2)

        def axis_error(angle: float, target: float) -> float:
            delta = abs(angle - target) % 180
            return min(delta, 180 - delta)

        self.assertLess(axis_error(desks[0]["angle"], 32), 14)
        span_x = max(item["x"] for item in desks) - min(item["x"] for item in desks)
        span_y = max(item["y"] for item in desks) - min(item["y"] for item in desks)
        self.assertGreater(span_x + span_y, 0.12)

    def test_fitout_keeps_furniture_off_a_column(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (180, 140), 0)
        ImageDraw.Draw(mask).rectangle((12, 12, 168, 128), fill=1)
        lines = Image.new("RGBA", (180, 140), (0, 0, 0, 0))
        ImageDraw.Draw(lines).rectangle((82, 62, 98, 78), fill=(255, 255, 255, 255))
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "办公", "area_m2": 40, "zoning": {"activity": "静"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, lines)
        desks = [item for item in fitout["furniture"] if item["kind"] == "desk"]
        self.assertGreaterEqual(len(desks), 2)
        for item in desks:
            self.assertGreater(abs(item["x"] - 0.5) + abs(item["y"] - 0.5), 0.08)

    def test_fitout_follows_both_legs_of_an_l(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (180, 160), 0)
        draw = ImageDraw.Draw(mask)
        draw.rectangle((12, 12, 150, 48), fill=1)
        draw.rectangle((12, 12, 48, 140), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "办公", "area_m2": 36, "zoning": {"activity": "静"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, None)
        desks = [item for item in fitout["furniture"] if item["kind"] == "desk"]

        def axis_error(angle: float, target: float) -> float:
            delta = abs(angle - target) % 180
            return min(delta, 180 - delta)

        self.assertTrue(any(axis_error(item["angle"], 0) < 12 for item in desks))
        self.assertTrue(any(axis_error(item["angle"], 90) < 12 for item in desks))

    def test_fitout_score_penalizes_overlap_more_than_a_clear_layout(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout_score import score_floor_layout

        mask = Image.new("L", (180, 140), 0)
        ImageDraw.Draw(mask).rectangle((16, 16, 164, 124), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "办公", "area_m2": 40, "zoning": {"activity": "静"}},
            ],
        }
        stacked = [
            {"id": "a", "room_id": "f1_r1", "kind": "desk", "label": "工位", "x": 0.5, "y": 0.5, "w": 0.08, "h": 0.08, "angle": 0},
            {"id": "b", "room_id": "f1_r1", "kind": "desk", "label": "工位", "x": 0.52, "y": 0.5, "w": 0.08, "h": 0.08, "angle": 0},
        ]
        apart = [
            {"id": "a", "room_id": "f1_r1", "kind": "desk", "label": "工位", "x": 0.2, "y": 0.5, "w": 0.08, "h": 0.08, "angle": 0},
            {"id": "b", "room_id": "f1_r1", "kind": "desk", "label": "工位", "x": 0.8, "y": 0.5, "w": 0.08, "h": 0.08, "angle": 0},
        ]
        worse = score_floor_layout(floor, mask, None, stacked)
        better = score_floor_layout(floor, mask, None, apart)
        self.assertGreater(worse["terms"]["overlap"], better["terms"]["overlap"])
        self.assertGreater(worse["loss"], better["loss"])

    def test_fitout_score_penalizes_a_desk_on_a_column(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout_score import score_floor_layout

        mask = Image.new("L", (180, 140), 0)
        ImageDraw.Draw(mask).rectangle((16, 16, 164, 124), fill=1)
        lines = Image.new("RGBA", (180, 140), (0, 0, 0, 0))
        ImageDraw.Draw(lines).rectangle((80, 60, 100, 80), fill=(255, 255, 255, 255))
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "办公", "area_m2": 40, "zoning": {"activity": "静"}},
            ],
        }
        on_column = [{"id": "a", "room_id": "f1_r1", "kind": "desk", "label": "工位", "x": 0.5, "y": 0.5, "w": 0.1, "h": 0.1, "angle": 0}]
        on_wall = [{"id": "a", "room_id": "f1_r1", "kind": "desk", "label": "工位", "x": 0.16, "y": 0.5, "w": 0.08, "h": 0.08, "angle": -90}]
        blocked = score_floor_layout(floor, mask, lines, on_column)
        clear = score_floor_layout(floor, mask, lines, on_wall)
        self.assertGreater(blocked["terms"]["obstacle"], clear["terms"]["obstacle"])
        self.assertFalse(blocked["passed"])
        self.assertGreaterEqual(blocked["loss"], clear["loss"])

    def test_fitout_keeps_furniture_out_of_a_door(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (220, 180), 0)
        ImageDraw.Draw(mask).rectangle((20, 20, 180, 140), fill=1)
        lines = Image.new("RGBA", (220, 180), (0, 0, 0, 0))
        draw = ImageDraw.Draw(lines)
        white = (255, 255, 255, 255)
        draw.rectangle((18, 18, 182, 24), fill=white)
        draw.rectangle((18, 136, 88, 142), fill=white)
        draw.rectangle((106, 136, 182, 142), fill=white)
        draw.rectangle((18, 18, 24, 142), fill=white)
        draw.rectangle((176, 18, 182, 142), fill=white)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "办公", "area_m2": 40, "zoning": {"activity": "静"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, lines)
        blocked = [
            item
            for item in fitout["furniture"]
            if 90 / 220 <= item["x"] <= 104 / 220 and item["y"] >= 128 / 180
        ]
        self.assertEqual(blocked, [])
        self.assertGreaterEqual(len(fitout["furniture"]), 2)

    def test_fitout_splits_a_room_on_an_unclosed_wall(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import split_interior_walls

        mask = Image.new("L", (220, 180), 0)
        ImageDraw.Draw(mask).rectangle((20, 20, 180, 150), fill=1)
        lines = Image.new("RGBA", (220, 180), (0, 0, 0, 0))
        ImageDraw.Draw(lines).rectangle((28, 82, 172, 88), fill=(255, 255, 255, 255))
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r3", "marker": "1", "proposal": "办公或会议", "area_m2": 40, "zoning": {"activity": "静"}},
            ],
        }
        created = split_interior_walls(floor, mask, lines)
        self.assertEqual(created, 1)
        self.assertEqual(len(floor["rooms"]), 2)
        areas = sorted(room["area_m2"] for room in floor["rooms"])
        self.assertGreater(areas[0], 8)
        self.assertGreater(areas[1], 8)

    def test_fitout_score_penalizes_an_incomplete_toilet(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout_score import score_floor_layout

        mask = Image.new("L", (180, 140), 0)
        ImageDraw.Draw(mask).rectangle((16, 16, 164, 124), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_n3", "marker": "1", "proposal": "卫生间（含男女卫）", "area_m2": 20, "zoning": {}},
            ],
        }

        def piece(piece_id: str, kind: str, label: str, x: float) -> dict:
            return {"id": piece_id, "room_id": "f1_n3", "kind": kind, "label": label, "x": x, "y": 0.3, "w": 0.05, "h": 0.06, "angle": 0}

        bare = [piece("a", "wc", "厕位", 0.3)]
        complete = [
            piece("a", "wc", "女厕位", 0.2),
            piece("b", "wc", "男厕位", 0.7),
            piece("c", "urinal", "男小便池", 0.8),
            piece("d", "sink", "女洗手池", 0.25),
            piece("e", "sink", "男洗手池", 0.75),
        ]
        incomplete = score_floor_layout(floor, mask, None, bare)
        ready = score_floor_layout(floor, mask, None, complete)
        self.assertGreater(incomplete["terms"]["toilet"], ready["terms"]["toilet"])
        self.assertEqual(ready["terms"]["toilet"], 0.0)

    def test_fitout_score_prefers_a_furnished_center(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout_score import score_floor_layout

        mask = Image.new("L", (220, 180), 0)
        ImageDraw.Draw(mask).rectangle((16, 16, 204, 164), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "办公", "area_m2": 60, "zoning": {"activity": "静"}},
            ],
        }
        bare = [
            {"id": "a", "room_id": "f1_r1", "kind": "desk", "label": "工位", "x": 0.2, "y": 0.2, "w": 0.06, "h": 0.05, "angle": 0},
        ]
        composed = [
            *bare,
            {"id": "b", "room_id": "f1_r1", "kind": "table", "label": "讨论桌", "x": 0.5, "y": 0.5, "w": 0.08, "h": 0.06, "angle": 0},
            {"id": "c", "room_id": "f1_r1", "kind": "tree", "label": "乔木", "x": 0.62, "y": 0.5, "w": 0.04, "h": 0.04, "angle": 0},
            {"id": "d", "room_id": "f1_r1", "kind": "plant", "label": "绿植", "x": 0.68, "y": 0.56, "w": 0.03, "h": 0.03, "angle": 0},
        ]
        empty_middle = score_floor_layout(floor, mask, None, bare)
        grouped = score_floor_layout(floor, mask, None, composed)
        self.assertGreater(empty_middle["terms"]["coverage"], grouped["terms"]["coverage"])
        self.assertGreater(empty_middle["terms"]["groups"], grouped["terms"]["groups"])
        self.assertGreater(empty_middle["terms"]["planting"], grouped["terms"]["planting"])

    def test_fitout_score_wants_reception_density_inside_a_band(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout_score import score_floor_layout

        mask = Image.new("L", (200, 160), 0)
        ImageDraw.Draw(mask).rectangle((8, 8, 192, 152), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "接待大厅", "area_m2": 100, "zoning": {"activity": "动"}},
            ],
        }

        def block(piece_id: str, x: float, y: float) -> dict:
            return {"id": piece_id, "room_id": "f1_r1", "kind": "table", "label": "茶几", "group": "洽谈", "x": x, "y": y, "w": 0.2, "h": 0.2, "angle": 0}

        sparse = score_floor_layout(floor, mask, None, [block("a", 0.3, 0.35)])
        middle = score_floor_layout(floor, mask, None, [block("a", 0.3, 0.35), block("b", 0.7, 0.35)])
        packed = score_floor_layout(
            floor,
            mask,
            None,
            [block("a", 0.3, 0.3), block("b", 0.7, 0.3), block("c", 0.3, 0.7), block("d", 0.7, 0.7)],
        )
        self.assertGreater(sparse["terms"]["density"], middle["terms"]["density"])
        self.assertGreater(packed["terms"]["density"], middle["terms"]["density"])
        self.assertEqual(middle["terms"]["density"], 0.0)

    def test_fitout_puts_center_groups_in_a_large_room(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (220, 180), 0)
        ImageDraw.Draw(mask).rectangle((16, 16, 204, 164), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "接待大厅", "area_m2": 90, "zoning": {"activity": "动"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, None)
        pieces = fitout["furniture"]
        self.assertTrue(any(item["kind"] == "table" for item in pieces))
        self.assertTrue(any(item["kind"] == "sofa" for item in pieces))
        self.assertTrue(any(item["kind"] == "tree" for item in pieces))
        tables = [item for item in pieces if item["label"] == "茶几"]
        self.assertTrue(any(abs(item["x"] - 0.5) + abs(item["y"] - 0.5) < 0.35 for item in tables))

    def test_fitout_puts_a_talk_group_in_each_usable_piece(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (220, 180), 0)
        ImageDraw.Draw(mask).rectangle((16, 16, 204, 164), fill=1)
        frame = {"min_x": 0.0, "max_y": 20.0, "scale": 10.0, "meters_per_unit": 1.0}

        def corner(px: float, py: float) -> list[float]:
            return [(px - 4) / 10.0, 20.0 - (py - 4) / 10.0]

        left = [corner(30, 30), corner(100, 30), corner(100, 150), corner(30, 150), corner(30, 30)]
        right = [corner(120, 30), corner(196, 30), corner(196, 150), corner(120, 150), corner(120, 30)]
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "geometry": frame,
            "rooms": [
                {
                    "room_id": "f1_r1",
                    "marker": "1",
                    "proposal": "接待大厅",
                    "area_m2": 90,
                    "zoning": {"activity": "动"},
                    "usable": {"area_m2": 70, "polygons": [left, right]},
                }
            ],
        }
        fitout = build_floor_fitout(floor, mask, None)
        tables = [item for item in fitout["furniture"] if item["label"] == "茶几"]
        self.assertTrue(any(item["x"] < 0.45 for item in tables))
        self.assertTrue(any(item["x"] > 0.55 for item in tables))
        self.assertTrue(all(item.get("group") == "洽谈" for item in tables))
        self.assertIn("接待台", {item.get("group") for item in fitout["furniture"]})
        self.assertIn("绿化", {item.get("group") for item in fitout["furniture"]})

    def test_fitout_puts_a_prep_counter_behind_the_cafe_bar(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (260, 180), 0)
        ImageDraw.Draw(mask).rectangle((12, 12, 248, 168), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_n1", "marker": "1", "proposal": "咖啡厅", "area_m2": 64, "zoning": {"activity": "动"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, None)
        labels = {item["label"] for item in fitout["furniture"]}
        self.assertIn("吧台", labels)
        self.assertIn("操作台", labels)
        self.assertIn("茶座", labels)
        counters = [item for item in fitout["furniture"] if item["label"] in {"吧台", "操作台"}]
        self.assertTrue(all(item.get("group") == "备餐" for item in counters))
        bar = next(item for item in fitout["furniture"] if item["label"] == "吧台")
        for table in (item for item in fitout["furniture"] if item["label"] == "茶座"):
            self.assertGreater(abs(table["x"] - bar["x"]) + abs(table["y"] - bar["y"]), 0.12)

    def test_fitout_scores_three_layout_schemes(self) -> None:
        from PIL import Image, ImageDraw

        from app.services.cad.fitout import build_floor_fitout

        mask = Image.new("L", (180, 140), 0)
        ImageDraw.Draw(mask).rectangle((12, 12, 168, 128), fill=1)
        floor = {
            "floor_index": 1,
            "square_meters_per_pixel": 0.01,
            "rooms": [
                {"room_id": "f1_r1", "marker": "1", "proposal": "办公", "area_m2": 40, "zoning": {"activity": "静"}},
            ],
        }
        fitout = build_floor_fitout(floor, mask, None)
        self.assertEqual([item["id"] for item in fitout["variants"]], ["wall", "anchor", "grid"])
        self.assertEqual(fitout["score"]["loss"], next(item["score"]["loss"] for item in fitout["variants"] if item["id"] == fitout["scheme"]))
        for item in fitout["variants"]:
            self.assertGreaterEqual(len(item["furniture"]), 1)
            self.assertIn("loss", item["score"])

    def test_bucket_text_label(self) -> None:
        self.assertEqual(bucket_text_label("3000"), "dimensions")
        self.assertEqual(bucket_text_label("会议室"), "room_labels")


class CadExtractApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous_converter = settings.cad_dwg_converter_cmd
        settings.cad_dwg_converter_cmd = ""

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

        with self.SessionLocal() as db:
            db.add(
                User(
                    name="designer",
                    display_name="Designer",
                    role="designer",
                    password_hash=hash_password("designer-pass"),
                    is_active=True,
                    project_codes=["QMDH-001"],
                )
            )
            db.commit()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app = FastAPI()
        app.include_router(auth.router)
        app.include_router(cad.router)
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        login = self.client.post("/auth/login", json={"username": "designer", "password": "designer-pass"})
        self.assertEqual(login.status_code, 200)
        token = login.json()["token"]
        self.headers = {"Authorization": f"Bearer {token}"}

    def tearDown(self) -> None:
        settings.cad_dwg_converter_cmd = self._previous_converter

    def test_create_and_get_cad_extract(self) -> None:
        created = self.client.post(
            "/cad/extract",
            headers=self.headers,
            json={
                "file_name": "plan.dxf",
                "data_url": _to_data_url(_build_sample_dxf_bytes()),
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["status"], "ok")
        self.assertTrue(body["extract_id"].startswith("ce_"))
        self.assertIn("会议室", body["data"]["texts"]["room_labels"])
        self.assertTrue(any("天正" in note for note in body["warnings"]))

        fetched = self.client.get(f"/cad/extracts/{body['extract_id']}", headers=self.headers)
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["extract_id"], body["extract_id"])

        listed = self.client.get("/cad/extracts", headers=self.headers)
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()), 1)

    def test_dwg_without_converter_returns_needs_conversion(self) -> None:
        created = self.client.post(
            "/cad/extract",
            headers=self.headers,
            json={
                "file_name": "plan.dwg",
                "data_url": _to_data_url(b"fake-dwg-content", mime="application/acad"),
            },
        )
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(body["status"], "needs_conversion")
        self.assertEqual(body["error_message"], "dwg_converter_not_configured")
        self.assertTrue(any("另存为 DXF" in note for note in body["warnings"]))
        self.assertTrue(any("另存为 DXF" in note for note in body["data"]["usage_notes"]))


class RoomLineLayerTests(unittest.TestCase):
    def test_repaint_keeps_wall_pixels(self) -> None:
        from PIL import Image

        from app.services.cad.room_edit import _peel_lines, _rewrite_preview

        preview = Image.new("RGB", (8, 8), (12, 12, 12))
        preview.putpixel((2, 2), (255, 255, 255))
        lines = _peel_lines(preview)
        mask = Image.new("L", (8, 8), 0)
        mask.putpixel((2, 2), 1)
        mask.putpixel((3, 3), 1)
        _rewrite_preview(preview, mask, [{"marker": "1", "swatch": "#ff0000"}], lines)
        self.assertEqual(preview.getpixel((2, 2)), (255, 255, 255))
        self.assertEqual(preview.getpixel((3, 3)), (255, 0, 0))
        self.assertEqual(lines.getpixel((2, 2))[3], 255)
        self.assertEqual(lines.getpixel((3, 3))[3], 0)

    def test_polygon_fills_interior_and_erase_keeps_other_rooms(self) -> None:
        from PIL import Image

        from app.services.cad.room_edit import _paint

        mask = Image.new("L", (20, 20), 0)
        mask.putpixel((19, 19), 2)
        _paint(
            mask,
            1,
            [
                {"x": 0.1, "y": 0.1, "erase": False},
                {"x": 0.8, "y": 0.1, "erase": False},
                {"x": 0.5, "y": 0.8, "erase": False},
            ],
        )
        self.assertEqual(mask.getpixel((10, 8)), 1)
        self.assertEqual(mask.getpixel((0, 0)), 0)
        self.assertEqual(mask.getpixel((19, 19)), 2)
        _paint(
            mask,
            1,
            [
                {"x": 0.2, "y": 0.2, "erase": True},
                {"x": 0.7, "y": 0.2, "erase": True},
                {"x": 0.45, "y": 0.7, "erase": True},
            ],
        )
        self.assertEqual(mask.getpixel((10, 8)), 0)
        self.assertEqual(mask.getpixel((8, 3)), 1)
        self.assertEqual(mask.getpixel((19, 19)), 2)


class RoomUndoTests(unittest.TestCase):
    def test_undo_restores_name_and_mask(self) -> None:
        from PIL import Image

        from app.services.cad.room_edit import _discard_asset, adjust_floor_room, save_program_review, undo_floor_edit
        from app.services.media_storage import read_binary_asset, write_binary_asset

        mask_file = "cad/extracts/_undo-test-floor-1-mask.png"
        preview_file = "cad/extracts/_undo-test-floor-1.png"
        line_file = "cad/extracts/_undo-test-floor-1-lines.png"
        try:
            mask = Image.new("L", (8, 8), 0)
            mask.putpixel((2, 2), 1)
            preview = Image.new("RGB", (8, 8), (12, 12, 12))
            lines = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
            for image, path in ((mask, mask_file), (preview, preview_file), (lines, line_file)):
                buffer = io.BytesIO()
                image.save(buffer, format="PNG")
                write_binary_asset(path, buffer.getvalue())
            payload = {
                "spaces": {
                    "floors": [
                        {
                            "floor_index": 1,
                            "mask_file": mask_file,
                            "line_file": line_file,
                            "preview_path": "/media/cad/extracts/_undo-test-floor-1.png",
                            "square_meters_per_pixel": 1,
                            "scheme_zh": "原来",
                            "rooms": [
                                {
                                    "room_id": "f1_r1",
                                    "marker": "1",
                                    "swatch": "#ff0000",
                                    "proposal": "原来",
                                    "area_ratio": 1,
                                    "area_m2": 1,
                                }
                            ],
                        }
                    ]
                }
            }
            renamed = adjust_floor_room(payload, floor_index=1, room_id="f1_r1", action="rename", proposal="改过")
            self.assertEqual(renamed["spaces"]["floors"][0]["rooms"][0]["proposal"], "改过")
            self.assertEqual(renamed["spaces"]["floors"][0]["undo_count"], 1)
            restored = undo_floor_edit(renamed, floor_index=1)
            self.assertEqual(restored["spaces"]["floors"][0]["rooms"][0]["proposal"], "原来")
            self.assertEqual(restored["spaces"]["floors"][0]["undo_count"], 0)
            painted = adjust_floor_room(
                restored,
                floor_index=1,
                room_id="f1_r1",
                action="paint",
                strokes=[
                    {"x": 0, "y": 0, "erase": False},
                    {"x": 1, "y": 0, "erase": False},
                    {"x": 0, "y": 1, "erase": False},
                ],
            )
            filled = Image.open(io.BytesIO(read_binary_asset(painted["spaces"]["floors"][0]["mask_file"])))
            self.assertEqual(filled.getpixel((0, 0)), 1)
            undone = undo_floor_edit(painted, floor_index=1)
            rolled = Image.open(io.BytesIO(read_binary_asset(undone["spaces"]["floors"][0]["mask_file"])))
            self.assertEqual(rolled.getpixel((2, 2)), 1)
            self.assertEqual(rolled.getpixel((0, 0)), 0)
            self.assertEqual(undone["spaces"]["floors"][0]["rooms"][0]["proposal"], "原来")
            self.assertEqual(undone["spaces"]["floors"][0]["undo_count"], 0)
            created = adjust_floor_room(
                undone,
                floor_index=1,
                room_id="",
                action="create",
                proposal="新分区",
                strokes=[
                    {"x": 0.5, "y": 0, "erase": False},
                    {"x": 1, "y": 0, "erase": False},
                    {"x": 1, "y": 0.6, "erase": False},
                ],
            )
            created_rooms = created["spaces"]["floors"][0]["rooms"]
            self.assertTrue(any(item["proposal"] == "新分区" for item in created_rooms))
            created_mask = Image.open(io.BytesIO(read_binary_asset(created["spaces"]["floors"][0]["mask_file"])))
            self.assertEqual(created_mask.getpixel((7, 1)), 2)
            self.assertEqual(created_mask.getpixel((0, 0)), 0)
            reviewed = save_program_review(
                created,
                {"f1_r1": "  改成调解室  ", "bad key": "不要", "general": "先不摆家具", "blank": "  "},
            )
            notes = reviewed["spaces"]["program_review"]["notes"]
            self.assertEqual(notes["f1_r1"], "改成调解室")
            self.assertEqual(notes["general"], "先不摆家具")
            self.assertNotIn("bad key", notes)
            self.assertNotIn("blank", notes)
            self.assertTrue(any(item.get("proposal") == "原来" for item in reviewed["spaces"]["floors"][0]["rooms"]))
            cleared = save_program_review(reviewed, {})
            self.assertEqual(cleared["spaces"]["program_review"]["notes"], {})
        finally:
            for path in (
                mask_file,
                preview_file,
                line_file,
                "cad/extracts/_undo-test-floor-1-undo-1-mask.png",
                "cad/extracts/_undo-test-floor-1-undo-1.png",
                "cad/extracts/_undo-test-floor-1-undo-2-mask.png",
                "cad/extracts/_undo-test-floor-1-undo-2.png",
            ):
                _discard_asset(path)


class ProgramRearrangeTests(unittest.TestCase):
    def test_parse_keeps_noted_room_and_drops_the_rest(self) -> None:
        from app.services.cad.program_rearrange import parse_rearrange_text

        payload = {
            "spaces": {
                "program_review": {"notes": {"f2_r1": "改成学习区，安静分区"}},
                "floors": [
                    {
                        "floor_index": 2,
                        "label": "平面 2",
                        "rooms": [
                            {
                                "room_id": "f2_r1",
                                "marker": "1",
                                "proposal": "接待或开放办公",
                                "area_ratio": 0.4,
                                "area_m2": 100.5,
                                "entrance": True,
                                "zoning": {"activity": "动"},
                            },
                            {
                                "room_id": "f2_r2",
                                "marker": "2",
                                "proposal": "档案与内部办公",
                                "area_ratio": 0.3,
                                "area_m2": 97.6,
                                "zoning": {"activity": "动"},
                            },
                        ],
                    }
                ],
            }
        }
        text = """```json
{"items":[
  {"room_id":"f2_r1","proposal":"学习区","activity":"静","reason":"意见要求安静学习。","split_hint":""},
  {"room_id":"f2_r2","proposal":"青少年活动室","activity":"动","reason":"这间没有意见。","split_hint":""},
  {"room_id":"missing","proposal":"大厅","activity":"动","reason":"不存在。","split_hint":""},
  {"room_id":"f2_r1","proposal":"阅览","activity":"静","reason":"重复。","split_hint":""}
]}
```"""
        items = parse_rearrange_text(text, payload)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["proposal"], "学习区")
        self.assertEqual(items[0]["activity"], "静")
        self.assertEqual(items[0]["current_name"], "接待或开放办公")

    def test_apply_renames_without_touching_mask(self) -> None:
        from PIL import Image

        from app.services.cad.program_rearrange import apply_program_changes
        from app.services.media_storage import read_binary_asset, write_binary_asset

        mask_file = "cad/extracts/_rearrange-test-floor-2-mask.png"
        preview_file = "cad/extracts/_rearrange-test-floor-2.png"
        line_file = "cad/extracts/_rearrange-test-floor-2-lines.png"
        try:
            mask = Image.new("L", (8, 8), 0)
            mask.putpixel((2, 2), 1)
            preview = Image.new("RGB", (8, 8), (12, 12, 12))
            lines = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
            for image, path in ((mask, mask_file), (preview, preview_file), (lines, line_file)):
                buffer = io.BytesIO()
                image.save(buffer, format="PNG")
                write_binary_asset(path, buffer.getvalue())
            payload = {
                "spaces": {
                    "floors": [
                        {
                            "floor_index": 2,
                            "label": "平面 2",
                            "mask_file": mask_file,
                            "line_file": line_file,
                            "preview_path": "/media/cad/extracts/_rearrange-test-floor-2.png",
                            "rooms": [
                                {
                                    "room_id": "f2_r1",
                                    "marker": "1",
                                    "proposal": "接待或开放办公",
                                    "area_ratio": 1,
                                    "area_m2": 100,
                                    "zoning": {"role": "主要", "activity": "动", "hygiene": "中性"},
                                }
                            ],
                        }
                    ]
                }
            }
            updated = apply_program_changes(
                payload,
                [{"room_id": "f2_r1", "proposal": "学习区", "activity": "静", "reason": "意见要求安静学习。"}],
            )
            room = updated["spaces"]["floors"][0]["rooms"][0]
            self.assertEqual(room["proposal"], "学习区")
            self.assertEqual(room["zoning"]["activity"], "静")
            self.assertEqual(room["layout_hint"], "意见要求安静学习。")
            self.assertEqual(Image.open(io.BytesIO(read_binary_asset(mask_file))).getpixel((2, 2)), 1)
        finally:
            from app.services.cad.room_edit import _discard_asset as discard

            for path in (
                mask_file,
                preview_file,
                line_file,
                "cad/extracts/_rearrange-test-floor-2-undo-1-mask.png",
                "cad/extracts/_rearrange-test-floor-2-undo-1.png",
            ):
                discard(path)
