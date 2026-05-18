from __future__ import annotations

import argparse
import json

from app.core.logging import setup_logging
from app.database import SessionLocal
from app.services.inspiration_refresh import (
    build_seed_inspiration_bundle,
    import_seed_inspiration_bundle,
    refresh_seed_inspiration_media,
)
from app.services.session_cleanup import run_session_cleanup_once
from seed_users import seed_staff_users


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("cleanup_sessions", help="Delete expired and stale revoked auth sessions")
    subparsers.add_parser("seed_users", help="Restore company member accounts from the staff roster")
    refresh_parser = subparsers.add_parser(
        "refresh_seed_inspiration_media",
        help="Re-localize built-in inspiration seed images into managed storage",
    )
    refresh_parser.add_argument(
        "--all",
        action="store_true",
        help="Refresh all matching seed records, not only current SVG placeholders",
    )
    bundle_build_parser = subparsers.add_parser(
        "build_seed_inspiration_bundle",
        help="Download built-in seed inspiration images locally and package them into a zip bundle",
    )
    bundle_build_parser.add_argument(
        "--output",
        required=True,
        help="Zip file path to write, for example ./tmp/seed-inspiration-bundle.zip",
    )
    bundle_import_parser = subparsers.add_parser(
        "import_seed_inspiration_bundle",
        help="Import a local seed inspiration bundle into managed storage and update matching DB records",
    )
    bundle_import_parser.add_argument(
        "--bundle",
        required=True,
        help="Path to the zip bundle produced by build_seed_inspiration_bundle",
    )
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

    if args.command == "seed_users":
        result = seed_staff_users(SessionLocal)
        print(json.dumps({"created": result.created, "skipped": result.skipped}))
        return 0

    if args.command == "refresh_seed_inspiration_media":
        result = refresh_seed_inspiration_media(SessionLocal, placeholders_only=not args.all)
        print(
            json.dumps(
                {
                    "matched": result.matched,
                    "refreshed": result.refreshed,
                    "skipped": result.skipped,
                    "restored": result.restored,
                    "placeholders": result.placeholders,
                    "placeholders_only": not args.all,
                }
            )
        )
        return 0

    if args.command == "build_seed_inspiration_bundle":
        result = build_seed_inspiration_bundle(args.output)
        print(
            json.dumps(
                {
                    "bundle_path": result.bundle_path,
                    "total": result.total,
                    "restored": result.restored,
                    "placeholders": result.placeholders,
                }
            )
        )
        return 0

    if args.command == "import_seed_inspiration_bundle":
        result = import_seed_inspiration_bundle(SessionLocal, bundle_path=args.bundle)
        print(
            json.dumps(
                {
                    "bundle_path": result.bundle_path,
                    "extracted_files": result.extracted_files,
                    "matched": result.matched,
                    "updated": result.updated,
                    "skipped": result.skipped,
                }
            )
        )
        return 0

    parser.error(f"Unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
