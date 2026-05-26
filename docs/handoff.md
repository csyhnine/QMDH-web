# Handoff

## Usage Rules
- 本文件只保留最近 3 次交接记录
- 更早记录迁移到 `docs/archive/`
- 交接必须面向陌生 agent 书写
- 如果当前状态不可直接接手，必须明确标记 `WIP`

---

## Latest Handoffs

### [2026-05-25 11:40] Session Handoff
- Role: Product alignment / Refactor / Verification
- Branch: `main`
- Repo status:
  - Working tree clean: No
  - Uncommitted changes: Yes
  - Pushed: No
- What changed in this round:
  - normalized runtime roles to `admin` / `designer` while keeping legacy `owner` / `ops` aliases readable through normalization
  - changed designer task and asset visibility to current-user ownership instead of same-project shared visibility
  - removed active `/admin/projects` routing and removed project-member management from the active UI/API surface
  - simplified the studio workspace so projects remain personal task containers, not collaboration/member-sharing spaces
  - deleted the unused `frontend/src/pages/admin/ProjectsPage.tsx` file
- Verification completed locally:
  - backend: `PYTHONPATH=backend ..\\backend\\.venv\\Scripts\\python.exe -m pytest tests\\test_database_auth.py tests\\test_auth_boundaries.py`
  - frontend: `npm run build`
- Important current product reality:
  - only admins should access backend management views
  - designers should only see their own task and asset history
  - project access still exists as an admin-managed container scope, but project member sharing is no longer an active product concept
- Remaining follow-up:
  - `frontend/src/features/studio/GenerateStudioShell.tsx` still contains legacy admin-view code and remains the main frontend hot spot
  - docs still contain historical references to `/admin/projects`, `ops`, `owner`, and project-member collaboration; use `docs/product-boundary.md` as the clean current baseline when older files disagree
- Deployment status:
  - local only
  - not yet committed, pushed, or deployed
- Safe to hand off: Yes

### [2026-05-26 10:40] Session Handoff
- Role: Product alignment / Personal-project ownership / Verification
- Branch: `main`
- Repo status:
  - Working tree clean: No
  - Uncommitted changes: Yes
  - Pushed: No
- What changed in this round:
  - removed `project_codes` from the public user-management schema and stopped defaulting new users into `QMDH-001`
  - moved personal-project code generation fully to the backend so the left workspace no longer asks the frontend or admins to manage internal `project_code` values
  - added owner-based manageability for personal projects in code via `Project.owner_user_id` and returned `can_manage` to the frontend
  - allowed session-backed designers to rename and delete their own personal projects while leaving legacy owner-less projects effectively admin-managed
  - added a delete control to the left personal-project workspace UI and aligned copy/docs with the owner-based model
- Verification completed locally:
  - backend: `PYTHONPATH=backend ..\\backend\\.venv\\Scripts\\python.exe -m pytest tests\\test_database_auth.py tests\\test_auth_boundaries.py`
  - frontend: `npm run build`
- Important current product reality:
  - tasks still carry internal `project_code` / `project_id` links as compatibility identifiers
  - designers only see their own task and asset history
  - new personal projects are self-managed by their owner account
  - legacy projects that predate owner attribution may still require admin handling
- Remaining follow-up:
  - deploying this patch set requires a real database migration for `projects.owner_user_id`
  - `frontend/src/features/studio/GenerateStudioShell.tsx` remains a large hotspot and is still worth splitting
- Deployment status:
  - local only
  - not yet committed, pushed, or deployed
- Safe to hand off: Yes

### [2026-05-21 19:10] Session Handoff
- Role: Feature / Bugfix / Verification
- Branch: `main`
- Repo status:
  - Working tree clean: No
  - Uncommitted changes: Yes
  - Pushed: No
- What was added locally in this round:
  - designer studio now explicitly distinguishes `文生图` vs `图像编辑`
  - `图像编辑` mode requires at least 1 reference image and allows at most 4
  - studio provider list now follows mode capability:
    - text-to-image mode only shows `image.generate`
    - image-edit mode only shows `image.edit`
  - studio payload now sends `reference_images` / `source_images` arrays while keeping first-image compatibility fields
  - backend now extracts up to 4 reference images and passes all of them into native `gpt-image` edit requests
- Root cause addressed:
  - previous studio flow still mixed text-to-image and image-edit semantics
  - even when a designer uploaded a reference image, the task could still be submitted as `image.generate`
  - `gpt-image-2` therefore often received no real uploaded input image on the upstream side
- Verification completed locally:
  - frontend: `npm run build` passed
  - backend: `test_task_executor_openai.py` passed
  - backend: `test_auth_boundaries.py` passed
- Deployment status:
  - local only
  - not yet committed, pushed, or deployed to `120.79.227.11`
- Next agent first step:
  - commit current local patch set intentionally
  - deploy to server
  - verify with one real `图像编辑 + gpt-image-2 + 2-4 张参考图` task that upstream now sees images in `/images/edits`
- Safe to hand off: Yes

### [2026-05-21 18:10] Session Handoff
- Role: Bugfix / Verification
- Branch: `main`
- Repo status:
  - Working tree clean: No
  - Uncommitted changes: Yes
  - Pushed: No
- Current local uncommitted focus:
  - existing timeout-default + failure-display patch set remains
  - added a local fix for reference-image upload on `gpt-image-2`-style providers
- Root cause verified from code:
  - frontend selected `image.generate` first whenever a provider had both `image.generate` and `image.edit`
  - backend `OpenAIImageProviderAdapter` only sent a real image input for a narrow bridge-model heuristic (`firered` / `image-edit`)
  - as a result, `gpt-image-2` with an uploaded reference image could still hit `/images/generations` without an actual uploaded input image
- What was changed locally:
  - `frontend/src/features/studio/GenerateStudioShell.tsx`
    - when a reference image exists and the provider supports `image.edit`, the studio now prefers the `image-edit` workflow
  - `backend/app/services/task_executor.py`
    - added native image-edit request routing for `gpt-image` / OpenAI image providers
    - when a reference image is supplied, the adapter now sends the real image through `/images/edits` instead of only falling back to text-only/caption behavior
    - added a backend-side fallback so even if a task still arrives as `image.generate`, `gpt-image` providers with reference images will use the native image-edit endpoint
  - `backend/tests/test_task_executor_openai.py`
    - added coverage asserting `gpt-image-2` with a reference image uses `/images/edits` and includes the uploaded image
- Verification completed locally:
  - backend: `test_task_executor_openai.py` passed
  - backend: `test_task_error_reporting.py` passed
  - frontend: `npm run build` passed
- Deployment status:
  - local only so far
  - not yet committed, pushed, or deployed to `120.79.227.11`
- Next agent first step:
  - commit the current local patch set intentionally
  - deploy to the server with the normal `admin git pull` flow
  - after deploy, reproduce one `gpt-image-2` reference-image task and confirm the upstream now sees an actual uploaded image in the request
- Safe to hand off: Yes

### [2026-05-21 15:55] Session Handoff
- Role: Feature / Ops / Verification / Server Recovery
- Branch: `main`
- Repo status:
  - Working tree clean: No
  - Uncommitted changes: Yes
  - Pushed: No for the newest local timeout/error-display patch set
- Current local uncommitted files:
  - `backend/app/core/config.py`
  - `backend/app/models.py`
  - `backend/app/routers/providers.py`
  - `backend/app/schemas.py`
  - `backend/app/services/task_executor.py`
  - `frontend/src/features/studio/GenerateStudioShell.tsx`
  - `frontend/src/pages/admin/ModelsPage.tsx`
  - `frontend/src/styles.css`
  - local `tmp/` remains untracked
- Server facts:
  - Server IP: `120.79.227.11`
  - Deploy path: `/www/wwwroot/qmdh-web`
  - Runtime is managed with Docker Compose
  - `git pull` on the server must be run as `admin` because GitHub deploy-key access does not work under `root`
  - `root` is usable for ops work after adding `safe.directory` for `/www/wwwroot/qmdh-web`
  - Current deployed server code is `30f5196`
  - `alembic current` on the server is `f6a7b8c9d0e1 (head)`
- What was done in this session:
  - Verified repeated image-generation failures directly from live `worker` logs
  - Confirmed the latest failed tasks are true upstream timeouts, not frontend submission failures
  - Confirmed historical upstream instability for `gpt-image-2`: timeout + HTTP 504 + HTTP 404 all occurred
  - Manually increased live-server `gpt-image-2` timeout in PostgreSQL from `180` to `300`
  - Prepared a local code patch to make `300s` the default timeout for provider profiles and to improve failure-detail display without exposing upstream URLs
- Current production issue:
  - Image generation for provider `gpt-image-2` can still fail even after increasing timeout because the upstream image endpoint itself appears unstable
  - Latest known task states include `upstream_timeout` with detail `The read operation timed out`
- Important deployment history:
  - A previous migration desync incident happened on the server: app code moved ahead while Alembic/schema state did not fully match
  - Recovery was completed by manual column repair plus `alembic stamp f6a7b8c9d0e1`
  - Future deploys must verify both schema and `alembic current`, not only `git rev-parse`
- Next agent first step:
  - Run `git status --short` locally and review the 8 modified files before doing anything else
  - Decide whether to commit/push the timeout-default + error-display patch set
  - If pushing, redeploy server code and keep checking whether `gpt-image-2` failures change from timeout to another upstream class
- Safe to hand off: Yes

### [2026-05-18 19:10] Session Handoff
- 执行角色：Feature / Data Governance / Documentation / Verification
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：No
  - 是否有未提交改动：Yes（backend/docs 有未提交修改，另有本地 `tmp/` 未跟踪）
  - 是否已 push：No
- 本次完成：
  - 完成 `task-016` 的账本层落地：新增 `usage_ledgers` 表与 `backend/app/services/usage_ledger.py`
  - 在 task 执行终态、`DELETE /tasks/{id}` 软删、`DELETE /projects/{code}` 项目归档路径补齐 task / provider_call 级记账
  - `/api/v1/dashboard/stats` 已切换为账本读口径，不再直接依赖 live `tasks / provider_calls` 做核心运营聚合
  - 新增 Alembic migration：`e4f5a6b7c8d9_add_usage_ledgers.py`，并为历史任务 / provider call 回填账本
  - 更新 `docs/tasks.md`、`docs/continuity.md`，将 `task-016` 标记为 DONE
  - 后端测试已通过：`python -m unittest discover -s tests`（62 项）
- 修改文件：
  - `backend/app/models.py`
  - `backend/app/services/usage_ledger.py`
  - `backend/app/services/task_executor.py`
  - `backend/app/routers/dashboard.py`
  - `backend/app/routers/tasks.py`
  - `backend/app/routers/projects.py`
  - `backend/migrations/versions/e4f5a6b7c8d9_add_usage_ledgers.py`
  - `backend/tests/test_database_auth.py`
  - `backend/tests/test_task_error_reporting.py`
  - `backend/tests/test_task_soft_delete.py`
  - `docs/tasks.md`
  - `docs/continuity.md`
  - `docs/data-governance.md`
  - `docs/architecture.md`
  - `docs/server-operations.md`
  - `docs/handoff.md`
- 当前任务状态：
  - `task-016`: DONE
  - Chat / 生成失败诊断：DONE（第一轮）
  - seed 图恢复工具：DONE（本地 bundle + 服务器导入路径已明确）
- 风险与注意事项：
  - 账本层已落地，但还没有补“已归档项目只读视图”；当前重点仍是保证统计与审计不断层
  - 新版本部署到任意环境时都要执行 `alembic upgrade head`，否则缺少 `usage_ledgers`
  - 本地 `tmp/seed-inspiration-bundle.zip` 仍只适用于默认灵感库恢复，不覆盖设计师分享图
- 下一位 agent 的第一步：
  - 如果目标是恢复服务器默认灵感图库：上传 `tmp/seed-inspiration-bundle.zip` 到服务器并执行 `import_seed_inspiration_bundle`
  - 如果目标是继续 1.0 主线：回到 `prod-001`，继续拆分 `GenerateStudioShell`
  - 如果目标是继续运营体验：评估 `/admin/projects` 是否需要“已归档项目”只读视图
- 是否可直接接手：Yes

### [2026-05-18 17:05] Session Handoff
- 执行角色：Feature / Ops / Documentation
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：Yes（仅本地 `tmp/` 未跟踪，用于 seed bundle，不应提交）
  - 是否有未提交改动：No
  - 是否已 push：Yes
- 最近已推送提交：
  - `360e449` Add seed inspiration media bundle tools
  - `141df93` Improve runtime error diagnostics
  - `6e2d718` Add inspiration media refresh command
- 本次完成：
  - 为 Chat 与设计生成失败链路补齐结构化报错，前端不再只显示模糊失败；后端会保存 `error_summary / error_detail / error_code / error_hint`
  - 为默认灵感库 seed 图补齐运维入口：
    - `python -m app.cli build_seed_inspiration_bundle --output <zip>`
    - `python -m app.cli import_seed_inspiration_bundle --bundle <zip>`
  - 修正 `refresh_seed_inspiration_media` 的统计口径，区分 `restored`（真实图恢复）与 `placeholders`（仍为占位图）
  - 本地已成功构建 `14/14` 真实图片的 seed bundle：`tmp/seed-inspiration-bundle.zip`
  - 明确服务器升级规则：正常升级不会丢模型、账号、记录、图片；只有执行 `docker compose down -v` 或删除 `postgres_data / backend_media` 才会丢数据
- 当前服务器真实状态：
  - 代码升级可按 `git pull + docker compose up -d --build` 走轻量流程
  - 服务器直接回源抓 ArchDaily / `images.adsttc.com` 仍可能出现 `HTTP 403 AccessDenied`
  - 因此单跑 `refresh_seed_inspiration_media` 不能保证恢复真图；要稳定恢复默认灵感图库，应优先走“本地 bundle 上传 + 服务器导入”
- 当前任务状态：
  - `task-016`: IN_PROGRESS
  - Chat / 生成失败诊断：DONE（第一轮）
  - seed 图恢复工具：DONE（运维入口已具备）
- 风险与注意事项：
  - 当前 seed bundle 只覆盖默认灵感库那批内置条目，不覆盖设计师分享图或任意外部导入图
  - 设计师分享图仍依赖 `backend_media`，正式环境绝不能删卷
  - 若要求“标题与封面严格一一对应”，后续仍建议人工钉死映射后再重打一版 bundle
  - `task-016` 的 `usage_ledger` 主账本层仍未落地，当前 archive 仍是地基，不是完整账本
- 下一位 agent 的第一步：
  - 如果目标是先稳定服务器灵感库：先把本地 `tmp/seed-inspiration-bundle.zip` 上传到服务器 `/www/wwwroot/qmdh-web/seed-inspiration-bundle.zip`，再运行 `import_seed_inspiration_bundle`
  - 如果目标是继续主线：回到 `task-016`，设计独立 `usage_ledger`
  - 如果目标是继续体验：为默认 seed 图做一版“标题 -> 固定封面”人工映射，减少同项目错图
- 是否可直接接手：Yes

## Strategic Note (2026-05-16)

- QMDH 2.0 当前只作为升级方向，不是立即落地目标。
- 后续 1.0 的中大型需求应先参考 `docs/roadmap-2.0-prep.md`，确认不会阻断未来研究型 / 协作型工作流升级路径。
- 若下一位 agent 处理的是新需求而不是纯 bugfix，请先做一轮 2.0 兼容性检查，再决定是否推进实现。

### [2026-05-18 10:56] Session Handoff
- 执行角色：Feature / Data Governance / Verification
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：No
  - 是否有未提交改动：Yes（backend/frontend/docs 均有未提交修改）
  - 是否已 push：No
- 本次完成：
  - 补齐数据治理文档矩阵：把 code / config / DB / media / Redis / seed 的事实源与当前实现状态正式写入 `docs/data-governance.md`
  - 为 `task-016` 增加第二阶段基础归档层：新增 `task_archives` 与 `provider_call_archives`
  - `DELETE /tasks/{id}` 软删时现在会写入结构化归档快照；`DELETE /projects/{code}` 项目归档时也会为项目下任务补齐归档快照
  - 新增 Alembic migration：`c3d4e5f6a7b8_add_task_archives.py`
  - 新增并通过 task soft-delete / project archive 归档测试
- 修改文件：
  - `backend/app/models.py`
  - `backend/app/routers/tasks.py`
  - `backend/app/routers/projects.py`
  - `backend/app/services/task_archive.py`
  - `backend/tests/test_task_soft_delete.py`
  - `backend/tests/test_database_auth.py`
  - `backend/migrations/versions/c3d4e5f6a7b8_add_task_archives.py`
  - `docs/data-governance.md`
  - `docs/tasks.md`
  - `docs/handoff.md`
- 当前任务状态：
  - `task-016`: IN_PROGRESS
  - 已完成项目归档语义 + 结构化 archive snapshot，尚未完成完整 `usage_ledger`
- 风险与注意事项：
  - 当前 archive 层是删除/归档时写快照，不等于已经把所有任务生命周期都账本化
  - 其他环境要继续执行 `alembic upgrade head`，否则会缺少 `task_archives / provider_call_archives`
  - 现阶段 dashboard 仍主要读 live task/provider_call；archive 表是治理地基，不是现有报表主读源
- 下一位 agent 的第一步：
  - 若继续主线，优先定义 `usage_ledger` 的最小字段模型和写入时机
  - 若先做管理体验，再评估是否补 `/admin/projects` 的归档视图
- 是否可直接接手：Yes

## Server Handoff Update (2026-05-15)

- Live-like server has been deployed on Alibaba Cloud:
  - IP: `120.79.227.11`
  - domain: `cityusbdisk.cn`
  - Baota: `https://120.79.227.11:26215`
  - repo path: `/www/wwwroot/qmdh-web`
- App runtime is healthy through Docker Compose:
  - `frontend`, `backend`, `worker`, `postgres`, `redis`
  - Baota proxies `80/443` to `127.0.0.1:8080`
- Domain access is currently blocked by Alibaba filing / access-filing constraints.
  - IP access works
  - domain failure is not an application regression until filing is complete

## Current Server Data State

- This server started from a fresh PostgreSQL database.
- Historic company member accounts were **not** migrated automatically.
- Default state only includes:
  - bootstrap admin from `.env`
  - 3 local dev accounts seeded by bootstrap
- Company member recovery entry is now:
  - `docker compose run --rm backend python -m app.cli seed_users`

## Data Preservation Rules

- Persistent business data lives in Docker volumes:
  - `postgres_data`
  - `backend_media`
  - `redis_data`
- Model keys depend on both:
  - PostgreSQL contents
  - the unchanged server `.env` value for `QMDH_ENCRYPTION_KEY`

Do not do these on the live server without an intentional wipe plan:

- `docker compose down -v`
- deleting `postgres_data` or `backend_media`
- replacing `QMDH_ENCRYPTION_KEY`

## Inspiration Library Note

- Earlier inspiration cards could appear without images because seed posts stored third-party hotlinks directly.
- Stabilization work now localizes seed/imported inspiration images into platform-managed storage, with a managed fallback placeholder when remote downloads fail.

## Primary Runbook

For future agents, the server source of truth is now:

- `docs/server-operations.md`
  - Chat 需要先在 `/admin/models` 配好 `chat.completions` 模型才能实际使用
  - 当前前端最大热点已转移到 `frontend/src/features/studio/GenerateStudioShell.tsx`
- 未完成内容：
  - Chat 模型联调
  - `task-016` 项目级删除归档 + 用量账本
  - 非 OpenAI-compatible adapter 的真实后端接入
- 下一位 agent 的第一步：
  - 先跑仓库 `.venv` 下的后端单测和前端 build 确认基线
  - 再去 `/admin/models` 配一个可用 Chat 模型，验证对话链路
  - 若继续处理运营能力，先设计 `task-016` 的归档口径和项目级删除态
- 是否可直接接手：Yes

### [2026-05-12] Task-010 WIP — API Key 加密 + 操作审计
- 执行角色：Feature / Security
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：No
  - 是否有未提交改动：Yes（task-012/013/014 + review 修复 + task-010 WIP）
  - 是否已 push：No
- 本次完成：
  - **API key 加密**：
    - 新增 `app/core/encryption.py`，使用 Fernet 对称加密
    - 新增 `QMDH_ENCRYPTION_KEY` 配置项
    - `providers.py` 在保存 API key 时加密，读取时解密
    - `model_registry.py` 在使用时解密
  - **操作审计**：
    - 扩展 `AuditLog` 模型，新增 `actor_id`, `target_type`, `target_id`, `target_name` 字段
    - 新增 `app/core/audit.py` 审计工具函数
    - 用户 CRUD（创建/编辑/停用/重置密码）已添加审计日志
    - Provider profile CRUD 已添加审计日志
- 修改文件：
  - `backend/app/core/encryption.py`（新增）
  - `backend/app/core/audit.py`（新增）
  - `backend/app/core/config.py`
  - `backend/app/models.py`
  - `backend/app/routers/users.py`
  - `backend/app/routers/providers.py`
  - `backend/app/services/model_registry.py`
  - `backend/requirements.txt`（新增 cryptography, alembic）
  - `backend/tests/test_provider_profiles.py`
  - `docs/tasks.md`
- 待完成：
  - 引入 Alembic migration 体系
  - 项目 CRUD 审计日志
- 验证结果：
  - 后端 19 tests：✅ 通过
  - 前端 build：✅ 通过
- 下一位 agent 的第一步：
  - 继续引入 Alembic，创建初始 migration
  - 为项目 CRUD 添加审计日志
- 是否可直接接手：Yes
### [2026-05-21 20:05] Session Handoff
- Scope:
  - studio 图像编辑继续沿用上传后的参考图做图
  - 任务一提交后，任务卡片左上角显示本轮使用的参考图缩略图；多张参考图时显示首图和数量
- Code:
  - `backend/app/routers/tasks.py`
    - accepted task result 新增 `reference_image_storage_path` / `reference_image_storage_paths`
  - `backend/app/services/task_executor.py`
    - completed / failed task result 同步写入参考图路径与数量
  - `frontend/src/features/studio/GenerateStudioShell.tsx`
    - `FeedCard` 新增参考图角标
    - 读取任务结果中的参考图路径，在左上角显示缩略图与数量
  - `frontend/src/styles.css`
    - 新增 `feed-card-reference-*` 样式
- Verification:
  - `frontend`: `npm run build` passed
  - `backend`: `python -m pytest tests/test_auth_boundaries.py tests/test_task_executor_openai.py` passed
- Notes:
  - 这批改动仍未部署到服务器 `120.79.227.11`
  - 线上要看到任务卡片参考图角标，仍需部署当前本地未提交改动
