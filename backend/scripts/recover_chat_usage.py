"""Preview/recover explicit chat usage receipt IDs. Default mode never writes."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys


def _parser():
    parser = argparse.ArgumentParser(description="Preview known chat usage receipts; apply only the exact preview digest.")
    parser.add_argument("--receipt-id", type=int, action="append", required=True, help="Explicit receipt ID; repeat for up to 50 distinct IDs")
    parser.add_argument("--apply", action="store_true", help="Write only confirmed known usage; default is read-only preview")
    parser.add_argument("--expect", help="Digest from the matching preview; required with --apply")
    return parser


def main(argv=None, *, session_factory=None, stdout=None, stderr=None) -> int:
    stdout, stderr = sys.stdout if stdout is None else stdout, sys.stderr if stderr is None else stderr
    try:
        args = _parser().parse_args(argv)
    except SystemExit as exc:
        return int(exc.code)
    ids = args.receipt_id
    if (not 1 <= len(ids) <= 50 or len(set(ids)) != len(ids) or any(not 1 <= i <= 2_147_483_647 for i in ids)
            or (args.apply and (args.expect is None or re.fullmatch(r"[0-9a-f]{64}", args.expect) is None))
            or (not args.apply and args.expect is not None)):
        print(json.dumps({"code": "invalid_arguments"}), file=stderr)
        return 2
    try:
        backend = str(Path(__file__).resolve().parents[1])
        if backend not in sys.path:
            sys.path.insert(0, backend)
        from app.services.chat_usage_recovery_service import recovery_plan, apply_recovery_plan
        if session_factory is None:
            from app.database import SessionLocal
            session_factory = SessionLocal
        with session_factory() as db:
            if args.apply:
                report, code = apply_recovery_plan(db, ids, args.expect)
            else:
                report = {"mode": "preview", **recovery_plan(db, ids)}
                code = 2 if report["blocked"] else 0
        print(json.dumps(report, ensure_ascii=False, sort_keys=True), file=stdout)
        return code
    except Exception:
        # Do not print connection strings, SQL, private metadata or exceptions.
        print(json.dumps({"code": "database_operation_unavailable"}), file=stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
