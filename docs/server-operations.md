# Server Operations Runbook

Last updated: `2026-05-18`

## Current Production-Like Server Snapshot

- Server provider: Alibaba Cloud ECS / Baota panel
- Public IP: `120.79.227.11`
- Domain: `cityusbdisk.cn`
- Baota panel: `https://120.79.227.11:26215`
- App deploy path: `/www/wwwroot/qmdh-web`
- Reverse proxy: Baota `80/443` -> `http://127.0.0.1:8080`
- Docker frontend host port: `8080`
- Current domain status: DNS already points to `120.79.227.11`, but domain access is blocked by ICP filing / Alibaba access control. IP access works; domain access will not work until filing or access filing is complete.

## Runtime Architecture

The server runs the repo with Docker Compose:

- `frontend`: static app + `/api` reverse proxy
- `backend`: FastAPI
- `worker`: async task worker
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

The server pulls the private GitHub repo through a Deploy Key.

- Key owner: server `admin` user
- GitHub access mode: `git@github.com:csyhnine/QMDH-web.git`

If clone / pull starts failing with `Permission denied (publickey)`, check:

1. `~/.ssh/id_ed25519`
2. GitHub repo `Deploy keys`
3. `ssh -T git@github.com`

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
6. Pull latest code:
   - `git pull origin main`
7. If this update includes Alembic migrations, run:
   - `docker compose run --rm backend alembic upgrade head`
8. Rebuild and restart:
   - `docker compose up -d --build`
9. Validate:
   - `docker compose ps`
   - `docker compose logs --tail=100 backend`
   - `curl http://127.0.0.1:8080/api/v1/health`
   - manual smoke test for login / chat / generation / admin models

### Update Rule Of Thumb

- No migration in this release:
  - `git pull origin main`
  - `docker compose up -d --build`
- Has migration in this release:
  - `git pull origin main`
  - `docker compose run --rm backend alembic upgrade head`
  - `docker compose up -d --build`
- Current repo status note:
  - the `usage_ledgers` rollout for `task-016` includes Alembic migration `e4f5a6b7c8d9_add_usage_ledgers.py`
  - any environment upgrading to this version must run `alembic upgrade head` before restart

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

## Known External Constraint

`cityusbdisk.cn` currently resolves correctly, but Alibaba blocks direct domain access because filing / access filing is incomplete.

Until filing is complete:

- use `http://120.79.227.11` for validation
- do not treat domain failure as an app regression

## Quick Verification Commands

```bash
cd /www/wwwroot/qmdh-web
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 worker
curl http://127.0.0.1:8080/api/v1/health
```
