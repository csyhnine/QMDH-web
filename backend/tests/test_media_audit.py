from datetime import datetime, timezone
import json
import os

import pytest
from sqlalchemy import create_engine, text

from app.scripts.audit_generated_media import main, read_only_engine
from app.services.media_audit import audit_media, reference_paths


NOW = datetime(2026, 10, 10, tzinfo=timezone.utc)


def fixture_media(tmp_path):
    root = tmp_path / "media"
    generated = root / "generated"
    generated.mkdir(parents=True)
    for name in ("old.png", "kept.png", "kept.bin", "new.mp4", "skip.dwg"):
        path = generated / name
        path.write_bytes(b"test")
        os.utime(path, (NOW.timestamp() - (1 if name == "new.mp4" else 40) * 86400,) * 2)
    return root


def database(tmp_path):
    url = f"sqlite:///{(tmp_path / 'audit.db').as_posix()}"
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE history (id INTEGER PRIMARY KEY, snapshot TEXT, deleted_at TEXT)"))
        connection.execute(text("INSERT INTO history VALUES (1, :snapshot, '2026-01-01')"), {"snapshot": json.dumps({"attachments": ["https://cdn.example/media/generated/kept.png?token=private"], "secret": "must-not-appear"})})
    engine.dispose()
    return url


def test_inventory_preserves_archive_reference_alias_and_files(tmp_path):
    root = fixture_media(tmp_path)
    engine = read_only_engine(database(tmp_path))
    before = {path.name: path.read_bytes() for path in (root / "generated").iterdir()}
    with engine.connect() as connection:
        report = audit_media(connection, root, now=NOW)
        with pytest.raises(Exception):
            connection.execute(text("DELETE FROM history"))
    engine.dispose()
    assert report["summary"] == {"referenced": {"count": 2, "bytes": 8}, "expired_unreferenced": {"count": 1, "bytes": 4}, "recent": {"count": 1, "bytes": 4}}
    assert report["skipped"] == ["generated/skip.dwg"]
    assert "must-not-appear" not in json.dumps(report)
    assert "private" not in json.dumps(report)
    assert report["deletion_authorized"] is False
    assert before == {path.name: path.read_bytes() for path in (root / "generated").iterdir()}


def test_path_forms_and_traversal():
    paths = set(reference_paths({"nested": ["/media/generated/a%20b.png?x=1", "![img](/media/generated/kept.png)", "generated/../secret.png", "generated\\windows.png"]}))
    assert {"generated/a b.png", "generated/kept.png", "generated/windows.png"} <= paths
    assert not any(".." in path for path in paths)


def test_json_column_and_missing_reference(tmp_path):
    root = fixture_media(tmp_path)
    url = database(tmp_path)
    writable = create_engine(url)
    with writable.begin() as connection:
        connection.execute(text("CREATE TABLE canvas (id INTEGER PRIMARY KEY, graph JSON)"))
        connection.execute(text("INSERT INTO canvas VALUES (7, :graph)"), {"graph": json.dumps({"nodes": [{"image": "media/generated/old.png"}, {"image": "/media/generated/missing.png"}]})})
    writable.dispose()
    engine = read_only_engine(url)
    with engine.connect() as connection:
        report = audit_media(connection, root, now=NOW)
    engine.dispose()
    old = next(item for item in report["files"] if item["path"] == "generated/old.png")
    assert old["status"] == "referenced"
    assert old["references"] == [{"table": "canvas", "row": {"id": "7"}, "column": "graph"}]
    assert report["references_not_in_local_inventory"] == [{"path": "generated/missing.png", "references": old["references"]}]


def test_nonexistent_database_is_not_created(tmp_path):
    path = tmp_path / "absent.db"
    with pytest.raises(FileNotFoundError):
        read_only_engine(f"sqlite:///{path.as_posix()}")
    assert not path.exists()


def test_cli_report_exclusive_and_outside_media(tmp_path, monkeypatch, capsys):
    root = fixture_media(tmp_path)
    monkeypatch.setenv("AUDIT_TEST_DB", database(tmp_path))
    report = tmp_path / "report.json"
    args = ["--media-root", str(root), "--database-env", "AUDIT_TEST_DB", "--report", str(report)]
    assert main(args) == 0
    saved = report.read_bytes()
    assert main(args) == 1
    assert report.read_bytes() == saved
    assert main([*args[:-1], str(root / "bad.json")]) == 1
    assert not (root / "bad.json").exists()
    assert "sqlite" not in capsys.readouterr().err


def test_symlink_not_followed(tmp_path):
    root = fixture_media(tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "private.png").write_bytes(b"secret")
    link = root / "generated" / "link"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("symlink privilege unavailable")
    engine = read_only_engine(database(tmp_path))
    with engine.connect() as connection:
        report = audit_media(connection, root, now=NOW)
    engine.dispose()
    assert "generated/link" in report["skipped"]
    assert not any("private" in item["path"] for item in report["files"])
