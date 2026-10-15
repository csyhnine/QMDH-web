"""Bounded, best-effort GIF optimization for newly uploaded files only."""
from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import logging
from pathlib import Path
import shutil
import struct
import subprocess
from tempfile import TemporaryDirectory
from threading import BoundedSemaphore
from time import monotonic
import warnings

from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)
_slots = BoundedSemaphore(2)  # Per API process; do not queue uploads behind encoders.
MAX_INPUT_BYTES = 20 * 1024 * 1024
MAX_FRAME_PIXELS = 8_000_000
MAX_DECODED_PIXELS = 250_000_000
MAX_FRAMES = 1200
MAX_DURATION_MS = 120_000


def is_gif(content: bytes) -> bool:
    return content[:6] in (b"GIF87a", b"GIF89a")


@dataclass(frozen=True)
class GifInfo:
    width: int
    height: int
    frames: int
    duration_ms: int
    min_delay_ms: int
    loop: int | None
    transparent: bool


@dataclass(frozen=True)
class GifOptions:
    target_bytes: int
    max_edge: int
    max_fps: float
    max_colors: int
    allow_resize: bool
    allow_frame_reduction: bool
    min_edge: int
    min_fps: float
    min_colors: int

    @classmethod
    def from_settings(cls) -> GifOptions:
        return cls(**{name: getattr(settings, "gif_" + name) for name in cls.__dataclass_fields__})


def _inspect(content: bytes, deadline: float) -> GifInfo:
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(BytesIO(content)) as image:
            if image.format != "GIF":
                raise ValueError("Not GIF")
            width, height = image.size
            if width * height > MAX_FRAME_PIXELS:
                raise ValueError("Frame too large")
            loop = image.info.get("loop")
            frames, duration, delay, transparent = 0, 0, 1000, False
            decoded_pixels = 0
            while True:
                frame_pixels = image.width * image.height
                decoded_pixels += frame_pixels
                if (monotonic() >= deadline or frames >= MAX_FRAMES
                        or frame_pixels > MAX_FRAME_PIXELS or decoded_pixels > MAX_DECODED_PIXELS):
                    raise ValueError("Decode budget exceeded")
                image.load()  # Validate all frames, including the final frame.
                alpha = image.convert("RGBA").getextrema()[3]
                transparent = transparent or alpha[0] < 128
                frame_delay = int(image.info.get("duration", 100))
                if frame_delay < 20:
                    raise ValueError("Ambiguous browser frame timing")
                delay = min(delay, frame_delay)
                duration += frame_delay
                if duration > MAX_DURATION_MS:
                    raise ValueError("Animation too long")
                frames += 1
                try:
                    image.seek(frames)
                except EOFError:
                    break
            return GifInfo(width, height, frames, duration, delay, loop, transparent)


def compress_gif(content: bytes, *, options: GifOptions | None = None) -> bytes | None:
    """Return a validated smaller GIF, or None to keep the upload unchanged."""
    if not settings.gif_compression_enabled or not is_gif(content) or len(content) > MAX_INPUT_BYTES:
        return None
    policy = options or GifOptions.from_settings()
    target = policy.target_bytes
    if target and len(content) <= target:
        return None
    best: bytes | None = None
    if not _slots.acquire(blocking=False):
        logger.info("GIF optimization skipped: encoder busy")
        return None
    try:
        deadline = monotonic() + 20
        binary = shutil.which(settings.ffmpeg_binary)
        if not binary:
            logger.warning("GIF optimization skipped: FFmpeg unavailable")
            return None
        info = _inspect(content, deadline)
        # Never raise the source frame rate; a still GIF needs no frame resampling.
        max_edge = policy.max_edge
        max_fps = policy.max_fps
        colors = policy.max_colors
        with TemporaryDirectory(prefix="qmdh-gif-") as folder:
            root = Path(folder)
            source, palette, output = root / "input.gif", root / "palette.png", root / "output.gif"
            source.write_bytes(content)
            common = [binary, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"]

            def run(args: list[str]) -> None:
                remaining = deadline - monotonic()
                if remaining <= 0:
                    raise TimeoutError()
                subprocess.run(common + args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=remaining, check=True)

            def profiles():
                # Try palette reduction before changing motion or dimensions.
                yield max_edge, max_fps, colors
                if not target:
                    return
                low_colors = min(colors, policy.min_colors)
                for palette_colors in sorted({max(low_colors, min(colors, n)) for n in (96, 64, 32)}, reverse=True):
                    if palette_colors < colors:
                        yield max_edge, max_fps, palette_colors
                current_fps = max_fps
                effective_fps = max_fps or 1000 / info.min_delay_ms
                if policy.allow_frame_reduction and info.frames > 1:
                    for rate in (12, 8, policy.min_fps):
                        next_fps = max(policy.min_fps, min(effective_fps, rate))
                        if next_fps < effective_fps:
                            current_fps = next_fps
                            effective_fps = next_fps
                            yield max_edge, current_fps, low_colors
                if not policy.allow_resize:
                    return
                edge = min(max_edge or max(info.width, info.height), max(info.width, info.height))
                floor = min(edge, policy.min_edge)
                for _ in range(3):
                    estimate = len(best) if best else len(content)
                    ratio = min(0.8, (target / estimate) ** 0.5 * 0.9)
                    next_edge = max(floor, int(edge * ratio))
                    if next_edge >= edge:
                        return
                    edge = next_edge
                    yield edge, current_fps, low_colors

            seen = set()
            for edge, rate, palette_colors in profiles():
                if (edge, rate, palette_colors) in seen:
                    continue
                seen.add((edge, rate, palette_colors))
                fps = min(rate, 1000 / info.min_delay_ms) if rate else 0
                filters = (f"scale=w='min({edge},iw)':h='min({edge},ih)':force_original_aspect_ratio=decrease:flags=lanczos"
                           if edge else "null")
                if info.frames > 1 and fps:
                    filters = f"fps={fps}," + filters
                run(["-ignore_loop", "1", "-i", str(source), "-vf", filters + f",palettegen=max_colors={palette_colors}:reserve_transparent=1",
                     "-frames:v", "1", str(palette)])
                run(["-ignore_loop", "1", "-i", str(source), "-i", str(palette), "-lavfi",
                     f"[0:v]{filters}[scaled];[scaled][1:v]paletteuse=dither=bayer:bayer_scale=3",
                     "-fps_mode", "passthrough", "-loop", str(info.loop if info.loop is not None else -1),
                     "-fs", str(len(content)), str(output)])
                optimized = output.read_bytes()
                if len(optimized) >= (len(best) if best else len(content)):
                    continue
                result = _inspect(optimized, deadline)
                if (result.loop != info.loop or (info.frames > 1 and result.frames < 2)
                        or result.width > min(info.width, edge or info.width)
                        or result.height > min(info.height, edge or info.height)
                        or (info.transparent and not result.transparent)
                        or (info.frames > 1 and abs(result.duration_ms - info.duration_ms) > (max(100, 1000 / fps) if fps else 100))):
                    continue
                best = optimized
                if not target or len(best) <= target:
                    break
            if best:
                logger.info("GIF optimized: %d -> %d bytes; target=%d; met=%s", len(content), len(best), target, not target or len(best) <= target)
            return best
    except (OSError, ValueError, EOFError, SyntaxError, IndexError, OverflowError, struct.error,
            TimeoutError, subprocess.SubprocessError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        # Avoid logging content, filenames, subprocess output or user-controlled metadata.
        logger.warning("GIF optimization stopped: invalid input, budget, or encoder failure; keeping best validated result")
        return best
    finally:
        _slots.release()
