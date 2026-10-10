"""Usage: python -m app.scripts.audit_generated_media --media-root PATH"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from app.services.media_audit import audit_media


def read_only_engine(database_url):
    url = make_url(database_url)
    if url.get_backend_name() == "sqlite":
        if not url.database or url.database == ":memory:":
            raise ValueError("audit requires an existing SQLite file")
        if url.query:
            raise ValueError("SQLite query options are not accepted")
        path = Path(url.database).resolve(strict=True)
        url = url.set(database=path.as_uri(), query={"mode": "ro", "uri": "true"})
    elif url.get_backend_name() != "postgresql":
        raise ValueError("only SQLite and PostgreSQL are supported")
    return create_engine(url)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Read-only generated media preview; no deletion operation")
    parser.add_argument("--media-root", required=True, type=Path)
    parser.add_argument("--database-env", default="QMDH_DATABASE_URL", help="Environment variable containing DB URL; .env is never loaded")
    parser.add_argument("--retention-days", type=int, default=30)
    parser.add_argument("--report", type=Path, help="Optional new JSON file outside media root; default stdout")
    args = parser.parse_args(argv)
    engine = None
    try:
        if args.report and args.report.resolve().is_relative_to(args.media_root.resolve()):
            raise ValueError("report must be outside media root")
        engine = read_only_engine(os.environ[args.database_env])
        with engine.connect() as connection:
            if engine.dialect.name == "postgresql":
                connection = connection.execution_options(isolation_level="REPEATABLE READ")
            with connection.begin():
                connection.exec_driver_sql("PRAGMA query_only = ON" if engine.dialect.name == "sqlite" else "SET TRANSACTION READ ONLY")
                report = audit_media(connection, args.media_root, retention_days=args.retention_days)
        output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.report:
            with args.report.open("x", encoding="utf-8") as destination:
                destination.write(output)
        else:
            sys.stdout.write(output)
        return 0
    except Exception as error:
        # DB exceptions may contain credentials or row values; never print them.
        print(f"Audit failed ({type(error).__name__}); no report produced. Check inputs/access locally.", file=sys.stderr)
        return 1
    finally:
        if engine:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
