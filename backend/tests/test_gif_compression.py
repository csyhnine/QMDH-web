from base64 import b64encode
from io import BytesIO
from pathlib import Path
import random
import shutil
import subprocess
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.core.auth import get_current_auth_user
from app.core.config import AuthUserProfile, settings
from app.routers import assets, chat
from app.services import gif_compression as gif
from app.services import media_storage as storage
from app.routers.agent import _write_agent_artifact
from app.schemas import AgentProjectArtifactCreate


@pytest.fixture(autouse=True)
def single_pass_unless_target_is_explicit():
    with patch.object(settings, "gif_target_bytes", 0):
        yield


def animation(*, loop=0, width=128, height=72, frames=20, transparent=False, duration=80):
    rng = random.Random(17)
    images = []
    for _ in range(frames):
        image = Image.frombytes("P", (width, height), rng.randbytes(width * height))
        image.putpalette([value for i in range(256) for value in (i, (i * 71) % 256, (i * 131) % 256)])
        if transparent:
            image.paste(0, (0, 0, min(20, width), min(20, height)))
        images.append(image)
    output = BytesIO()
    options = {"loop": loop} if loop is not None else {}
    if transparent:
        options["transparency"] = 0
    images[0].save(output, format="GIF", save_all=True, append_images=images[1:], duration=duration,
                   disposal=2, optimize=False, **options)
    return output.getvalue()


@pytest.mark.parametrize("loop,transparent,width,height", [(0, True, 128, 72), (2, False, 128, 72), (None, False, 1000, 32)])
@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="FFmpeg integration requires installed binary")
def test_real_ffmpeg_smaller_animation_preserves_loop_duration_and_transparency(loop, transparent, width, height):
    original = animation(loop=loop, transparent=transparent, width=width, height=height)
    with patch.object(settings, "ffmpeg_binary", shutil.which("ffmpeg")), patch.object(settings, "gif_compression_enabled", True), patch.object(settings, "gif_max_edge", 960), patch.object(settings, "gif_max_fps", 12):
        optimized = gif.compress_gif(original)
    assert optimized is not None
    assert len(optimized) < len(original)
    before = gif._inspect(original, float("inf"))
    after = gif._inspect(optimized, float("inf"))
    assert after.frames > 1
    assert after.loop == before.loop
    assert max(after.width, after.height) <= 960
    assert abs(after.duration_ms - before.duration_ms) <= 100
    assert not transparent or after.transparent


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="Requires FFmpeg")
@pytest.mark.parametrize("edge,fps,colors", [(0, 0, 64), (400, 8, 32)])
def test_compression_options_preserve_original_dimensions_or_apply_custom_limits(edge, fps, colors):
    original = animation(width=1000, height=32)
    with patch.object(settings, "ffmpeg_binary", shutil.which("ffmpeg")), patch.object(settings, "gif_max_edge", edge), patch.object(settings, "gif_max_fps", fps), patch.object(settings, "gif_max_colors", colors):
        optimized = gif.compress_gif(original)
    assert optimized is not None
    before = gif._inspect(original, float("inf"))
    after = gif._inspect(optimized, float("inf"))
    if edge == 0:
        assert (after.width, after.height, after.frames, after.duration_ms) == (before.width, before.height, before.frames, before.duration_ms)
    else:
        assert max(after.width, after.height) <= edge
        assert after.frames <= round(before.duration_ms * fps / 1000) + 1
    with Image.open(BytesIO(optimized)) as image:
        assert len(image.getcolors(maxcolors=256)) <= colors


def test_compression_options_reject_invalid_configuration():
    from app.core.config import Settings
    from pydantic import ValidationError
    for options in ({"gif_max_edge": -1}, {"gif_max_fps": 51}, {"gif_max_colors": 3}, {"gif_target_bytes": -1}):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, **options)


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="Requires FFmpeg")
def test_target_500kb_is_reached_by_adaptive_compression():
    original = animation(width=320, height=180)
    assert len(original) > 500_000
    with patch.object(settings, "gif_target_bytes", 500_000):
        optimized = gif.compress_gif(original)
    assert optimized is not None and len(optimized) <= 500_000
    before = gif._inspect(original, float("inf"))
    after = gif._inspect(optimized, float("inf"))
    assert after.frames > 1 and after.loop == before.loop
    assert abs(after.duration_ms - before.duration_ms) <= 170


def test_below_target_is_kept_without_encoding_and_missed_target_is_reported():
    original = animation(frames=2)
    with patch.object(settings, "gif_target_bytes", 500_000), patch.object(gif.subprocess, "run") as run:
        assert gif.compress_gif(original) is None
        run.assert_not_called()
    with TemporaryDirectory() as folder, patch.object(settings, "media_root", folder), patch.object(storage, "_oss_enabled", return_value=False), patch.object(settings, "gif_target_bytes", 1), patch.object(gif, "compress_gif", return_value=None):
        info = {}
        path = storage.write_uploaded_asset("references/large.gif", original, compression_info=info)
        assert info["target_met"] is False
        assert info["output_bytes"] == len(original)
        assert storage.read_binary_asset(path) == original


def test_later_timeout_keeps_best_validated_candidate():
    optimized = animation(frames=2)
    original = optimized + b"padding" * 100
    calls = []

    def encoder(command, **kwargs):
        calls.append(command)
        if len(calls) == 3:
            raise subprocess.TimeoutExpired("ffmpeg", 20)
        if command[-1].endswith("output.gif"):
            Path(command[-1]).write_bytes(optimized)

    with patch.object(settings, "gif_target_bytes", 1), patch.object(gif.shutil, "which", return_value="ffmpeg"), patch.object(gif.subprocess, "run", side_effect=encoder):
        assert gif.compress_gif(original) == optimized


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="Requires FFmpeg")
def test_unreachable_target_respects_disabled_resize_and_frame_reduction():
    original = animation()
    with patch.object(settings, "gif_target_bytes", 1), patch.object(settings, "gif_allow_resize", False), patch.object(settings, "gif_allow_frame_reduction", False):
        optimized = gif.compress_gif(original)
    assert optimized is not None and len(optimized) > 1
    before = gif._inspect(original, float("inf"))
    after = gif._inspect(optimized, float("inf"))
    assert (after.width, after.height, after.frames, after.duration_ms) == (before.width, before.height, before.frames, before.duration_ms)


def test_no_encoder_disabled_timeout_and_busy_fall_back_without_throwing():
    content = animation(frames=2)
    with patch.object(settings, "gif_compression_enabled", False), patch.object(gif.subprocess, "run") as run:
        assert gif.compress_gif(content) is None
        run.assert_not_called()
    with patch.object(settings, "gif_compression_enabled", True), patch.object(gif.shutil, "which", return_value=None):
        assert gif.compress_gif(content) is None
    with patch.object(settings, "gif_compression_enabled", True), patch.object(gif.shutil, "which", return_value="ffmpeg"), patch.object(gif.subprocess, "run", side_effect=subprocess.TimeoutExpired("ffmpeg", 20)):
        assert gif.compress_gif(content) is None
    assert gif._slots.acquire(False) and gif._slots.acquire(False)
    try:
        assert gif.compress_gif(content) is None
    finally:
        gif._slots.release()
        gif._slots.release()
    assert gif.compress_gif(b"GIF89a" + b"invalid") is None
    with patch.object(gif.subprocess, "run") as run:
        assert gif.compress_gif(b"GIF89a" + b"x" * gif.MAX_INPUT_BYTES) is None
        assert gif.compress_gif(b"\x89PNG\r\n\x1a\n") is None
        run.assert_not_called()


def test_decode_budget_is_checked_before_large_frame_load():
    with patch.object(gif, "MAX_DECODED_PIXELS", 10), patch.object(gif.shutil, "which", return_value="ffmpeg"), patch.object(gif.subprocess, "run") as run:
        assert gif.compress_gif(animation(frames=2)) is None
        run.assert_not_called()


def test_upload_storage_keeps_original_uses_derivative_and_falls_back_on_write_failure():
    original = animation(frames=2)
    with TemporaryDirectory() as folder, patch.object(settings, "media_root", folder), patch.object(storage, "_oss_enabled", return_value=False):
        with patch.object(gif, "compress_gif", return_value=b"GIF89a-small"):
            path = storage.write_uploaded_asset("references/image.png", original)
        assert path == "references/image.compressed.gif"
        assert (Path(folder) / "references/image.gif").read_bytes() == original
        assert storage.read_binary_asset(path) == b"GIF89a-small"
        with patch.object(gif, "compress_gif", return_value=None):
            assert storage.write_uploaded_asset("references/fallback.gif", original) == "references/fallback.gif"
        real_write = storage.write_binary_asset

        def fail_derivative(path, data, **kwargs):
            if ".compressed.gif" in path:
                raise OSError("disk full")
            return real_write(path, data, **kwargs)

        with patch.object(gif, "compress_gif", return_value=b"GIF89a-small"), patch.object(storage, "write_binary_asset", side_effect=fail_derivative):
            assert storage.write_uploaded_asset("references/disk.gif", original) == "references/disk.gif"
        with patch.object(gif, "compress_gif") as compress:
            assert storage.write_uploaded_asset("references/still.png", b"png") == "references/still.png"
            compress.assert_not_called()


@pytest.mark.parametrize("route", ["/assets/reference-upload", "/chat/attachments/upload"])
def test_uploaded_gif_endpoints_return_compressed_path_and_keep_original(route):
    app = FastAPI()
    app.include_router(assets.router)
    app.include_router(chat.router)
    app.dependency_overrides[get_current_auth_user] = lambda: AuthUserProfile(name="test", token="test")
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from sqlalchemy.pool import StaticPool
    from app.database import Base, get_db
    from app.models import User
    upload_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(upload_engine)
    with Session(upload_engine) as upload_db:
        upload_db.add(User(name="test", role="designer", password_hash="fixture", project_codes=[]))
        upload_db.commit()
    def upload_session():
        with Session(upload_engine) as upload_db:
            yield upload_db
    app.dependency_overrides[get_db] = upload_session
    original = animation(frames=2)
    with TemporaryDirectory() as folder, patch.object(settings, "media_root", folder), patch.object(storage, "_oss_enabled", return_value=False), patch.object(gif, "compress_gif", return_value=b"GIF89a-small"):
        response = TestClient(app).post(route, json={"file_name": "animation.gif", "data_url": "data:image/gif;base64," + b64encode(original).decode()})
        assert response.status_code == 201, response.text
        path = response.json()["storage_path"]
        assert path.endswith(".compressed.gif")
        assert response.json()["compression"]["compressed"] is True
        assert response.json()["compression"]["output_bytes"] == len(b"GIF89a-small")
        assert len(list(Path(folder).rglob("*.gif"))) == 2
        if "chat" in route:
            assert response.json()["mime_type"] == "image/gif"


def test_agent_inline_gif_uses_the_same_upload_processing():
    with TemporaryDirectory() as folder, patch.object(settings, "media_root", folder), patch.object(storage, "_oss_enabled", return_value=False), patch.object(gif, "compress_gif", return_value=b"GIF89a-small"):
        content = animation(frames=2)
        result = _write_agent_artifact(SimpleNamespace(code="TEST"), AgentProjectArtifactCreate(
            name="animation", data_url="data:image/gif;base64," + b64encode(content).decode()))
        assert result.endswith(".compressed.gif")
        assert storage.read_binary_asset(result.replace(".compressed.gif", ".gif")) == content


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="Requires FFmpeg")
@pytest.mark.parametrize("loop", [0, 2, None])
def test_recommended_25fps_preset_preserves_aspect_timing_loop_and_color_limit(loop):
    from dataclasses import replace
    original = animation(loop=loop, width=720, height=360, frames=8, duration=40)
    options = replace(gif.GifOptions.from_settings(), target_bytes=0,
                      max_edge=344, max_fps=12.5, max_colors=96)
    optimized = gif.compress_gif(original, options=options)
    assert optimized is not None
    before = gif._inspect(original, float("inf"))
    after = gif._inspect(optimized, float("inf"))
    assert (after.width, after.height) == (344, 172)
    assert after.frames == 4 and after.min_delay_ms == 80
    assert after.duration_ms == before.duration_ms and after.loop == loop
    with Image.open(BytesIO(optimized)) as image:
        for frame in range(image.n_frames):
            image.seek(frame)
            assert len(image.convert("RGB").getcolors(maxcolors=256)) <= 96


def test_gif_recommended_defaults_and_manual_schema_are_aligned():
    from app.core.config import Settings
    from app.schemas import GifCompressIn
    config = Settings(_env_file=None)
    payload = GifCompressIn(file_name="test.gif", data_url="data:image/gif;base64,R0lGODlh")
    assert (config.gif_max_edge, config.gif_max_fps, config.gif_max_colors) == (344, 12.5, 96)
    assert (payload.max_edge, payload.max_fps, payload.max_colors) == (344, 12.5, 96)
