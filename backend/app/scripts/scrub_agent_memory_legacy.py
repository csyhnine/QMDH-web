"""Scrub legacy raw agent memory rows written before agent-memory-002.

Usage (from backend container / local venv):

  python -m app.scripts.scrub_agent_memory_legacy --dry-run
  # Save the dry-run JSON's "plan" object and fill legacy_evidence from historical provenance.
  python -m app.scripts.scrub_agent_memory_legacy --apply --plan approved-plan.json --user-id 12
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.database import SessionLocal
from app.services.agent_memory_service import scrub_legacy_agent_memories, sync_legacy_agent_memory_index


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrub legacy agent memory entries")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Report changes without writing")
    mode.add_argument("--apply", action="store_true", help="Apply scrub to the database")
    parser.add_argument("--user-id", type=int, default=None, help="Limit scrub to one user_id")
    parser.add_argument("--plan", type=Path, help="Reviewed version=1 plan with exact row fingerprints and legacy_evidence")
    args = parser.parse_args()
    if args.apply and args.plan is None:
        parser.error("--apply requires --plan with reviewed legacy provenance")
    approved_plan = None
    if args.plan is not None:
        try:
            approved_plan = json.loads(args.plan.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            parser.error(f"cannot read legacy plan: {exc}")

    dry_run = bool(args.dry_run)
    with SessionLocal() as db:
        stats = scrub_legacy_agent_memories(db, dry_run=dry_run, user_id=args.user_id, approved_plan=approved_plan)
        if not dry_run:
            db.commit()
    index_sync = None if dry_run else sync_legacy_agent_memory_index(stats)
    payload = {
        "mode": "dry-run" if dry_run else "apply",
        "user_id": args.user_id,
        "scanned": stats.scanned,
        "deleted_turn_summaries": stats.deleted_turn_summaries,
        "deleted_noise_durable": stats.deleted_noise_durable,
        "distilled_durable": stats.distilled_durable,
        "compacted_sessions": stats.compacted_sessions,
        "unchanged": stats.unchanged,
        "review_required": stats.review_required,
        "plan": {"version": 1, "entries": stats.review_candidates},
        "index_sync": index_sync,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
