# 部署就绪 — 2026-07-26 agent-memory-002

Date: **2026-07-26**  
GitHub `main`：**`56e9d64`**  
本机：**已 commit + push**；**无 SSH 密钥**，无法从本工作站直连 `120.79.227.11`。

## 上线内容

- 停写每轮 turn-level summary；会话 `session_summary` 周期 compact
- 长期记忆筛选 + distill；新增 `experience`（项目经验）
- 存量清理：`python -m app.scripts.scrub_agent_memory_legacy --dry-run|--apply`
- 前端记忆抽屉显示「项目经验」

无新 Alembic 迁移。

## 服务器执行（需有 SSH 的人跑）

```bash
sudo -u admin git -C /www/wwwroot/qmdh-web fetch origin main
sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main
cd /www/wwwroot/qmdh-web
# 确认 HEAD
sudo -u admin git -C /www/wwwroot/qmdh-web rev-parse --short HEAD   # 期望 56e9d64

docker compose build frontend backend
docker compose up -d frontend backend

# 健康检查
curl -sS https://cityusbdisk.cn/api/v1/health

# 存量记忆：先看再改
docker compose exec backend python -m app.scripts.scrub_agent_memory_legacy --dry-run
docker compose exec backend python -m app.scripts.scrub_agent_memory_legacy --apply
```

未改 `.env`；worker 可不重建（本轮无 worker 改动）。

## 验收

1. Git HEAD = `56e9d64`
2. `/api/v1/health` healthy
3. dry-run 输出含 scanned / deleted_turn_summaries 等字段
4. apply 后设计师「我的记忆」：少见整段对话原文；可见短事实 / 项目经验
