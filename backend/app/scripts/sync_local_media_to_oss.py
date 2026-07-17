"""Upload local media files into the configured OSS bucket (idempotent).

Usage (inside backend container or venv with app settings loaded):

    python -m app.scripts.sync_local_media_to_oss
    python -m app.scripts.sync_local_media_to_oss --dry-run
"""

from __future__ import annotations

import argparse
import sys

from app.core.config import settings
from app.services.media_storage import OSSStorage, get_local_storage


def sync_local_media_to_oss(*, dry_run: bool = False) -> int:
    missing = [
        name
        for name, value in (
            ("QMDH_OSS_ENDPOINT", settings.oss_endpoint),
            ("QMDH_OSS_BUCKET_NAME", settings.oss_bucket_name),
            ("QMDH_OSS_ACCESS_KEY_ID", settings.oss_access_key_id),
            ("QMDH_OSS_ACCESS_KEY_SECRET", settings.oss_access_key_secret),
        )
        if not value
    ]
    if missing:
        print(f"OSS credentials are not configured: {', '.join(missing)}", file=sys.stderr)
        return 2

    local = get_local_storage()
    root = local.root_path().resolve()
    oss = OSSStorage(
        endpoint=settings.oss_endpoint,
        bucket_name=settings.oss_bucket_name,
        access_key_id=settings.oss_access_key_id,
        access_key_secret=settings.oss_access_key_secret,
        cdn_base_url=settings.cdn_base_url,
        timeout_seconds=settings.oss_connect_timeout_seconds,
    )

    uploaded = 0
    skipped = 0
    failed = 0

    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        if dry_run:
            print(f"DRY {relative}")
            uploaded += 1
            continue
        try:
            if oss.exists(relative):
                skipped += 1
                continue
            data = path.read_bytes()
            oss.write(relative, data, overwrite=True)
            uploaded += 1
            if uploaded % 50 == 0:
                print(f"... uploaded {uploaded}")
        except Exception as exc:  # noqa: BLE001 - report and continue for ops migration
            failed += 1
            print(f"FAIL {relative}: {exc}", file=sys.stderr)

    print(f"done uploaded={uploaded} skipped={skipped} failed={failed} dry_run={dry_run}")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sync local media root to OSS")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    return sync_local_media_to_oss(dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
