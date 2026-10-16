# Server Operations Runbook

2026-10-16 CAD 布置超时修复：外层宝塔默认 60s，但真实 fitout 为 74–75s；新增 extension/120.79.227.11/qmdh-cad-extracts.conf，来源 ops/nginx/cad-extracts.conf，仅 CAD extracts 前缀 proxy_read_timeout/proxy_send_timeout 300s。现有 location ^~ / 不会阻止更长的前缀匹配。迁移/重建宝塔站点时保留此 include；nginx -t/-T 后 reload。location 前缀必须不带末尾斜杠，否则列表接口 /extracts 会被自动 301，引发后端去斜杠重定向循环；旧 301 可能被浏览器永久缓存，必须保留片段中的内部 rewrite 去掉 /extracts/ 尾斜杠（break、不向客户端重定向、保留查询）。运行 scripts/check-cad-proxy.sh 验收带/不带斜杠的列表、含查询列表与详情直接返回 401（不能只测详情/健康）。原代理配置与生效前配置两端备份 cad-timeout-20261016。回退移出新增片段后检查与 reload，不删除业务结果。

2026-10-16 DWG 转换器已发布：功能 0346eee/Qt 依赖修复 b1532b1，生产运行合并 26095b9d。官方 ODA 27.9.0.0 amd64 与 Xvfb/Qt/OpenGL 在 backend/worker 镜像内，非宿主机临时安装；安装包 backend/vendor/oda/ODAFileConverter_QT6_lnxX64_11dll_27.9.deb 不入 Git，SHA256 由生产 QMDH_CAD_ODA_SHA256 固定。QMDH_CAD_ODA_PACKAGE/同 SHA 字段由 Compose 传 build args，QMDH_CAD_DWG_CONVERTER_CMD 调用 python -m app.scripts.convert_dwg_oda --input {input} --output-dir {output_dir}。以后重建保留包与这三个配置字段；新服务器从配对私有备份恢复包，不能仅 clone 后假设已安装。按既有 DEBIAN_MIRROR=https://mirrors.aliyun.com 参数构建 backend/worker。

本次备份 /www/backup/qmdh-release-20261016-linux-oda 与 E:/backups/QMDH-web/release-20261016-linux-oda，含旧 production.env、已配置 production-after.env、数据库/媒体链、官方安装包及验证日志。仅三个转换器键变化，其他配置/加密 key 保持。回退需旧 backend/worker 镜像与旧 production.env 配对，不因回退删除数据库/媒体或降级迁移。新 DWG 可上传，ce_0abae8a9402f 等旧图不重跑。详见 archive/handoff-2026-10-16-linux-oda.md。

Last updated: `2026-10-10`

最新固定 ID/自助临时凭证发布：功能 514de69、运行镜像来自生产合并 7b310f9、迁移 d5e6f7g8h9i0；备份 /www/backup/qmdh-release-20261010-171226 与 E:/backups/QMDH-web/release-20261010-171226，媒体两包均须恢复。详见 archive/handoff-2026-10-10-feedback-public-release.md。公开接入代理信任保持空，终端用户共享预算，放开前核验真实 IP 链路。

最新反馈安全发布/备份见 `archive/handoff-2026-10-10-feedback-security-release.md`（功能 55216ab、运行镜像来自 30dfe26、迁移 c4d5e6f7g8h9）；上一轮及服务器历史差异见 `archive/handoff-2026-10-10-production-release.md`。服务器存在合并历史，不能用 --ff-only；admin 须有提交身份，本轮用一次性 git -c 配置。现有 deploy-production-rebuild.sh 仍包含旧快进/旧镜像迁移流程，不适用于本服务器，按下方 Daily Update 手工顺序操作。

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
   - `sudo -u admin git -C /www/wwwroot/qmdh-web pull --no-rebase origin main`
7. Build new images before running any new migration (existing containers stay running):
   - `docker compose build backend worker frontend`
   - then, if migrations are included: `docker compose run --rm --no-deps backend alembic upgrade head`
8. Confirm Alembic state:
   - `docker compose run --rm backend alembic current`
   - expected result: current revision matches repo `head`
9. Rebuild and restart:
   - `docker compose up -d --no-build --scale worker=3 backend worker frontend`
10. Validate:
   - `docker compose ps`
   - `docker compose logs --tail=100 backend`
   - `docker compose logs --tail=100 worker`
   - `curl http://127.0.0.1:8080/api/v1/health`
   - `curl "http://127.0.0.1:8080/api/v1/health?detail=full"` — expect `database: healthy`; `redis: healthy` when `QMDH_TASK_EXECUTION_MODE=redis`
   - manual smoke test for login / chat / generation / admin models

### Full Rebuild (替代 docker cp 热补)

当热补文件过多或需要固化镜像层时，用全量 rebuild 代替 `scripts/deploy-production-hotpatch.sh`：

```bash
cd /www/wwwroot/qmdh-web
./scripts/deploy-production-rebuild.sh
```

脚本会：`git pull` → `alembic upgrade head`（可用 `RUN_MIGRATIONS=0` 跳过）→ `docker compose up -d --build backend worker frontend` → health 断言。

热补仍适用于**单文件紧急修复**；rebuild 适用于**多模块变更**或 `be-image-rebuild-001` 收口。

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

## Structured Logging (prod-003)

Backend 启动时调用 `setup_logging()`（`backend/app/main.py`）。生产默认 JSON Lines，便于 ELK/Loki 采集。

| 变量 | 默认 | 说明 |
|------|------|------|
| `QMDH_LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` / `ERROR` / `CRITICAL` |
| `QMDH_LOG_FORMAT` | `json` | 生产用 `json`；本地调试可设 `console` |

每条日志含 `correlation_id`（由请求中间件注入）。访问日志走结构化 middleware；uvicorn access log 已禁用以免重复。

验证：

```bash
docker compose logs --tail=20 backend | head
curl -s "http://127.0.0.1:8080/api/v1/health?detail=full"
```

## OSS 静态资源迁移 (prod-008)

**当前生产：** `QMDH_STORAGE_BACKEND=local`，媒体在 Docker volume `backend_media`。

**代码已就绪：** `LocalStorage` + `OSSStorage`（`oss2`）；`QMDH_STORAGE_BACKEND=oss` 时新写入会**本地优先 + 后台 mirror 到 OSS**；上游公网 URL 仍优先 `QMDH_PUBLIC_MEDIA_BASE_URL`（站点 `/media` 反代），不必切 OSS 也能通 Haodeya 参考图。

### 切换到 OSS（需用户批准后再改生产 `.env`）

1. 在 `.env` 填写：
   - `QMDH_OSS_ENDPOINT`
   - `QMDH_OSS_BUCKET_NAME`
   - `QMDH_OSS_ACCESS_KEY_ID`
   - `QMDH_OSS_ACCESS_KEY_SECRET`
   - 可选 `QMDH_CDN_BASE_URL`（自定义 CDN 域名，覆盖默认 bucket 公网 URL）
2. 先 dry-run 同步存量：

   ```bash
   docker compose run --rm backend python -m app.scripts.sync_local_media_to_oss --dry-run
   ```

3. 实际上传：

   ```bash
   docker compose run --rm backend python -m app.scripts.sync_local_media_to_oss
   ```

4. 设 `QMDH_STORAGE_BACKEND=oss`，`docker compose up -d --build backend worker`。
5. 验证：上传参考图 → 检查 OSS 控制台对象；Haodeya 任务 `image_tokens>0`。

回滚：改回 `QMDH_STORAGE_BACKEND=local` 并 restart；本地 volume 仍保留副本。

## Quick Verification Commands

```bash
cd /www/wwwroot/qmdh-web
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 worker
curl http://127.0.0.1:8080/api/v1/health
```
