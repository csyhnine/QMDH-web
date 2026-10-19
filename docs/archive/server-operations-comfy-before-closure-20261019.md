## 2026-10-19 FRP / ComfyUI 发布补充

- 已运行 STCP frps/visitor：公网仅 7443/TCP，backend/三 worker 的 comfy_backend internal 网络与 workflows 只读挂载依赖显式 overlay。后续管理这些服务时，使用 `docker compose -f docker-compose.yml -f /opt/qmdh-frp/compose.frp.yml ...`；仅主文件重建会丢掉专网/模板挂载。详见 docs/comfyui-frp.md 最新段。
- 发布功能 621e2f1，生产代码合并 0562244e；原 backend/worker 镜像分别保存在 qmdh-release-backup-backend:20261019-comfyui、qmdh-release-backup-worker:20261019-comfyui。新镜像以原镜像为基础，只复制六个合并后的代码文件，构建说明 /opt/qmdh-frp/Dockerfile.adapter 及发布备份均保留；ODA/FFmpeg/Nano Banana 差异保全。程序回退先确认无运行任务，再恢复这两个旧镜像标签并重建对应服务，不降级数据库或删除媒体。两个新 provider id60/61 已经真实任务8237/8238验收并启用；回退旧镜像前必须先禁用两者，避免旧版未知adapter变成模拟执行。
- .env/key/schema 未改；frontend/postgres/redis/meilisearch 容器未换。发布证据/DB/env/媒体增量与恢复链位于 /www/backup/qmdh-release-20261019-comfyui-prep，受限本机对应 E:/backups/QMDH-web/frp-20261019/release-backup。CA 私钥仅在本机受限离线目录，不在服务器、镜像或 Git。

