# Server Operations Runbook

Last updated: `2026-06-12`

## Current Production-Like Server Snapshot

- Server provider: Alibaba Cloud ECS / Baota panel
- Public IP: `120.79.227.11`
- Domain: `cityusbdisk.cn`
- Baota panel: `https://120.79.227.11:26215`
- App deploy path: `/www/wwwroot/qmdh-web`
- Reverse proxy: Baota `80/443` -> `http://127.0.0.1:8080`
- Docker frontend host port: `8080`
- Current domain status: `cityusbdisk.cn` ICP filed（京ICP备14011242号-4）; DNS → `120.79.227.11`; **HTTPS live** with Let's Encrypt; HTTP redirects to HTTPS.
- Preferred access URL: `https://cityusbdisk.cn`

## Runtime Architecture

The server runs the repo with Docker Compose:

- `frontend`: static app + `/api` reverse proxy
- `backend`: FastAPI
- `worker`: async task worker（默认 **3** 个副本，并行消费 Redis 队列；可用 `docker compose up -d --scale worker=N` 临时调整）
- `postgres`: main business database
- `redis`: queue / lock runtime

Persistent Docker volumes:

- `postgres_data`: users, provider profiles, chat history, tasks, inspiration posts, audit logs, etc.
- `redis_data`: Redis append-only data for runtime recovery
- `backend_media`: generated images, managed inspiration images, other media files

## Secrets And Sensitive State

Do **not** commit server secrets into the repo.

Server-only secrets currently live in `/www/wwwroot/qmdh-web/.env`, including:

- `QMDH_ENCRYPTION_KEY`
- model provider API keys
- bootstrap admin password

Important rule:

- Database backups and `.env` backups must be kept together.
- Changing `QMDH_ENCRYPTION_KEY` after provider keys are stored will make encrypted model keys unreadable.

## Private Repo Access

The server pulls the private GitHub repo through a Deploy Key owned by the `admin` user.

- Key owner: server `admin` user (`/home/admin/.ssh/id_ed25519`)
- GitHub access mode: `git@github.com:csyhnine/QMDH-web.git`
- Repo owner on disk: `admin:admin` at `/www/wwwroot/qmdh-web`

Important:

- `git pull` / `git fetch` must run as `admin`, not `root`
- When already logged in as `root`, use:
  - `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
- `root` has no GitHub deploy key; running `git pull` as `root` will fail with `Permission denied (publickey)` even when the deploy key itself is healthy

If clone / pull starts failing with `Permission denied (publickey)`, check in this order:

1. Are you running git as `admin`?
2. `sudo -u admin ssh -T git@github.com`
3. `/home/admin/.ssh/id_ed25519`
4. GitHub repo `Deploy keys`

## First Deployment Checklist

1. Install Docker and Docker Compose plugin.
2. Add server SSH deploy key to GitHub repo Deploy Keys.
3. Clone repo to `/www/wwwroot/qmdh-web`.
4. Create `/www/wwwroot/qmdh-web/.env` from `.env.production.example`.
5. Fill production values, especially:
   - `QMDH_DATABASE_URL`
   - `QMDH_REDIS_URL`
   - `QMDH_ENCRYPTION_KEY`
   - `QMDH_FRONTEND_ORIGIN`
   - bootstrap admin password
6. Start services:
   - `docker compose up -d --build`
7. In Baota, create a site and reverse-proxy it to `127.0.0.1:8080`.

## Daily Update Procedure

Always update in this order:

1. SSH into server.
2. Go to `/www/wwwroot/qmdh-web`.
3. Back up `.env`.
4. Back up PostgreSQL with a logical dump.
5. Back up media files from `backend_media`.
6. Pull latest code as `admin`:
   - `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
7. If this update includes Alembic migrations, run:
   - `docker compose run --rm backend alembic upgrade head`
8. Confirm Alembic state:
   - `docker compose run --rm backend alembic current`
   - expected result: current revision matches repo `head`
9. Rebuild and restart:
   - `docker compose up -d --build`
10. Validate:
   - `docker compose ps`
   - `docker compose logs --tail=100 backend`
   - `docker compose logs --tail=100 worker`
   - `curl http://127.0.0.1:8080/api/v1/health`
   - manual smoke test for login / chat / generation / admin models

### Update Rule Of Thumb

- No migration in this release:
  - `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
  - `docker compose up -d --build`
- Has migration in this release:
  - `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
  - `docker compose run --rm backend alembic upgrade head`
  - `docker compose run --rm backend alembic current`
  - `docker compose up -d --build`
- Current repo status note:
  - the `usage_ledgers` rollout for `task-016` includes Alembic migration `e4f5a6b7c8d9_add_usage_ledgers.py`
  - the chat token metering rollout includes Alembic migration `f6a7b8c9d0e1_add_chat_token_columns_to_usage_ledgers.py`
  - any environment upgrading to this version must run `alembic upgrade head` before restart

## Migration Desync Recovery

This project has already seen one real production-like incident on `2026-05-21`:

- repo code was already at `9e2006a`
- `usage_ledgers` table already existed
- Alembic `current` was still `c3d4e5f6a7b8`
- worker crashed with `column usage_ledgers.prompt_tokens does not exist`
- generation tasks could stay in `pending` / `running` until the schema was repaired

This means a release can be "partially upgraded":

- code pulled successfully
- containers restarted successfully
- but database schema and Alembic revision are still behind repo expectations

### How To Recognize This Failure Mode

Look for one or more of these signals:

- `docker compose run --rm backend alembic upgrade head` fails with `relation "..." already exists`
- `docker compose run --rm backend alembic current` reports an older revision than repo `head`
- worker logs contain `UndefinedColumn`, especially on newly added fields
- frontend generation cards stay in `pending` / `running` longer than expected, then fail only after worker recovery

### Standard Recovery Rule

Do **not** wipe volumes. Do **not** run `docker compose down -v`.

Instead:

1. inspect current revision:
   - `docker compose run --rm backend alembic current`
2. inspect the actual table / columns in PostgreSQL
3. if the table already exists but a later migration only adds missing columns, add the missing columns manually with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
4. if the schema now matches repo expectations, align Alembic metadata with:
   - `docker compose run --rm backend alembic stamp <target_revision>`
5. restart `backend` and `worker`
6. verify health and re-check worker logs

### Specific Recovery For `usage_ledgers` Token Columns

If worker logs show `column usage_ledgers.prompt_tokens does not exist`, run:

```bash
cd /www/wwwroot/qmdh-web
docker compose exec postgres psql -U qmdh -d qmdh -c "
ALTER TABLE usage_ledgers
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_ledgers ALTER COLUMN prompt_tokens DROP DEFAULT;
ALTER TABLE usage_ledgers ALTER COLUMN completion_tokens DROP DEFAULT;
ALTER TABLE usage_ledgers ALTER COLUMN total_tokens DROP DEFAULT;
"
docker compose run --rm backend alembic stamp f6a7b8c9d0e1
docker compose run --rm backend alembic current
docker compose restart backend worker
curl http://127.0.0.1:8080/api/v1/health
```

Expected result:

- Alembic current becomes `f6a7b8c9d0e1`
- worker no longer crashes on `usage_ledgers.prompt_tokens`
- generation tasks fail or succeed according to the real upstream image provider state, instead of failing on local schema mismatch

`curl http://127.0.0.1:8080/api/v1/health` is a local health probe used to confirm that the backend API is actually responding after restart.

## Backup And Restore

### Backup

- `.env`: copy to a secure off-repo location
- PostgreSQL:
  - example: `docker compose exec postgres pg_dump -U qmdh -d qmdh > qmdh-YYYYMMDD.sql`
- Media:
  - copy `backend_media` volume contents, or archive from inside the backend container

### Restore

1. Restore `.env`
2. Restore PostgreSQL dump into the `postgres` container
3. Restore `backend_media` volume contents
4. Run `docker compose up -d`
5. Run `docker compose run --rm backend alembic upgrade head`

## Data Safety Red Lines

Never do these on the live server unless you intentionally want data loss:

- `docker compose down -v`
- deleting `postgres_data`
- deleting `backend_media`
- replacing `.env` with a different `QMDH_ENCRYPTION_KEY`
- bringing up a fresh empty database without a migration / import plan

## Staff Account Recovery

Current server history:

- This server started from a fresh PostgreSQL database.
- Old company member accounts were **not** migrated from the historic database.
- Only bootstrap admin + 3 local dev accounts exist by default until roster recovery is run.

Recovery command:

- `docker compose run --rm backend python -m app.cli seed_users`

Behavior:

- Existing accounts are preserved.
- Missing company member accounts are added from the repo roster.
- Default passwords follow the roster script rule (last 4 digits of the phone number).
- Restored users should change their password after first login.

## Inspiration Library Notes

Current expected behavior after this stabilization round:

- Seed inspiration posts should no longer rely on third-party hotlinks only.
- Default inspiration images are downloaded into managed storage under `backend_media`, or replaced with a managed fallback placeholder if download fails.
- Admin-imported external inspiration images should also be localized into platform-managed storage.
- The server may still fail to recover some ArchDaily images directly because `images.adsttc.com` can return `HTTP 403 AccessDenied`.
- A more stable recovery path now exists:
  1. build a local bundle on a machine that can fetch the real seed images
  2. upload `seed-inspiration-bundle.zip` to `/www/wwwroot/qmdh-web/`
  3. import with `docker compose run --rm -v /www/wwwroot/qmdh-web/seed-inspiration-bundle.zip:/tmp/seed-inspiration-bundle.zip:ro backend python -m app.cli import_seed_inspiration_bundle --bundle /tmp/seed-inspiration-bundle.zip`

If cards exist but images are blank again, check:

1. `docker compose logs --tail=100 backend`
2. whether `image_path` values in `inspiration_posts` still point to third-party URLs
3. whether `/media/...` paths are available through the frontend container
4. whether `refresh_seed_inspiration_media` reported `placeholders > 0`
5. whether backend logs contain `HTTP 403` / `AccessDenied`
6. whether the bundle import step has already been run on the current server

## Domain And SSL (2026-06-12)

- ICP filing complete for `cityusbdisk.cn`.
- Let's Encrypt certificate path: `/etc/letsencrypt/live/cityusbdisk.cn/`
- Nginx site config: `/www/server/panel/vhost/nginx/120.79.227.11.conf`
- Production `.env` should use:
  - `QMDH_FRONTEND_ORIGIN=https://cityusbdisk.cn`
  - `QMDH_PUBLIC_MEDIA_BASE_URL=https://cityusbdisk.cn`
- IP `http://120.79.227.11` still works but domain access should be the default for designers and for upstream image fetch URLs.

## Quick Verification Commands

```bash
cd /www/wwwroot/qmdh-web
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 worker
curl http://127.0.0.1:8080/api/v1/health
```
