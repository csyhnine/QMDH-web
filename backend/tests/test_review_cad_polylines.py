"""R97: in-memory DXF entities through the real CAD layout/polygon pipeline."""
from io import BytesIO
import math
import unittest
from unittest.mock import patch

import ezdxf
from PIL import Image

from app.services.cad.space_layout import _segments_of, build_space_layout


def rectangle(width=10, height=8):
    return [(0, 0), (width, 0), (width, height), (0, height)]


def add_outline(layout, kind, points, *, closed=True):
    if kind == "LINE":
        for start, end in zip(points, points[1:]):
            layout.add_line(start, end)
        if closed:
            layout.add_line(points[-1], points[0])
    elif kind == "LWPOLYLINE":
        return layout.add_lwpolyline(points, format="xy", close=closed)
    else:
        return layout.add_polyline2d(points, close=closed)


def drawing():
    document = ezdxf.new("R2010")
    document.header["$INSUNITS"] = 6  # meters; keep the unrelated R96 unit heuristic out of this card
    return document, document.modelspace()


class CadPolylineTests(unittest.TestCase):
    def assert_single_room(self, layout, area):
        payload, previews, masks, overlays = build_space_layout(layout)
        self.assertEqual(len(payload["floors"]), 1)
        floor = payload["floors"][0]
        self.assertEqual(len(floor["rooms"]), 1)
        room = floor["rooms"][0]
        self.assertAlmostEqual(room["area_m2"], area, delta=max(0.2, area * 0.03))
        # The real final polygon and usable-area attachment runs, without a stub.
        self.assertGreaterEqual(len(room["polygon"]), 4)
        self.assertEqual(floor["geometry"]["meters_per_unit"], 1.0)
        for images in (previews, masks, overlays):
            self.assertEqual(len(images), 1)
            with Image.open(BytesIO(images[0])) as image:
                self.assertEqual(image.format, "PNG")
                image.verify()
        return floor

    def test_closed_shapes_have_equivalent_floor_room_and_area(self):
        areas = []
        for kind in ("LINE", "LWPOLYLINE", "POLYLINE"):
            with self.subTest(kind=kind):
                _, layout = drawing()
                add_outline(layout, kind, rectangle())
                floor = self.assert_single_room(layout, 80)
                self.assertEqual(floor["bbox"], [0, 0, 10, 8])
                areas.append(floor["rooms"][0]["area_m2"])
        self.assertEqual(len(areas), 3)
        self.assertLess(max(areas) - min(areas), 2.4)

    def test_polyline_edges_and_open_contour_are_not_auto_closed(self):
        _, layout = drawing()
        points = rectangle()
        entity = add_outline(layout, "POLYLINE", points, closed=False)
        expected = [(0, 0, 10, 0), (10, 0, 10, 8), (10, 8, 0, 8)]
        self.assertEqual(_segments_of(entity), expected)
        payload, *_ = build_space_layout(layout)
        self.assertEqual(len(payload["floors"]), 1)
        self.assertEqual(payload["floors"][0]["rooms"], [])
        entity.close(True)
        self.assertEqual(_segments_of(entity), expected + [(0, 8, 0, 0)])
        # requirements.txt permits ezdxf 1.3; points_in_wcs was added in 1.4.
        with patch.object(type(entity), "points_in_wcs", side_effect=AssertionError("requires ezdxf 1.4"), create=True):
            self.assertEqual(_segments_of(entity), expected + [(0, 8, 0, 0)])
        for points, expected in (([], []), ([(1, 2)], []), ([(1, 2), (3, 4)], [(1, 2, 3, 4)])):
            with self.subTest(vertices=len(points)):
                entity = layout.add_polyline2d(points, close=True)
                self.assertEqual(_segments_of(entity), expected)

    def test_block_translation_rotation_and_uniform_scale(self):
        for tx, ty, angle, scale in ((20, 30, 0, 1), (12, 24, 90, 1), (0, 0, 0, 2), (50, -10, 90, 2)):
            with self.subTest(transform=(tx, ty, angle, scale)):
                document, layout = drawing()
                block = document.blocks.new("R97_OUTLINE")
                add_outline(block, "POLYLINE", rectangle())
                insert = layout.add_blockref("R97_OUTLINE", (tx, ty), dxfattribs={
                    "rotation": angle, "xscale": scale, "yscale": scale, "zscale": scale,
                })
                virtual = list(insert.virtual_entities())
                self.assertEqual(len(virtual), 1)
                self.assertEqual(virtual[0].dxftype(), "POLYLINE")
                radians = math.radians(angle)
                expected_points = [
                    (tx + scale * (x * math.cos(radians) - y * math.sin(radians)),
                     ty + scale * (x * math.sin(radians) + y * math.cos(radians)))
                    for x, y in rectangle()
                ]
                segments = _segments_of(virtual[0])
                self.assertEqual(len(segments), 4)
                for actual, (start, end) in zip(segments, zip(expected_points, expected_points[1:] + expected_points[:1])):
                    for value, expected in zip(actual, (*start, *end)):
                        self.assertAlmostEqual(value, expected, places=6)
                floor = self.assert_single_room(layout, 80 * scale ** 2)
                xs, ys = zip(*expected_points)
                self.assertEqual(floor["bbox"], [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)])

    def test_unsupported_3d_and_curved_entities_are_not_flattened(self):
        for kind in ("3D", "bulge", "curve-fit", "spline-fit", "SPLINE"):
            with self.subTest(kind=kind):
                _, layout = drawing()
                if kind == "3D":
                    entity = layout.add_polyline3d([(0, 0, 0), (10, 0, 1), (10, 8, 2), (0, 8, 0)], close=True)
                elif kind == "SPLINE":
                    entity = layout.add_spline([(0, 0), (5, 8), (10, 0), (15, 8)])
                else:
                    entity = add_outline(layout, "POLYLINE", rectangle())
                    if kind == "bulge":
                        entity.vertices[0].dxf.bulge = 0.5
                    elif kind == "curve-fit":
                        entity.dxf.flags |= entity.CURVE_FIT_VERTICES_ADDED
                    else:
                        entity.dxf.flags |= entity.SPLINE_FIT_VERTICES_ADDED
                self.assertEqual(_segments_of(entity), [])
                payload, *images = build_space_layout(layout)
                self.assertEqual(payload["floors"], [])
                self.assertEqual(images, [[], [], []])

    def test_mixed_polyline_boundary_and_line_partition_keep_two_rooms(self):
        _, layout = drawing()
        add_outline(layout, "POLYLINE", rectangle())
        layout.add_line((5, 0), (5, 8))
        payload, *_ = build_space_layout(layout)
        self.assertEqual(len(payload["floors"]), 1)
        rooms = payload["floors"][0]["rooms"]
        self.assertEqual(len(rooms), 2)
        for room in rooms:
            self.assertAlmostEqual(room["area_m2"], 40, delta=2.0)
            self.assertGreaterEqual(len(room["polygon"]), 4)

    def test_small_polyline_floor_keeps_existing_layout_behavior(self):
        _, layout = drawing()
        add_outline(layout, "POLYLINE", rectangle(3, 2))
        self.assert_single_room(layout, 6)

    def test_existing_line_lwpolyline_and_circle_segments_are_unchanged(self):
        _, layout = drawing()
        self.assertEqual(_segments_of(layout.add_line((1, 2), (3, 4))), [(1, 2, 3, 4)])
        points = [(1, 2), (3, 2), (3, 4)]
        entity = add_outline(layout, "LWPOLYLINE", points, closed=False)
        self.assertEqual(_segments_of(entity), [(1, 2, 3, 2), (3, 2, 3, 4)])
        entity.closed = True
        self.assertEqual(_segments_of(entity), [(1, 2, 3, 2), (3, 2, 3, 4), (3, 4, 1, 2)])
        circle = _segments_of(layout.add_circle((0, 0), 3))
        self.assertEqual(len(circle), 16)
        for value, expected in zip(circle[0][:2], (3, 0)):
            self.assertAlmostEqual(value, expected)
        for value, expected in zip(circle[-1][2:], (3, 0)):
            self.assertAlmostEqual(value, expected)
