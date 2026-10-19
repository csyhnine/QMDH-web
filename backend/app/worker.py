from __future__ import annotations

from redis import Redis

from app.core.config import settings
from app.database import SessionLocal
from app.services.task_executor import execute_task
from app.services.task_stale_recovery import recover_stale_tasks
from app.services.task_dispatch import claim, run_claim, import_legacy
import logging
from time import sleep


def main() -> None:
    with SessionLocal() as db:
        recovered = recover_stale_tasks(db)
        if recovered:
            print(f"Recovered {recovered} stale task(s) on worker startup")
    client = Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=2,
                            socket_timeout=3, retry_on_timeout=False)
    print(f"Worker listening on {settings.redis_queue_name}")
    while True:
        try:
            job = claim()
            if job:
                run_claim(*job)
                continue
            try:
                item = client.brpop(settings.redis_queue_name, timeout=2)
                if item:
                    import_legacy(int(item[1]))
            except Exception:
                # A Redis outage does not discard the database outbox.
                logging.exception("Redis wakeup unavailable; database polling continues")
                sleep(2)
        except Exception:
            logging.exception("Worker iteration failed; durable lease will be recovered")
            sleep(2)


if __name__ == "__main__":
    main()
