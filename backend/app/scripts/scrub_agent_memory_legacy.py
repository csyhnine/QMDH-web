"""Scrub legacy raw agent memory rows written before agent-memory-002.

Usage (from backend container / local venv):

  python -m app.scripts.scrub_agent_memory_legacy --dry-run
  python -m app.scripts.scrub_agent_memory_legacy --apply
  python -m app.scripts.scrub_agent_memory_legacy --apply --user-id 12
"""

from __future__ import annotations

import argparse
import json

from app.database import SessionLocal
from app.services.agent_memory_service import scrub_legacy_agent_memories


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrub legacy agent memory entries")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Report changes without writing")
    mode.add_argument("--apply", action="store_true", help="Apply scrub to the database")
    parser.add_argument("--user-id", type=int, default=None, help="Limit scrub to one user_id")
    args = parser.parse_args()

    dry_run = bool(args.dry_run)
    with SessionLocal() as db:
        stats = scrub_legacy_agent_memories(db, dry_run=dry_run, user_id=args.user_id)
        if not dry_run:
            db.commit()
        payload = {
            "mode": "dry-run" if dry_run else "apply",
            "user_id": args.user_id,
            "scanned": stats.scanned,
            "deleted_turn_summaries": stats.deleted_turn_summaries,
            "deleted_noise_durable": stats.deleted_noise_durable,
            "distilled_durable": stats.distilled_durable,
            "compacted_sessions": stats.compacted_sessions,
            "unchanged": stats.unchanged,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
