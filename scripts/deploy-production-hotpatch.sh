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
  "backend/app/services/image_aspect_ratio.py"
  "backend/app/services/media_storage.py"
  "backend/app/services/usage_ledger.py"
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

echo "==> verify Haodeya count edits + follow-source size in backend container"
docker compose exec -T backend python - <<'PY'
from app.services import task_executor as te
from app.services import image_aspect_ratio as ar
from app.services.media_storage import encode_public_http_url
from app.core.config import ImageProviderProfile
from app.services.model_registry import ProviderDefinition
import inspect

assert "_build_haodeya_count_image_edits_plan" in inspect.getsource(te)
assert "haodeya_sync_image_edits" in inspect.getsource(te._build_haodeya_count_image_edits_plan)
assert "_should_follow_source_for_size" in inspect.getsource(te), "missing follow_source size helper"
assert "encode_public_http_url" in inspect.getsource(te._reference_image_to_public_url)
smart_src = inspect.getsource(ar.resolve_image_aspect_ratio)
assert "_is_smart_ratio" in smart_src and "_is_follow_source_ratio" in smart_src
encoded = encode_public_http_url("https://cdn.example.com/中文.png")
assert "%E4%B8" in encoded or "%E6" in encoded, f"URL not encoded: {encoded}"

p = ImageProviderProfile(
    provider_name="gpt-image-2-count", api_key="x",
    base_url="https://newapi.haodeya.xyz/v1", model_name="gpt-image-2-count",
    timeout_seconds=300,
    strategies={"image.generate": "haodeya_sync_image", "image.edit": "haodeya_sync_image"},
    adapter_config={"provider_flavor": "haodeya_sync_image"},
)
d = ProviderDefinition("gpt-image-2-count", "gpt-image-2-count", ["image.generate", "image.edit"])
plan = te._build_image_request_plan(
    profile=p, definition=d, capability="image.generate",
    payload={"prompt": "test", "resolution": "1k", "aspect_ratio": "遵循原图",
             "reference_image": "/media/generated/gpt-image-2-count/sample.bin"},
    prompt="test",
)
assert plan.endpoint_path == "/images/edits", plan.endpoint_path
assert plan.reference_result.get("reference_image_mode") == "haodeya_sync_image_edits"
assert plan.multipart_files and plan.multipart_files[0][0] == "image"
assert "images" not in plan.body
print("OK: count /images/edits multipart + follow-source size + URL encode")
PY

echo "Done. HEAD=$HEAD"
