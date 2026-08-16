#!/usr/bin/env bash
# Full backend/worker/frontend image rebuild on production (replaces docker cp hotpatch).
# Run from /www/wwwroot/qmdh-web as root or with docker permissions.
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/qmdh-web}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"

cd "$APP_DIR"

echo "==> git pull (as admin)"
sudo -u admin git -C "$APP_DIR" pull --ff-only origin main
HEAD="$(sudo -u admin git -C "$APP_DIR" rev-parse HEAD)"
echo "HEAD=$HEAD"

if [[ "$RUN_MIGRATIONS" == "1" ]]; then
  echo "==> alembic upgrade head"
  docker compose run --rm backend alembic upgrade head
  docker compose run --rm backend alembic current
fi

echo "==> docker compose up -d --build backend worker frontend"
docker compose up -d --build backend worker frontend

echo "==> wait for health"
for _ in $(seq 1 45); do
  if curl -sf "http://127.0.0.1:8080/api/v1/health" >/dev/null; then
    break
  fi
  sleep 2
done
curl -sf "http://127.0.0.1:8080/api/v1/health?detail=full" | head -c 400
echo

echo "==> container image sanity (backend task_executor import)"
docker compose exec -T backend python - <<'PY'
import inspect
from app.services import task_executor as te
assert "_build_haodeya_count_image_edits_plan" in inspect.getsource(te)
print("OK: backend image includes current task_executor")
PY

echo "Done. HEAD=$HEAD (full rebuild)"
