# 部署就绪 — 2026-08-16 生产全量 rebuild（be-image-rebuild-001）

Date: **2026-08-16**  
GitHub `main`：**`1979343`**  
本机：**已 push**；**无 SSH 密钥**，无法从本工作站直连 `120.79.227.11`。

## 目的

用 `docker compose up -d --build` **固化镜像层**，替代多次 `docker cp` 热补（含 count i2i multipart `f7ddeb3` 及后续文档/脚本）。

## 上线内容（相对旧热补镜像）

- `backend/app/services/task_executor.py` — count `/images/edits` multipart + 1K SKU
- `backend/tests/test_haodeya_sync_image.py`（仅镜像内代码，非运行时）
- `scripts/deploy-production-hotpatch.sh` / `deploy-production-rebuild.sh`
- 文档更新（无运行时影响）

Alembic head：**`r9s0t1u2v3w4`**（脚本会 `alembic upgrade head`，无新 migration 时应 noop）。

## 服务器执行（root 或宝塔终端）

**预计耗时：** backend 冷缓存 rebuild 约 **45–50 分钟**；frontend 通常较快。

```bash
cd /www/wwwroot/qmdh-web

# 可选：备份 .env 与数据库（日常更新规程）
cp -a .env .env.bak.$(date +%F-%H%M)

chmod +x scripts/deploy-production-rebuild.sh
./scripts/deploy-production-rebuild.sh
```

等价手动步骤：

```bash
cd /www/wwwroot/qmdh-web
sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main
sudo -u admin git -C /www/wwwroot/qmdh-web rev-parse --short HEAD   # 期望 1979343

docker compose run --rm backend alembic upgrade head
docker compose run --rm backend alembic current

docker compose up -d --build backend worker frontend

curl -sS "http://127.0.0.1:8080/api/v1/health?detail=full"
docker compose exec -T backend python -c "import inspect; from app.services import task_executor as te; assert '_build_haodeya_count_image_edits_plan' in inspect.getsource(te); print('OK')"
```

**未改 `.env`**；无需重建 postgres/redis/meilisearch。

## 验收

1. Git HEAD = **`1979343`**（或更新，若 pull 后 main 前进）
2. `curl https://cityusbdisk.cn/api/v1/health?detail=full` → `status: healthy`，`database`/`redis` healthy
3. 容器内断言 `_build_haodeya_count_image_edits_plan` 存在（脚本已含）
4. （可选）不再依赖热补文件列表：`docker compose exec backend grep -l haodeya_count_edits_multipart /app/app/services/task_executor.py`

## 回滚

```bash
cd /www/wwwroot/qmdh-web
sudo -u admin git -C /www/wwwroot/qmdh-web checkout <previous-sha>
docker compose up -d --build backend worker frontend
```

保留 `.env.bak.*`；数据库无需回滚（无 schema 变更）。

## 部署前公网快照（2026-08-16）

- 部署前：`version: 1.1.0`，uptime ~4.5h
- **已部署 2026-08-16：** HEAD **`59440b5`**，health healthy，task_executor multipart 断言 OK
- 备注：首次 build 因 PyPI 超时失败；commit `59440b5`（Dockerfile 阿里云 mirror）后成功
