# 生产部署记录 — 2026-08-14 count 参考图 + 看板 video/chat

Date: **2026-08-14**  
Git tip（目标）：**`d3d91a0`**（含 `0d6fa6e` count `image_urls`、`d8d5102` 看板统计）  
Alembic：无新迁移（仍 `r9s0t1u2v3w4`）  
上一生产 HEAD：**`e005414`**

## 背景

- Studio 已上传参考图，但 **count（DeepKey 同步）** 在旧 `task_executor` 里未把 `image_urls` 发给上游 → 纯文生图，结果与原图差异大。
- 修复在 **`0d6fa6e`**；2026-08-12/14 生产热补未覆盖 `task_executor.py`。

## 服务器执行（宝塔 SSH / root）

```bash
cd /www/wwwroot/qmdh-web
chmod +x scripts/deploy-production-hotpatch.sh
./scripts/deploy-production-hotpatch.sh
```

脚本会：`git pull`（admin）→ `docker cp` 热补 `task_executor.py` 等 → `restart backend worker` → health + 容器内断言 `image_urls` 逻辑。

## 验收

1. `git rev-parse HEAD` = `d3d91a0`（或更新）
2. `/api/v1/health` healthy
3. 容器内脚本输出 `OK: gpt-image-2-count sends image_urls...`
4. **业务**：图像编辑 + count + 参考图重跑；任务 `result.reference_image_mode` = `haodeya_sync_image_urls`

## 备注

- 本机开发站无 SSH 密钥，需人在服务器或宝塔终端执行。
- 网络空闲时可择机 `docker compose build backend worker` 固化镜像（`be-image-rebuild-001`）。
