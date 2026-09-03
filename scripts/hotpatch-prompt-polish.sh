#!/usr/bin/env bash
# Hot-patch prompt polish 500 fix (invalid reference images) — backend only.
# Run on production: cd /www/wwwroot/qmdh-web && ./scripts/hotpatch-prompt-polish.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/qmdh-web}"
cd "$APP_DIR"

PATCH_FILES=(
  "backend/app/services/prompt_polish_service.py"
  "backend/app/routers/prompt_polish.py"
)

for rel in "${PATCH_FILES[@]}"; do
  if [[ ! -f "$rel" ]]; then
    echo "Missing $rel — git pull or checkout hotfix files first." >&2
    exit 1
  fi
done

mapfile -t BACKEND_CONTAINERS < <(docker compose ps -q backend)
if ((${#BACKEND_CONTAINERS[@]} == 0)); then
  echo "No backend container found" >&2
  exit 1
fi

echo "==> docker cp prompt polish fix into backend"
for rel in "${PATCH_FILES[@]}"; do
  dest="/app/app/${rel#backend/app/}"
  for cid in "${BACKEND_CONTAINERS[@]}"; do
    docker cp "$rel" "$cid:$dest"
  done
done

echo "==> restart backend (worker unchanged)"
docker compose restart backend

echo "==> wait for health"
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:8080/api/v1/health" >/dev/null; then
    break
  fi
  sleep 2
done
curl -sf "http://127.0.0.1:8080/api/v1/health?detail=full"
echo

echo "==> verify helper present in backend container"
docker compose exec -T backend python - <<'PY'
import inspect
from app.services import prompt_polish_service as pps

src = inspect.getsource(pps)
assert "_resolve_reference_image_urls_for_polish" in src
print("OK: prompt polish reference guard active")
PY

echo "Done. Optional frontend: docker compose build --no-cache frontend && docker compose up -d frontend"
