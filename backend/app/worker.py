from __future__ import annotations

from redis import Redis

from app.core.config import settings
from app.services.task_executor import execute_task


def main() -> None:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    print(f"Worker listening on {settings.redis_queue_name}")
    while True:
        item = client.brpop(settings.redis_queue_name, timeout=0)
        if not item:
            continue
        _, task_id = item
        execute_task(int(task_id))


if __name__ == "__main__":
    main()
