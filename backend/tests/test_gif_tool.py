from base64 import b64encode
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile, settings
from app.routers import assets
from app.services import gif_compression as gif, media_storage as storage
from tests.test_gif_compression import animation


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(assets.router)
    app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="gif-tool-test", token="test")
    with TemporaryDirectory() as root, patch.object(settings, "media_root", root), patch.object(storage, "_oss_enabled", return_value=False), patch.object(assets.shutil, "which", return_value="ffmpeg"):
        yield TestClient(app), root


def payload():
    return {"file_name": "original.gif", "data_url": "data:image/gif;base64," + b64encode(animation(frames=2)).decode(),
            "target_kb": 300, "max_edge": 640, "max_fps": 10, "max_colors": 64,
            "allow_resize": False, "allow_frame_reduction": False}


def test_manual_options_are_request_local_and_original_is_downloadable(client):
    http, root = client
    baseline = gif.GifOptions.from_settings()
    seen = []

    def optimize(content, *, options):
        seen.append(options)
        return content[:-1]  # Storage integration fixture only, encoder validation has separate real tests.

    with patch.object(gif, "compress_gif", side_effect=optimize):
        response = http.post("/assets/gif-compress", json=payload())
        assert response.status_code == 201, response.text
        result = response.json()
        assert result["compression"]["target_bytes"] == 300_000
        assert result["compression"]["compressed"] is True
        assert result["compression"]["target_met"] is True
        assert result["original_storage_path"].endswith(".gif")
        assert ".compressed.gif" not in result["original_storage_path"]
        assert len(list(Path(root).rglob("*.gif"))) == 2
        response2 = http.post("/assets/gif-compress", json={**payload(), "target_kb": 750, "max_edge": 0})
        assert response2.status_code == 201
        assert seen[0].target_bytes == 300_000 and seen[0].max_edge == 640
        assert not seen[0].allow_resize and not seen[0].allow_frame_reduction
        assert seen[1].target_bytes == 750_000 and seen[1].max_edge == 0
    assert gif.GifOptions.from_settings() == baseline


@pytest.mark.parametrize("patch_body", [{"target_kb": 0}, {"max_colors": 257}, {"max_edge": -1}, {"max_fps": 51}])
def test_manual_options_are_validated(client, patch_body):
    assert client[0].post("/assets/gif-compress", json={**payload(), **patch_body}).status_code == 422


def test_invalid_file_and_disabled_encoder_have_clear_errors(client):
    http, root = client
    data = {**payload(), "data_url": "data:image/gif;base64," + b64encode(b"not a GIF" * 4).decode()}
    assert http.post("/assets/gif-compress", json=data).status_code == 422
    assert http.post("/assets/gif-compress", json={**payload(), "data_url": "data:image/gif;base64,INVALID!!!!!!!!!!!!"}).status_code == 400
    with patch.object(settings, "gif_compression_enabled", False):
        assert http.post("/assets/gif-compress", json=payload()).status_code == 503
    with patch.object(assets.shutil, "which", return_value=None):
        assert http.post("/assets/gif-compress", json=payload()).status_code == 503
    assert not list(Path(root).rglob("*.gif"))


def test_manual_gif_requires_login():
    app = FastAPI(); app.include_router(assets.router)
    assert TestClient(app).post("/assets/gif-compress", json=payload()).status_code == 401
