from pathlib import Path
import subprocess
from unittest.mock import patch, MagicMock

import pytest

from app.core.config import settings
from app.services.cad import dwg_converter as dwg
from app.scripts.convert_dwg_oda import oda_command


def test_oda_wrapper_uses_virtual_display_and_separate_paths(tmp_path):
    source = tmp_path / "drawing with spaces.dwg"
    source.write_bytes(b"AC1032")
    output = tmp_path / "output folder"; output.mkdir()
    with patch("app.scripts.convert_dwg_oda.shutil.which", side_effect=lambda name: "/usr/bin/" + name):
        argv, env = oda_command(source, output)
    assert argv[:4] == ["/usr/bin/xvfb-run", "-a", "--server-args=-screen 0 1024x768x24", "/usr/bin/ODAFileConverter"]
    assert argv[4:] == [str(source.parent.resolve()), str(output.resolve()), "ACAD2018", "DXF", "0", "1", "*.dwg"]
    assert env["QT_QPA_PLATFORM"] == "xcb"
    assert Path(env["XDG_RUNTIME_DIR"]).is_dir()


def test_command_template_never_interprets_filename_as_shell_code(tmp_path):
    process = MagicMock(); process.communicate.return_value = ("", ""); process.returncode = 0
    source = tmp_path / 'drawing $(touch owned); "test".dwg'
    with patch.object(dwg.subprocess, "Popen") as popen:
        popen.return_value.__enter__.return_value = process
        dwg._run_converter("python -m app.scripts.convert_dwg_oda --input {input} --output-dir {output_dir}", input_path=source, output_dir=tmp_path)
        assert popen.call_args.args[0][-3:] == [str(source), "--output-dir", str(tmp_path)]
        assert popen.call_args.kwargs["shell"] is False


def test_timeout_terminates_converter_process_group(tmp_path):
    process = MagicMock(); process.pid = 12345
    process.communicate.side_effect = [subprocess.TimeoutExpired("oda", 1), ("", "")]
    with patch.object(dwg, "_POSIX", True), patch.object(dwg.signal, "SIGKILL", 9, create=True), patch.object(dwg.os, "killpg", create=True) as kill, patch.object(dwg.subprocess, "Popen") as popen:
        popen.return_value.__enter__.return_value = process
        with pytest.raises(subprocess.TimeoutExpired):
            dwg._run_converter("converter {input} {output_dir}", input_path=tmp_path / "a.dwg", output_dir=tmp_path)
        kill.assert_called_once_with(12345, dwg.signal.SIGKILL)
        assert popen.call_args.kwargs["start_new_session"] is True


def test_converter_is_opt_in_and_does_not_touch_original(tmp_path):
    with patch.object(settings, "cad_dwg_converter_cmd", ""):
        assert dwg.convert_dwg_bytes(b"original", source_name="a.dwg").error == "dwg_converter_not_configured"
    def convert(command, *, input_path, output_dir):
        assert input_path.name == "source.dwg" and input_path.read_bytes() == b"original"
        (output_dir / "source.dxf").write_bytes(b"DXF result")
        return subprocess.CompletedProcess([], 0, "", "")
    with patch.object(settings, "cad_dwg_converter_cmd", "configured"), patch.object(dwg, "_run_converter", side_effect=convert):
        result = dwg.convert_dwg_bytes(b"original", source_name="odd ' drawing.DWG")
        assert result.ok and result.dxf_bytes == b"DXF result"
