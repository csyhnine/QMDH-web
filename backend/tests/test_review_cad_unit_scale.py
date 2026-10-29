"""R96: in-memory DXF, real raster/polygons, explicit calibration, no CAD files."""
from copy import deepcopy
from io import BytesIO, StringIO
import importlib.util
import json
import math
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

import ezdxf
from PIL import Image

from app.services.cad import space_layout as layout
from app.services.cad import preparation, fitout, polygons
from app.services.cad.dxf_reader import parse_dxf_bytes
from app.services.cad.unit_scale import resolve_unit_scale, calibrated_unit_scale
from tests.test_review_agent_memory_completion import BACKEND


class CadUnitScaleTests(unittest.TestCase):
    def drawing(self, width=100, height=80, code=6, scale=1):
        doc=ezdxf.new("R2010");doc.header["$INSUNITS"]=code;msp=doc.modelspace()
        msp.add_lwpolyline([(0,0),(width/scale,0),(width/scale,height/scale),(0,height/scale)],format="xy",close=True)
        return doc,msp

    def build(self, width=100, height=80, code=6, scale=1):
        doc,msp=self.drawing(width,height,code,scale)
        result=layout.build_space_layout(msp)
        self.assertEqual(doc.header["$INSUNITS"],code)
        self.assertEqual(len(result[0]["floors"]),1)
        floor=result[0]["floors"][0]
        self.assertEqual(len(floor["rooms"]),1)
        return result,floor

    def frame_extent(self, room):
        points=room["polygon"];xs,ys=zip(*points)
        return max(xs)-min(xs),max(ys)-min(ys)

    def calibrate(self, result, floor, width, *, legacy=False):
        spaces,previews,masks,lines=result
        floor["mask_file"]="synthetic/mask.png";floor["line_file"]="synthetic/lines.png"
        images={floor["mask_file"]:masks[0],floor["line_file"]:lines[0]}
        with Image.open(BytesIO(masks[0])) as mask:w,h=mask.size
        pixels=width/floor["geometry"]["meters_per_unit"]*floor["geometry"]["scale"]
        if legacy:pixels=width/.1*floor["geometry"]["scale"]
        # Test inputs use the actual raster frame's left/right physical endpoints.
        points=[{"x":4/w,"y":4/h},{"x":(4+pixels)/w,"y":4/h}]
        inputs={"floor_index":floor["floor_index"],"calibration":{"points":points,"meters":width},
                "room_kinds":{room["room_id"]:"office" for room in floor["rooms"]},"routes":[]}
        payload={"spaces":spaces,"preserve":{"synthetic":"untouched"}}
        with patch.object(preparation,"read_binary_asset",side_effect=lambda name:images[name]):
            preparation.save_preparation(payload,inputs)
            preparation.require_preparation(floor,masks[0])
        return payload,inputs,images

    def test_original_large_metre_and_centimetre_area_is_one_hundredth_new_matches_millimetres(self):
        path=BACKEND.parent/'docs/archive/f83-r96-2026-10-25/original/backend/app/services/cad/space_layout.py'
        spec=importlib.util.spec_from_file_location("r96_original_layout",path);before=importlib.util.module_from_spec(spec);spec.loader.exec_module(before)
        areas=[]
        for code,scale in ((6,1),(5,.01),(4,.001)):
            _,msp=self.drawing(code=code,scale=scale)
            old=before.build_space_layout(msp)[0]["floors"][0]["rooms"][0]["area_m2"]
            result,floor=self.build(code=code,scale=scale);new=floor["rooms"][0]["area_m2"]
            self.assertAlmostEqual(old,80 if code in (5,6) else 8000,delta=1)
            self.assertAlmostEqual(new,8000,delta=1);areas.append(new)
            self.assertEqual(floor["geometry"]["meters_per_unit"],scale)
            self.assertEqual(result[0]["unit_info"]["source"],"declared")
        self.assertLess(max(areas)-min(areas),.01)

    def test_metre_centimetre_millimetre_polygons_and_furniture_conversion_are_equivalent(self):
        extents=[];meters_per_pixel=[];usable_areas=[];chair_pixels=[]
        for code,scale in ((6,1),(5,.01),(4,.001)):
            _,floor=self.build(width=20,height=16,code=code,scale=scale)
            room=floor["rooms"][0];self.assertAlmostEqual(room["area_m2"],320,delta=.2)
            self.assertGreater(room["usable"]["area_m2"],0)
            self.assertLessEqual(room["usable"]["area_m2"],320)
            usable_areas.append(room["usable"]["area_m2"])
            mpp=fitout._meters_per_pixel(floor);self.assertAlmostEqual(mpp,20/900,places=9)
            width,height=self.frame_extent(room)
            self.assertAlmostEqual(width,20,delta=8*mpp);self.assertAlmostEqual(height,16,delta=8*mpp)
            extents.append((width,height));mpp=fitout._meters_per_pixel(floor);meters_per_pixel.append(mpp)
            chair_pixels.append(fitout._px(.9,mpp,minimum=1))
            self.assertAlmostEqual(chair_pixels[-1]*mpp,.9,delta=mpp)
            self.assertEqual(fitout._px(1.8,mpp,minimum=1),81)
            regions=fitout._usable_pixel_polygons(room,polygons.frame_of(floor))
            self.assertTrue(regions)
        for values in (list(zip(*extents)),[meters_per_pixel]):
            for numbers in values:self.assertLess(max(numbers)-min(numbers),.02)
        self.assertLess(max(usable_areas)-min(usable_areas),.1)
        self.assertLessEqual(max(chair_pixels)-min(chair_pixels),1)

    def test_inches_above_old_800_unit_cutoff_keep_declared_scale_and_real_area(self):
        result,floor=self.build(width=25.4,height=20.32,code=1,scale=.0254)
        self.assertAlmostEqual(floor["rooms"][0]["area_m2"],25.4*20.32,delta=.2)
        self.assertEqual(floor["geometry"]["meters_per_unit"],.0254)
        self.assertFalse(result[0]["unit_info"]["requires_calibration"])
        self.assertIn("英寸",result[0]["unit_note"])

    def test_small_declared_drawing_keeps_scale_and_reports_reference_size_only(self):
        result,floor=self.build(width=2.8,height=2)
        self.assertAlmostEqual(floor["rooms"][0]["area_m2"],5.6,delta=.03)
        self.assertEqual(floor["geometry"]["meters_per_unit"],1)
        self.assertTrue(result[0]["unit_info"]["requires_calibration"])
        self.assertIn("声明比例未改动",floor["scale_note"])

    def test_reference_three_and_eighty_boundaries_never_change_explicit_units(self):
        for code,scale in ((6,1),(5,.01),(4,.001),(1,.0254)):
            for meters in (2.999,3,3.001,79.999,80,80.001,100):
                with self.subTest(code=code,meters=meters):
                    msp=SimpleNamespace(doc=SimpleNamespace(header={"$INSUNITS":code}))
                    info=resolve_unit_scale(msp,meters/scale)
                    self.assertEqual(info["meters_per_unit"],scale)
                    self.assertEqual(info["source"],"declared")
                    self.assertEqual(info["requires_calibration"],not 3<=meters<=80)

    def test_ezdxf_supported_feet_and_decimetres_are_declarations_not_span_guesses(self):
        for code,scale in ((2,.3048),(14,.1),(7,1000)):
            with self.subTest(code=code):
                info=resolve_unit_scale(SimpleNamespace(doc=SimpleNamespace(header={"$INSUNITS":code})),100/scale)
                self.assertAlmostEqual(info["meters_per_unit"],scale,places=8)
                self.assertEqual(info["source"],"declared")

    def test_missing_unknown_and_unconvertible_units_keep_explicit_estimate_provenance(self):
        for code in (None,0,99,8,-1,True,"broken",float("nan")):
            for span,expected in ((20,1),(80,.1),(100,.1),(2000,.001)):
                with self.subTest(code=str(code),span=span):
                    info=resolve_unit_scale(SimpleNamespace(doc=SimpleNamespace(header={"$INSUNITS":code})),span)
                    self.assertEqual(info["meters_per_unit"],expected);self.assertIsNone(info["declared_meters_per_unit"])
                    self.assertEqual(info["source"],"span_estimate");self.assertTrue(info["requires_calibration"])
                    self.assertIn("标定",info["note"]);json.dumps(info,allow_nan=False)

    def test_header_read_failure_uses_unknown_estimate_and_invalid_span_is_rejected(self):
        header=SimpleNamespace(get=Mock(side_effect=RuntimeError("synthetic broken header")))
        self.assertEqual(resolve_unit_scale(SimpleNamespace(doc=SimpleNamespace(header=header)),100)["meters_per_unit"],.1)
        for span in (0,-1,float("nan"),float("inf")):
            with self.subTest(span=span):
                with self.assertRaises(ValueError):resolve_unit_scale(SimpleNamespace(),span)

    def test_actual_door_gap_hint_cannot_override_declared_metre_scale(self):
        _,msp=self.drawing(width=50,height=40)
        for y in range(4,36,4):
            msp.add_line((5,y),(20,y));msp.add_line((30,y),(45,y))
        sample=[segment for entity in msp for segment in layout._segments_of(entity)]
        self.assertTrue(layout._decimeter_door_gaps(sample))
        spaces,*_=layout.build_space_layout(msp)
        self.assertEqual(spaces["floors"][0]["geometry"]["meters_per_unit"],1)
        info=spaces["unit_info"]
        self.assertTrue(info["decimeter_hint"]);self.assertIn("door_hint_conflicts_with_declaration",info["conflicts"])
        self.assertTrue(info["requires_calibration"]);self.assertIn("声明比例未改动",info["note"])

    def test_unknown_units_still_support_door_hint_and_declared_units_are_not_replaced(self):
        for code in (0,6,5,4,1,14):
            info=resolve_unit_scale(SimpleNamespace(doc=SimpleNamespace(header={"$INSUNITS":code})),100,decimeter_hint=True)
            if code==0:
                self.assertEqual((info["source"],info["meters_per_unit"]),("door_gap_estimate",.1))
                self.assertTrue(info["requires_calibration"])
            else:
                self.assertEqual(info["source"],"declared")
                expected={6:1,5:.01,4:.001,1:.0254,14:.1}[code]
                self.assertEqual(info["meters_per_unit"],expected)

    def test_memory_dxf_parse_passes_unit_info_without_file_recovery_or_conversion(self):
        doc,_=self.drawing();text=StringIO();doc.write(text)
        with patch("app.services.cad.dxf_reader.tempfile.mkstemp",side_effect=AssertionError("no file recovery")):
            parsed=parse_dxf_bytes(text.getvalue().encode("utf-8"),source_file_name="synthetic.dxf",max_entities=100)
        spaces=parsed.payload["spaces"]
        self.assertEqual(parsed.payload["meta"]["units"],"meters")
        self.assertEqual(spaces["unit_info"]["header_insunits"],6)
        self.assertEqual(spaces["floors"][0]["rooms"][0]["area_m2"],8000)
        self.assertNotIn("space_layout_failed",parsed.warnings)
        json.dumps(parsed.payload,allow_nan=False)

    def test_unit_wrapper_keeps_tuple_contract(self):
        _,msp=self.drawing()
        scale,note=layout._meters_per_unit(msp,100)
        self.assertEqual(scale,1);self.assertIn("米",note)

    def test_user_calibration_overrides_metadata_preserves_initial_basis_and_is_idempotent(self):
        result,floor=self.build(width=20,height=16,code=5,scale=.01)
        before=deepcopy(result[0]["unit_info"]);other=deepcopy(floor);other["floor_index"]=2
        result[0]["floors"].append(other)
        payload,inputs,images=self.calibrate(result,floor,20)
        info=floor["unit_info"]
        self.assertEqual(info["source"],"user_calibration");self.assertEqual(info["initial_source"],"declared")
        self.assertEqual(info["header_insunits"],5);self.assertEqual(info["declared_meters_per_unit"],.01)
        self.assertAlmostEqual(info["meters_per_unit"],.01)
        self.assertTrue(info["calibration_confirmed"]);self.assertFalse(info["requires_calibration"])
        self.assertEqual(result[0]["unit_info"],before);self.assertEqual(result[0]["floors"][1],other)
        saved=deepcopy(payload)
        with patch.object(preparation,"read_binary_asset",side_effect=lambda name:images[name]):preparation.save_preparation(payload,inputs)
        self.assertEqual(payload,saved)

    def test_manual_confirmed_length_repairs_legacy_wrong_scale_without_reparsing_or_touching_other_artifacts(self):
        result,floor=self.build();floor.pop("unit_info");floor["geometry"]["meters_per_unit"]*=.1
        floor["square_meters_per_pixel"]*=.01
        for room in floor["rooms"]:
            room["area_m2"]*=.01;room["polygon"]=[[x*.1,y*.1] for x,y in room["polygon"]]
            room["usable"]["area_m2"]*=.01
            room["usable"]["polygons"]=[[[x*.1,y*.1] for x,y in ring] for ring in room["usable"]["polygons"]]
        floor["undo_stack"]=[{"rooms":deepcopy(floor["rooms"])}]
        # The raw drawing width is 100 units; the user explicitly confirms 100m.
        with Image.open(BytesIO(result[2][0])) as mask:w,h=mask.size
        pixels=100*floor["geometry"]["scale"]
        inputs={"floor_index":1,"calibration":{"points":[{"x":4/w,"y":4/h},{"x":(4+pixels)/w,"y":4/h}],"meters":100},
                "room_kinds":{r["room_id"]:"office" for r in floor["rooms"]},"routes":[]}
        floor["mask_file"]="synthetic/mask.png";floor["line_file"]="synthetic/lines.png"
        images={floor["mask_file"]:result[2][0],floor["line_file"]:result[3][0]}
        payload={"spaces":result[0],"fitout_artifact":{"synthetic":"preserve"}}
        preserved=deepcopy(payload["fitout_artifact"])
        with patch.object(preparation,"read_binary_asset",side_effect=lambda name:images[name]):preparation.save_preparation(payload,inputs)
        self.assertAlmostEqual(floor["geometry"]["meters_per_unit"],1)
        self.assertAlmostEqual(floor["rooms"][0]["area_m2"],8000,delta=8000*.015)
        with Image.open(BytesIO(images[floor["mask_file"]])) as mask:
            expected=round(mask.histogram()[int(floor["rooms"][0]["marker"])]*(100/pixels)**2,2)
        self.assertEqual(floor["rooms"][0]["area_m2"],expected)
        self.assertEqual(floor["unit_info"]["initial_source"],"legacy_unknown")
        self.assertEqual(floor["unit_info"]["initial_meters_per_unit"],.1)
        self.assertIsNone(floor["unit_info"]["header_insunits"])
        self.assertAlmostEqual(floor["undo_stack"][0]["rooms"][0]["area_m2"],8000,delta=1)
        self.assertEqual(payload["fitout_artifact"],preserved)
        self.assertAlmostEqual(fitout._meters_per_pixel(floor),math.sqrt(floor["square_meters_per_pixel"]))
        points=floor["rooms"][0]["polygon"];self.assertGreater(max(x for x,y in points),99)

    def test_unit_metadata_is_independent_between_initial_and_floor_records(self):
        result,floor=self.build()
        floor["unit_info"]["conflicts"].append("synthetic_mutation")
        self.assertNotIn("synthetic_mutation",result[0]["unit_info"]["conflicts"])
        original=deepcopy(floor);info=calibrated_unit_scale(floor,2)
        self.assertEqual(floor,original);self.assertEqual(info["source"],"user_calibration")
        for scale in (0,-1,float("inf"),float("nan")):
            with self.assertRaises(ValueError):calibrated_unit_scale(floor,scale)

    def test_existing_millimetre_service_fixtures_keep_all_original_assertions(self):
        import ast
        import io
        path=BACKEND/'tests/test_cad_extract.py';tree=ast.parse(path.read_text(encoding='utf-8'))
        selected={'test_parse_dxf_extracts_layers_and_room_labels','test_closed_rectangle_becomes_an_unassigned_room',
                  'test_toilet_marks_dirty_side_and_stacked_cores_align','test_door_gap_splits_rooms_and_marks_entrance',
                  'test_stair_flight_is_not_parsed_as_a_room','test_window_recess_is_not_a_room'}
        cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='CadExtractServiceTests')
        cls.body=[n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name in selected]
        self.assertEqual({n.name for n in cls.body},selected)
        helper=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_build_sample_dxf_bytes')
        module=ast.fix_missing_locations(ast.Module(body=[helper,cls],type_ignores=[]))
        namespace={'__name__':'r96_old_service_fixture','ezdxf':ezdxf,'io':io,'unittest':unittest,'parse_dxf_bytes':parse_dxf_bytes}
        exec(compile(module,str(path),'exec'),namespace)
        for name in sorted(selected):
            with self.subTest(method=name):
                case=namespace['CadExtractServiceTests'](name);result=unittest.TestResult();case.run(result)
                self.assertEqual(result.testsRun,1);self.assertEqual(result.skipped,[])
                self.assertEqual(result.expectedFailures,[])
                self.assertTrue(result.wasSuccessful(),str(result.errors+result.failures))
