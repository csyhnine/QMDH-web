# Development Continuity

## Purpose

本文件用于在 AI 开发额度、上下文窗口或当前会话不可继续时，让下一位 agent 能快速接手。任何后续开发都应优先读取：

1. `docs/protocol.md`
2. `docs/tasks.md`
3. `docs/handoff.md`
4. `docs/projects/QMDH-001/status.md`
5. `docs/deployment.md`
6. `docs/server-operations.md`
7. `docs/data-governance.md`
8. `docs/roadmap-2.0-prep.md`
9. 本文件

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
5. 前端大改前先跑 `npm run build`；后端或数据结构变更后优先用仓库 `.venv` 跑 `.\.venv\Scripts\python.exe -m unittest discover -s tests`。
6. 涉及本地启动能力时跑 `cmd /c start-dev.cmd --check`。
7. 推送前确认没有把 `.env`、`backend/app.db`、`local/`、`storage/`、`frontend/dist/`、`node_modules/` 带入 Git。

## Current Product State

- 设计师工作台主流程可用：项目选择、提示词模板、参考图上传、真实 provider 生图、历史流、图库沉淀。
- Chat 页面已上线：`/studio/chat` 可创建会话、流式回复和持久化历史，但仍需先在 `/admin/models` 配置至少一个 `chat.completions` 模型。
- Chat 与生成失败诊断已补第一轮：后端会保存结构化失败信息（`error_summary / error_detail / error_code / error_hint`），Chat 页与生成卡片不再只显示模糊失败。
- 账号系统已上线：数据库用户、密码登录、session、角色、项目授权。
- 管理能力已上线：
  - `/admin/users`：账号管理
  - `/admin/models`：模型与 Key 运维配置，包含真实成本单价配置
  - `/admin/dashboard`：运营看板，KPI + 图表布局；当前 `/dashboard/stats` 已改为读取 `usage_ledgers` 账本，按 task/provider_call 维度聚合成本、失败原因、账号用量与模型调用趋势
- 模型探测与批量导入能力已完成：`/admin/models` 可探测 `/v1/models` 并批量导入 provider profile；当前 runtime provider 以后台显式启用的 profile 为准，不再依赖 ModelScope 自动派生。
- 任务删除留痕已完成：`DELETE /tasks/{id}` 现为软删除，设计师前台默认隐藏，运营看板与账号用量继续统计软删除历史。
- 默认灵感库 seed 图已具备本地打包 / 服务器导入能力：
  - `python -m app.cli build_seed_inspiration_bundle --output <zip>`
  - `python -m app.cli import_seed_inspiration_bundle --bundle <zip>`
- 当前服务器若直接回源抓 ArchDaily 图片，仍可能因 `HTTP 403 AccessDenied` 回退到 placeholder；更稳的恢复方式是本地先构建 bundle，再上传服务器导入。
- 真实成本口径已接入：provider 配置 `pricing_currency / pricing_unit / unit_price`，任务按实际输出张数或请求次数写入成本。
- 模拟 provider 的随机成本已移除，历史模拟成本在 schema 刷新时归零。
- 未来 2.0 方向当前只作为升级预备路线存在，不作为立即上线目标；后续 1.0 中大型需求应先参考 `docs/roadmap-2.0-prep.md` 做兼容性检查。

## Near-Term Backlog

优先按小提交拆分：

1. 在 `/admin/models` 配置至少 1 个可用 `chat.completions` 模型，并完成 `/studio/chat` 真实联调。
2. 如果当前目标是先稳定服务器灵感库，优先上传并导入本地 `tmp/seed-inspiration-bundle.zip`，不要再依赖服务器直接回源重抓。
3. `task-016` 已完成；后续若继续做运营体验，优先评估 `/admin/projects` 是否需要“已归档项目”只读视图。
4. 持续拆分 `frontend/src/features/studio/GenerateStudioShell.tsx`，降低当前前端最大热点文件的维护风险。

## Suggested Commit Rhythm

- UI 纯样式调整：单独提交，例如 `style: refine dashboard layout`
- 接口/数据结构变更：单独提交，例如 `feat(task-009): add dashboard timeseries`
- 文档留档：单独提交或跟随同一小功能提交，例如 `docs: update continuity notes`

## Recovery Commands

```powershell
git status --short
git log -3 --oneline
cmd /c start-dev.cmd --check
cd backend; .\.venv\Scripts\python.exe -m unittest discover -s tests
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
- 日常轻量升级（无 migration）：
  1. backup `.env`
  2. backup PostgreSQL
  3. backup `backend_media`
  4. `git pull`
  5. `docker compose up -d --build`
- 带 migration 的升级：
  1. backup `.env`
  2. backup PostgreSQL
  3. backup `backend_media`
  4. `git pull`
  5. `docker compose run --rm backend alembic upgrade head`
  6. `docker compose up -d --build`
- 默认灵感库真图恢复推荐流程：
  1. 本地构建 `seed-inspiration-bundle.zip`
  2. 上传到服务器 `/www/wwwroot/qmdh-web/seed-inspiration-bundle.zip`
  3. 运行 `docker compose run --rm -v /www/wwwroot/qmdh-web/seed-inspiration-bundle.zip:/tmp/seed-inspiration-bundle.zip:ro backend python -m app.cli import_seed_inspiration_bundle --bundle /tmp/seed-inspiration-bundle.zip`

## Current Operational Conclusions

- Company member accounts on the current server were not migrated from the historic DB; the server started from a fresh PostgreSQL database
- Use `docker compose run --rm backend python -m app.cli seed_users` to restore the maintained company roster
- Inspiration library default images should now be treated as managed storage assets, not long-term third-party hotlinks
- 设计师分享图没有外部回源地址，正式环境必须把 `backend_media` 当成业务资产备份，不能靠“重新抓取”恢复
