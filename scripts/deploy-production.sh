#!/usr/bin/env bash
# QMDH production deploy helper — run on the ECS host as root (git steps use admin).
#
# Usage:
#   ./scripts/deploy-production.sh frontend
#   ./scripts/deploy-production.sh backend
#   ./scripts/deploy-production.sh full
#   ./scripts/deploy-production.sh full-migrate
#
# Modes:
#   frontend     — pull + build frontend + restart frontend (~1 min)
#   backend      — pull + build backend/worker + restart backend/worker (no alembic)
#   full         — pull + build all services + restart all (no alembic)
#   full-migrate — pull + build all + alembic upgrade head + restart all
#
# Environment overrides:
#   QMDH_DEPLOY_ROOT   default /www/wwwroot/qmdh-web
#   QMDH_HEALTH_URL    default http://127.0.0.1:8080/api/v1/health?detail=full
#   QMDH_SKIP_PULL=1   skip git pull
#   QMDH_SKIP_BACKUP=1 skip .env timestamp copy (still recommended manually)

set -euo pipefail

MODE="${1:-}"
DEPLOY_ROOT="${QMDH_DEPLOY_ROOT:-/www/wwwroot/qmdh-web}"
HEALTH_URL="${QMDH_HEALTH_URL:-http://127.0.0.1:8080/api/v1/health?detail=full}"
LOCK_FILE="/tmp/qmdh-docker-build.lock"
GIT_USER="${QMDH_GIT_USER:-admin}"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \?//'
  exit 1
}

if [[ -z "$MODE" ]]; then
  usage
fi

case "$MODE" in
  frontend | backend | full | full-migrate) ;;
  -h | --help) usage ;;
  *) echo "Unknown mode: $MODE" >&2; usage ;;
esac

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

acquire_build_lock() {
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "Another QMDH docker build appears to be running (lock: $LOCK_FILE)." >&2
    echo "Wait for it to finish; never run parallel 'docker compose build backend' on this host." >&2
    exit 1
  fi
  log "Acquired build lock $LOCK_FILE"
}

run_compose() {
  docker compose "$@"
}

cd "$DEPLOY_ROOT"

require_command docker
require_command flock
require_command curl

if [[ ! -f docker-compose.yml ]]; then
  echo "docker-compose.yml not found under $DEPLOY_ROOT" >&2
  exit 1
fi

if [[ "${QMDH_SKIP_BACKUP:-0}" != "1" && -f .env ]]; then
  backup_path=".env.bak.$(date '+%Y%m%d-%H%M%S')"
  cp .env "$backup_path"
  log "Backed up .env -> $backup_path"
fi

if [[ "${QMDH_SKIP_PULL:-0}" != "1" ]]; then
  log "Pulling origin/main as $GIT_USER"
  sudo -u "$GIT_USER" git -C "$DEPLOY_ROOT" fetch origin main
  sudo -u "$GIT_USER" git -C "$DEPLOY_ROOT" pull origin main
  log "Git HEAD: $(sudo -u "$GIT_USER" git -C "$DEPLOY_ROOT" rev-parse --short HEAD)"
else
  log "Skipping git pull (QMDH_SKIP_PULL=1)"
fi

acquire_build_lock

case "$MODE" in
  frontend)
    log "Building frontend only"
    run_compose build frontend
    log "Restarting frontend"
    run_compose up -d frontend
    ;;
  backend)
    log "Building backend + worker"
    run_compose build backend worker
    log "Restarting backend + worker"
    run_compose up -d backend worker
    ;;
  full)
    log "Building frontend + backend + worker"
    run_compose build frontend backend worker
    log "Restarting frontend + backend + worker"
    run_compose up -d frontend backend worker
    ;;
  full-migrate)
    log "Building frontend + backend + worker (migrations live inside backend image)"
    run_compose build frontend backend worker
    log "Running alembic upgrade head on NEW backend image"
    run_compose run --rm backend alembic upgrade head
    current="$(run_compose run --rm backend alembic current 2>/dev/null | tail -n 1 || true)"
    log "Alembic current: ${current:-unknown}"
    log "Restarting frontend + backend + worker"
    run_compose up -d frontend backend worker
    ;;
esac

log "docker compose ps"
run_compose ps

log "Health check: $HEALTH_URL"
if curl -fsS "$HEALTH_URL" | head -c 400; then
  echo
  log "Health check passed"
else
  echo
  echo "Health check failed — inspect logs:" >&2
  echo "  docker compose logs --tail=100 backend" >&2
  echo "  docker compose logs --tail=100 worker" >&2
  exit 1
fi

log "Deploy mode '$MODE' finished"
