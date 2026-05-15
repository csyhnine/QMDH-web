# Development Continuity

## Purpose

本文件用于在 AI 开发额度、上下文窗口或当前会话不可继续时，让下一位 agent 能快速接手。任何后续开发都应优先读取：

1. `docs/protocol.md`
2. `docs/tasks.md`
3. `docs/handoff.md`
4. `docs/projects/QMDH-001/status.md`
5. `docs/deployment.md`
6. `docs/server-operations.md`
7. 本文件

## Current Baseline

- 当前分支：`main`
- 当前功能基线提交：请以 `git log -1 --oneline` 为准（勿依赖本节手写哈希；`task-009` 接入看板时间序列后基线已前进）
- 最新提交以 `git log -1 --oneline` 为准
- 前端开发地址：`http://127.0.0.1:18080`
- 后端开发地址：`http://127.0.0.1:18010`
- 本地一键检查：`cmd /c start-dev.cmd --check`
- `start-dev.cmd` will clean stale repo-owned dev processes first and will not silently drift to `18011`, `5180`, or `19010`
- 本地账号清单：双击 `open-accounts.cmd`

## If AI Quota Or Context Runs Out

如果当前 AI 额度不足、会话被截断或需要换工具继续：

1. 先执行 `git status --short`，确认工作区是否干净。
2. 如果有未提交改动，先阅读 `git diff --stat` 和相关文件，不要直接覆盖。
3. 先读 `docs/handoff.md` 最新一条交接，再读 `docs/tasks.md` 的 `Next Suggested Step`。
4. 每完成一个可验证小目标就提交一次，避免把大量改动压在同一个未提交工作区里。
5. 前端大改前先跑 `npm run build`；后端或数据结构变更后跑 `python -m unittest discover -s tests`。
6. 涉及本地启动能力时跑 `cmd /c start-dev.cmd --check`。
7. 推送前确认没有把 `.env`、`backend/app.db`、`local/`、`storage/`、`frontend/dist/`、`node_modules/` 带入 Git。

## Current Product State

- 设计师工作台主流程可用：项目选择、提示词模板、参考图上传、真实 provider 生图、历史流、图库沉淀。
- 账号系统已上线：数据库用户、密码登录、session、角色、项目授权。
- 管理能力已上线：
  - `/admin/users`：账号管理
  - `/admin/models`：模型与 Key 运维配置，包含真实成本单价配置
  - `/admin/dashboard`：运营看板，KPI + 图表布局；成本/失败曲线与模型调用堆叠柱已使用 `/dashboard/stats` 的 `daily_series`、`model_calls_by_day` 按日真实数据
- `task-012` 已在当前工作区实现模型探测与批量导入能力：`/admin/models` 可探测 `/v1/models` 并批量导入 provider profile，但在提交归档前应视为 WIP
- 真实成本口径已接入：provider 配置 `pricing_currency / pricing_unit / unit_price`，任务按实际输出张数或请求次数写入成本。
- 模拟 provider 的随机成本已移除，历史模拟成本在 schema 刷新时归零。

## Near-Term Backlog

优先按小提交拆分：

1. `task-010`：补 provider key 加密、操作审计和正式 migration。
2. `task-011`：设计师工作台主页重设计（需外部参考图对齐）。
3. `task-012`：完成并归档模型管理页“探测并批量导入”功能提交，然后用管理页验证导入结果。
4. `task-sec-001`：确认涉密项目 `QMDH-SEC` 的出域边界和模型可用范围。

## Suggested Commit Rhythm

- UI 纯样式调整：单独提交，例如 `style: refine dashboard layout`
- 接口/数据结构变更：单独提交，例如 `feat(task-009): add dashboard timeseries`
- 文档留档：单独提交或跟随同一小功能提交，例如 `docs: update continuity notes`

## Recovery Commands

```powershell
git status --short
git log -3 --oneline
cmd /c start-dev.cmd --check
cd backend; python -m unittest discover -s tests
cd frontend; npm run build
```

## Server Snapshot (2026-05-15)

- Current server IP: `120.79.227.11`
- Domain: `cityusbdisk.cn`
- Baota panel: `https://120.79.227.11:26215`
- Deploy path: `/www/wwwroot/qmdh-web`
- Runtime entry:
  - Baota `80/443` reverse-proxy to `127.0.0.1:8080`
  - direct IP access works
  - domain access is still blocked by Alibaba filing / access-filing requirements

## Server Data Persistence Notes

- `postgres_data` volume: users, provider profiles, chats, tasks, inspiration posts, audit data
- `backend_media` volume: generated images, managed inspiration images, other uploaded media
- `redis_data` volume: queue/runtime persistence only
- `.env` on the server contains `QMDH_ENCRYPTION_KEY`; this key must stay paired with the database backups

Never do these casually on the live server:

- `docker compose down -v`
- deleting Docker volumes
- changing `QMDH_ENCRYPTION_KEY`

## Server Recovery / Handoff Pointers

- Detailed runbook: `docs/server-operations.md`
- Live update flow must include:
  1. backup `.env`
  2. backup PostgreSQL
  3. backup `backend_media`
  4. `git pull`
  5. `docker compose run --rm backend alembic upgrade head`
  6. `docker compose up -d --build`

## Current Operational Conclusions

- Company member accounts on the current server were not migrated from the historic DB; the server started from a fresh PostgreSQL database
- Use `docker compose run --rm backend python -m app.cli seed_users` to restore the maintained company roster
- Inspiration library default images should now be treated as managed storage assets, not long-term third-party hotlinks
