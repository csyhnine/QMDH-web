#!/usr/bin/env bash
# Run on production server (root or sudo) from /www/wwwroot/qmdh-web
# Hot-patch backend/worker Python without full image rebuild.
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/qmdh-web}"
cd "$APP_DIR"

echo "==> git pull (as admin)"
sudo -u admin git -C "$APP_DIR" pull --ff-only origin main
HEAD="$(sudo -u admin git -C "$APP_DIR" rev-parse HEAD)"
echo "HEAD=$HEAD"

PATCH_FILES=(
  "backend/app/services/task_executor.py"
  "backend/app/routers/dashboard.py"
  "backend/app/services/agent_policy_service.py"
  "backend/app/services/agent_skill_install_service.py"
)

echo "==> docker cp hot-patch into backend + workers"
mapfile -t CONTAINERS < <(docker compose ps -q backend worker)
if ((${#CONTAINERS[@]} == 0)); then
  echo "No backend/worker containers found" >&2
  exit 1
fi

for rel in "${PATCH_FILES[@]}"; do
  if [[ ! -f "$rel" ]]; then
    echo "Missing $rel" >&2
    exit 1
  fi
  for cid in "${CONTAINERS[@]}"; do
    docker cp "$rel" "$cid:/app/app/${rel#backend/app/}"
  done
done

echo "==> restart backend + worker"
docker compose restart backend worker

echo "==> wait for health"
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:8080/api/v1/health" >/dev/null; then
    break
  fi
  sleep 2
done
curl -sf "http://127.0.0.1:8080/api/v1/health?detail=full" | head -c 400
echo

echo "==> verify count reference image_urls fix in backend container"
docker compose exec -T backend python - <<'PY'
from app.services import task_executor as m
import inspect

src = inspect.getsource(m._build_haodeya_short_images_plan)
assert "haodeya_sync_image_urls" in src, "missing haodeya_sync_image_urls"
assert "if reference_images:" in src and "image_urls" in src, "count image_urls path missing"
print("OK: gpt-image-2-count sends image_urls when reference_images present")
PY

echo "Done. HEAD=$HEAD"
