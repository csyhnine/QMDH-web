import copy
from io import BytesIO

import pytest
from PIL import Image, ImageDraw
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import Base, get_db
from app.models import CadExtract, User
from app.routers import cad
from app.schemas import CadPreparationIn, CadRouteSuggestionsOut
from app.services.cad.circulation import suggest_routes
from app.services.cad.preparation import reserved_route_mask, save_preparation
from app.services.media_storage import read_binary_asset, write_binary_asset


@pytest.fixture
def plan():
    mask = Image.new("L", (240, 140), 0); draw = ImageDraw.Draw(mask)
    draw.rectangle((10, 10, 118, 129), fill=1); draw.rectangle((122, 10, 229, 129), fill=2)
    lines = Image.new("RGBA", mask.size, (0, 0, 0, 0)); wall = ImageDraw.Draw(lines)
    wall.rectangle((10, 10, 229, 129), outline="white", width=2)
    wall.line((120, 10, 120, 49), fill="white", width=2)
    wall.line((120, 91, 120, 129), fill="white", width=2)
    def write(name, image):
        b = BytesIO(); image.save(b, format="PNG"); write_binary_asset(name, b.getvalue())
    write("cad/routes-mask.png", mask); write("cad/routes-lines.png", lines)
    floor = {"floor_index": 1, "mask_file": "cad/routes-mask.png", "line_file": "cad/routes-lines.png",
             "square_meters_per_pixel": .01, "geometry": {"min_x": 0, "max_y": 14, "scale": 10, "meters_per_unit": 1},
             "rooms": [{"room_id": f"r{i}", "marker": str(i), "area_ratio": .5, "area_m2": 120, "entrance": i == 1,
                        "proposal": "接待或开放办公"} for i in (1, 2)]}
    payload = {"spaces": {"floors": [floor], "fitout": {"floors": [{"floor_index": 1, "furniture": [{"id": "old"}]}]}}}
    inputs = {"floor_index": 1, "calibration": {"points": [{"x": 20/240, "y": 20/140}, {"x": 220/240, "y": 20/140}], "meters": 20},
              "room_kinds": {"r1": "reception", "r2": "office"}, "width_m": 1.2, "entry": None}
    return payload, inputs, mask, lines, write


def test_generated_network_connects_through_door_without_writes_and_can_be_saved(plan):
    payload, inputs, mask, lines, _ = plan
    before = copy.deepcopy(payload); raw = read_binary_asset("cad/routes-mask.png")
    result = suggest_routes(payload, inputs)
    assert result["status"] == "ok", result
    assert set(result["connected_room_ids"]) == {"r1", "r2"}
    assert result["entry_source"] == "entrance_room"
    assert result["routes"] and all(r["origin"] == "system" for r in result["routes"])
    assert payload == before and read_binary_asset("cad/routes-mask.png") == raw
    CadRouteSuggestionsOut.model_validate(result)
    prepared_inputs = CadPreparationIn.model_validate({**inputs, "routes": result["routes"], "entry": result["entry"]}).model_dump()
    saved = save_preparation(copy.deepcopy(payload), prepared_inputs)
    reserved = reserved_route_mask(saved["spaces"]["floors"][0], mask.size).load()
    pixels = lines.load()
    assert not any(reserved[x, y] and pixels[x, y][3] for y in range(mask.height) for x in range(mask.width))


def test_closed_wall_reports_unreachable_instead_of_drawing_through_it(plan):
    payload, inputs, _, lines, write = plan
    ImageDraw.Draw(lines).line((120, 10, 120, 129), fill="white", width=2)
    write("cad/routes-lines.png", lines)
    result = suggest_routes(payload, inputs)
    assert result["status"] == "partial"
    assert result["unreachable_room_ids"] == ["r2"]
    assert all(p["x"] < .5 for r in result["routes"] for p in r["points"])


@pytest.mark.parametrize("blocker", ["column", "core"])
def test_full_width_route_avoids_columns_and_known_core_boxes(plan, blocker):
    payload, inputs, mask, lines, write = plan
    box = (64, 54, 84, 94)
    if blocker == "column":
        ImageDraw.Draw(lines).rectangle(box, fill="white")
        write("cad/routes-lines.png", lines)
    else:
        payload["spaces"]["floors"][0]["anchors"] = [{"label": "电梯", "bbox": [6, 5, 8, 9]}]
    result = suggest_routes(payload, inputs)
    assert result["status"] == "ok", result
    prepared = save_preparation(copy.deepcopy(payload), {**inputs, "routes": result["routes"]})
    reserved = reserved_route_mask(prepared["spaces"]["floors"][0], mask.size).load()
    assert not any(reserved[x, y] for y in range(box[1], box[3] + 1) for x in range(box[0], box[2] + 1))


def test_route_width_is_checked_not_just_centerline(plan):
    payload, inputs, _, _, _ = plan
    inputs["width_m"] = 4
    result = suggest_routes(payload, inputs)
    assert "r2" in result["unreachable_room_ids"]


def test_user_root_on_obstacle_does_not_teleport_to_other_side(plan):
    payload, inputs, _, _, _ = plan
    inputs["entry"] = {"x": .5, "y": .2}
    result = suggest_routes(payload, inputs)
    assert result["status"] == "unavailable" and result["routes"] == []
    assert result["entry_source"] == "user"


def test_explicit_root_is_used_and_missing_entrance_is_disclosed(plan):
    payload, inputs, _, _, _ = plan
    for room in payload["spaces"]["floors"][0]["rooms"]: room["entrance"] = False
    result = suggest_routes(payload, inputs)
    assert result["entry_source"] == "suggested"
    assert any("未识别明确入口" in warning for warning in result["warnings"])
    inputs["entry"] = {"x": .75, "y": .5}
    result = suggest_routes(payload, inputs)
    assert result["entry_source"] == "user" and result["status"] == "ok"


def test_no_line_image_never_claims_automatic_avoidance(plan):
    payload, inputs, _, _, _ = plan
    payload["spaces"]["floors"][0].pop("line_file")
    result = suggest_routes(payload, inputs)
    assert result["status"] == "unavailable" and result["routes"] == []


def test_api_is_read_only_and_keeps_owner_boundary(plan):
    payload, inputs, _, _, _ = plan
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add(User(id=1, name="routing", role="designer", password_hash="unused", is_active=True, project_codes=[]))
        db.add(CadExtract(public_id="ce_routes", user_id=1, file_name="test.dxf", source_format="dxf", source_storage_path="fixture.dxf",
                          status="ok", sha256="0" * 64, payload_json=payload, warnings_json=[])); db.commit()
    app = FastAPI(); app.include_router(cad.router)
    def database():
        with sessions() as db: yield db
    app.dependency_overrides[get_db] = database
    app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="test", token="unused", user_id=2)
    with TestClient(app) as client:
        url = "/cad/extracts/ce_routes/route-suggestions"
        assert client.post(url, json=inputs).status_code == 404
        app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="test", token="unused", user_id=1)
        response = client.post(url, json=inputs)
        assert response.status_code == 200, response.text
        assert response.json()["routes"]
    with sessions() as db: assert db.query(CadExtract).one().payload_json == payload
    engine.dispose()
