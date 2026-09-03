#!/usr/bin/env bash
# One-shot production deploy for prompt-polish 500 hotfix.
# Run on server (root or sudo): 
#   curl -fsSL "https://raw.githubusercontent.com/csyhnine/QMDH-web/hotfix/prompt-polish-500/scripts/remote-deploy-prompt-polish.sh" | bash
set -euo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/qmdh-web}"
BRANCH="${BRANCH:-hotfix/prompt-polish-500}"
REBUILD_FRONTEND="${REBUILD_FRONTEND:-0}"

cd "$APP_DIR"

echo "==> fetch $BRANCH"
sudo -u admin git -C "$APP_DIR" fetch origin "$BRANCH"

FILES=(
  backend/app/services/prompt_polish_service.py
  backend/app/routers/prompt_polish.py
  backend/tests/test_prompt_polish.py
  frontend/src/features/studio/useStudioPromptPolish.ts
  scripts/hotpatch-prompt-polish.sh
)

echo "==> checkout hotfix files onto working tree"
for rel in "${FILES[@]}"; do
  sudo -u admin git -C "$APP_DIR" checkout "origin/$BRANCH" -- "$rel"
done
chmod +x scripts/hotpatch-prompt-polish.sh

echo "==> hot-patch backend"
./scripts/hotpatch-prompt-polish.sh

if [[ "$REBUILD_FRONTEND" == "1" ]]; then
  echo "==> rebuild frontend (optional path resolution fix)"
  docker compose build --no-cache frontend
  docker compose up -d frontend
fi

echo "Deploy complete. Branch=$BRANCH REBUILD_FRONTEND=$REBUILD_FRONTEND"
