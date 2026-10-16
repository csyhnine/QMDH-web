"""Optional DWG → DXF conversion via external CLI."""

from __future__ import annotations

import logging
import os
import shlex
import signal
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)
_POSIX = os.name != "nt"


@dataclass(frozen=True)
class DwgConversionResult:
    ok: bool
    dxf_bytes: bytes | None = None
    dxf_file_name: str | None = None
    warnings: tuple[str, ...] = ()
    error: str | None = None


def converter_configured() -> bool:
    return bool((settings.cad_dwg_converter_cmd or "").strip())


def _oda_executable(command_template: str) -> Path | None:
    """Treat a bare ODAFileConverter path as the folder-based CLI, not a shell template."""
    if "{input}" in command_template or "{output_dir}" in command_template:
        return None
    candidate = Path(command_template.strip().strip('"'))
    if candidate.is_file() and candidate.name.lower() == "odafileconverter.exe":
        return candidate
    return None


def _run_converter(
    command_template: str,
    *,
    input_path: Path,
    output_dir: Path,
) -> subprocess.CompletedProcess[str]:
    oda_exe = _oda_executable(command_template)
    if oda_exe is not None:
        command = [str(oda_exe), str(input_path.parent), str(output_dir), "ACAD2018", "DXF", "0", "1", "*.dwg"]
    else:
        # Split the trusted template BEFORE substituting user-controlled paths.
        command = [arg.format(input=str(input_path), output_dir=str(output_dir))
                   for arg in shlex.split(command_template)]
    with subprocess.Popen(command, shell=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, start_new_session=_POSIX) as process:
        try:
            stdout, stderr = process.communicate(timeout=settings.cad_dwg_converter_timeout_seconds)
        except subprocess.TimeoutExpired:
            try:
                if _POSIX:
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
            except ProcessLookupError:
                pass
            process.communicate()
            raise
        return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def convert_dwg_bytes(content: bytes, *, source_name: str) -> DwgConversionResult:
    command_template = (settings.cad_dwg_converter_cmd or "").strip()
    if not command_template:
        return DwgConversionResult(
            ok=False,
            error="dwg_converter_not_configured",
            warnings=("服务端未配置 DWG 转换器。",),
        )

    # Each conversion has one isolated source; no user filename enters the CLI.
    with tempfile.TemporaryDirectory(prefix="qmdh-cad-dwg-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "source.dwg"
        output_dir = temp_path / "out"
        output_dir.mkdir(parents=True, exist_ok=True)
        input_path.write_bytes(content)

        try:
            completed = _run_converter(command_template, input_path=input_path, output_dir=output_dir)
        except subprocess.TimeoutExpired:
            return DwgConversionResult(ok=False, error="dwg_converter_timeout")
        except (OSError, ValueError, KeyError) as exc:
            logger.warning("cad_dwg_converter_failed", extra={"error": str(exc)})
            return DwgConversionResult(ok=False, error="dwg_converter_exec_failed")

        if completed.returncode != 0:
            stderr = (completed.stderr or completed.stdout or "").strip()
            return DwgConversionResult(
                ok=False,
                error="dwg_converter_failed",
                warnings=(stderr[:500],) if stderr else (),
            )

        dxf_candidates = sorted(output_dir.rglob("*.dxf"))
        if not dxf_candidates:
            root_dxf = sorted(temp_path.rglob("*.dxf"))
            dxf_candidates = root_dxf
        if not dxf_candidates:
            return DwgConversionResult(ok=False, error="dwg_converter_no_dxf_output")

        chosen = dxf_candidates[0]
        return DwgConversionResult(
            ok=True,
            dxf_bytes=chosen.read_bytes(),
            dxf_file_name=chosen.name,
            warnings=(),
        )
