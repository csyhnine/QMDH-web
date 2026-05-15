from __future__ import annotations

import argparse
import json

from app.core.logging import setup_logging
from app.database import SessionLocal
from app.services.session_cleanup import run_session_cleanup_once


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("cleanup_sessions", help="Delete expired and stale revoked auth sessions")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    setup_logging()

    if args.command == "cleanup_sessions":
        result = run_session_cleanup_once(SessionLocal)
        print(
            json.dumps(
                {
                    "expired_deleted": result.expired_deleted,
                    "revoked_deleted": result.revoked_deleted,
                    "total_deleted": result.total_deleted,
                    "failed_batches": list(result.failed_batches),
                }
            )
        )
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
