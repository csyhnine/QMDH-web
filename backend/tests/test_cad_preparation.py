import copy
import math
from io import BytesIO
from unittest.mock import patch

import pytest
from PIL import Image
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile
from app.database import Base, get_db
from app.models import CadExtract, User
from app.routers import cad
from app.schemas import CadPreparationIn
from app.services.cad.fitout import build_floor_fitout, write_floor_fitout
from app.services.cad.fitout_score import _covered
from app.services.cad.preparation import require_preparation, reserved_route_mask, save_preparation
from app.services.media_storage import read_binary_asset, write_binary_asset


@pytest.fixture
def drawing():
    mask = Image.new("L", (100, 100), 1)
    buffer = BytesIO(); mask.save(buffer, format="PNG")
    write_binary_asset("cad/preparation-test-mask.png", buffer.getvalue())
    floor = {"floor_index": 1, "mask_file": "cad/preparation-test-mask.png", "square_meters_per_pixel": 0.01,
             "geometry": {"min_x": 0, "max_y": 10, "scale": 10, "meters_per_unit": 1},
             "rooms": [{"room_id": "r1", "marker": "1", "area_ratio": 1, "area_m2": 100, "proposal": "接待或开放办公"}],
             "undo_stack": [{"rooms": [{"area_m2": 100, "polygon": [[1, 2]], "usable": {"area_m2": 80, "polygons": [[[1, 2]]]}}]}]}
    payload = {"spaces": {"floors": [floor], "fitout": {"floors": [{"floor_index": 1, "furniture": [{"id": "old"}]}]}}}
    inputs = {"floor_index": 1, "calibration": {"points": [{"x": .1, "y": .1}, {"x": .9, "y": .1}], "meters": 8},
              "room_kinds": {"r1": "office"}, "routes": [{"points": [{"x": .5, "y": .05}, {"x": .5, "y": .95}], "width_m": 1.2}]}
    return payload, inputs, mask


def test_calibration_updates_area_geometry_and_undo_without_touching_assets_or_old_layout(drawing):
    payload, inputs, _ = drawing
    inputs["calibration"]["meters"] = 16
    previous = read_binary_asset("cad/preparation-test-mask.png")
    with patch("app.services.media_storage.write_binary_asset", side_effect=AssertionError("unexpected asset write")):
        save_preparation(payload, inputs)
    floor = payload["spaces"]["floors"][0]
    assert floor["square_meters_per_pixel"] == pytest.approx(.04)
    assert floor["rooms"][0]["area_m2"] == 400
    assert floor["geometry"]["meters_per_unit"] == 2
    assert floor["rooms"][0]["proposal"] == "办公"
    snap = floor["undo_stack"][0]["rooms"][0]
    assert snap["area_m2"] == 400 and snap["polygon"] == [[2, 4]]
    assert payload["spaces"]["fitout"]["floors"][0]["furniture"] == [{"id": "old"}]
    assert read_binary_asset(floor["mask_file"]) == previous
    require_preparation(floor, previous)
    # Saving unchanged inputs is idempotent, including undo geometry.
    save_preparation(payload, inputs)
    assert floor["rooms"][0]["area_m2"] == 400
    assert snap["polygon"] == [[2, 4]]


def test_all_variants_respect_full_route_footprint(drawing):
    payload, inputs, mask = drawing
    save_preparation(payload, inputs)
    floor = payload["spaces"]["floors"][0]
    result = build_floor_fitout(floor, mask, None)
    reserved = reserved_route_mask(floor, mask.size).load()
    assert len(result["variants"]) == 3
    assert all(v["furniture"] for v in result["variants"])
    for variant in result["variants"]:
        for f in variant["furniture"]:
            footprint = _covered(f["x"] * 100, f["y"] * 100, f["w"] * 100, f["h"] * 100, math.radians(f.get("angle", 0)), 100, 100)
            assert not any(reserved[x, y] for x, y in footprint)


def test_explicit_empty_room_stays_empty_and_is_not_penalized(drawing):
    payload, inputs, mask = drawing
    inputs["room_kinds"]["r1"] = "empty"
    save_preparation(payload, inputs)
    result = build_floor_fitout(payload["spaces"]["floors"][0], mask, None)
    assert all(v["furniture"] == [] and v["score"]["loss"] == 0 for v in result["variants"])


def test_changing_only_route_marks_old_fitout_as_outdated(drawing):
    payload, inputs, _ = drawing
    save_preparation(payload, inputs)
    floor = payload["spaces"]["floors"][0]
    previous = floor["preparation"]["signature"]
    inputs["routes"][0]["width_m"] = 1.8
    save_preparation(payload, inputs)
    assert previous != floor["preparation"]["signature"]


def test_unprepared_and_changed_room_or_mask_block_generation(drawing):
    payload, inputs, _ = drawing
    with pytest.raises(ValueError, match="请先保存"):
        write_floor_fitout(copy.deepcopy(payload), 1)
    save_preparation(payload, inputs)
    floor = payload["spaces"]["floors"][0]
    raw = read_binary_asset(floor["mask_file"])
    changed = copy.deepcopy(floor); changed["rooms"][0]["proposal"] = "会议"
    with pytest.raises(ValueError, match="重新确认"):
        require_preparation(changed, raw)
    with pytest.raises(ValueError):
        require_preparation(floor, raw + b"changed")
    # Clearing the old layout remains possible without calibration.
    assert write_floor_fitout({"spaces": {"floors": [{"floor_index": 1}]}}, 1, clear=True)["spaces"]["fitout"]["floors"] == []


@pytest.mark.parametrize("change", ["missing_kind", "unknown_kind", "short_scale", "duplicate_route"])
def test_bad_preparation_is_rejected(drawing, change):
    payload, inputs, _ = drawing
    if change == "missing_kind": inputs["room_kinds"] = {}
    if change == "unknown_kind": inputs["room_kinds"]["r1"] = "guess"
    if change == "short_scale": inputs["calibration"]["points"][1] = {"x": .11, "y": .1}
    if change == "duplicate_route": inputs["routes"][0]["points"][1] = inputs["routes"][0]["points"][0]
    with pytest.raises(ValueError): save_preparation(payload, inputs)


def test_schema_limits_and_finite_coordinates(drawing):
    _, inputs, _ = drawing
    for value in [float("nan"), float("inf"), -1, 1.1]:
        invalid = copy.deepcopy(inputs); invalid["calibration"]["points"][0]["x"] = value
        with pytest.raises(ValidationError): CadPreparationIn.model_validate(invalid)
    invalid = copy.deepcopy(inputs); invalid["routes"] = []
    with pytest.raises(ValidationError): CadPreparationIn.model_validate(invalid)


def test_preparation_api_persists_owned_record_and_denies_other_owner(drawing):
    payload, inputs, _ = drawing
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add(User(id=1, name="prep-test", role="designer", password_hash="unused", is_active=True, project_codes=[]))
        db.add(CadExtract(public_id="ce_prep_test", user_id=1, file_name="test.dxf", source_format="dxf", source_storage_path="fixture.dxf",
                          status="ok", sha256="0" * 64, payload_json=payload, warnings_json=[]))
        db.commit()
    app = FastAPI(); app.include_router(cad.router)
    def get_test_db():
        with sessions() as db: yield db
    app.dependency_overrides[get_db] = get_test_db
    app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="test", token="unused", user_id=2)
    with TestClient(app) as client:
        url = "/cad/extracts/ce_prep_test/preparation"
        assert client.post(url, json=inputs).status_code == 404
        app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="test", token="unused", user_id=1)
        response = client.post(url, json=inputs)
        assert response.status_code == 200, response.text
        fetched = client.get("/cad/extracts/ce_prep_test").json()
        assert fetched["data"]["spaces"]["floors"][0]["preparation"]["calibration"]["meters"] == 8
    engine.dispose()
