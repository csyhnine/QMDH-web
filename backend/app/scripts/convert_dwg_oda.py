"""Run the official Linux ODA folder CLI in a private virtual display."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil


def oda_command(source: Path, output: Path) -> tuple[list[str], dict[str, str]]:
    source = source.resolve(strict=True)
    output = output.resolve(strict=True)
    converter = shutil.which("ODAFileConverter")
    display = shutil.which("xvfb-run")
    if not source.is_file() or not output.is_dir() or not converter or not display:
        raise RuntimeError("ODAFileConverter/xvfb-run or input/output is unavailable")
    runtime = source.parent / "qt-runtime"
    runtime.mkdir(mode=0o700, exist_ok=True)
    env = {**os.environ, "QT_QPA_PLATFORM": "xcb", "XDG_RUNTIME_DIR": str(runtime)}
    return [display, "-a", "--server-args=-screen 0 1024x768x24", converter,
            str(source.parent), str(output), "ACAD2018", "DXF", "0", "1", "*.dwg"], env


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    command, environment = oda_command(args.input, args.output_dir)
    os.execvpe(command[0], command, environment)


if __name__ == "__main__":
    main()
