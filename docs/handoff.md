# Handoff

## Usage Rules
- 本文件只保留最近 3 次交接记录
- 更早记录迁移到 `docs/archive/`
- 交接必须面向陌生 agent 书写
- 如果当前状态不可直接接手，必须明确标记 `WIP`

---

## Latest Handoffs

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

### [2026-05-18 10:28] Session Handoff
- 执行角色：Feature / Migration / Verification
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：No
  - 是否有未提交改动：Yes（backend/docs 改动为主）
  - 是否已 push：No
- 本次完成：
  - 把 `DELETE /projects/{code}` 从硬删改为“项目归档语义”：新增 `projects.archived_at`，归档时批量软删该项目未删 task，但保留 `provider_calls`
  - 归档项目后会从活动项目列表隐藏、解绑成员项目权限、解除资产 `project_id`，并写入 `project.deleted` 审计日志
  - 封住已归档项目继续接单的口子：任务创建现在要求 `Project.archived_at is null`
  - 新增 Alembic migration：`b2c3d4e5f6a7_add_project_archived_at.py`
  - 新增并通过项目归档后端测试；当前全量后端测试 `56` 项通过
  - 已在当前工作区执行 `alembic upgrade head`，本地 `backend/app.db` 已升级到包含 `projects.archived_at`
- 修改文件：
  - `backend/app/models.py`
  - `backend/app/routers/projects.py`
  - `backend/app/routers/tasks.py`
  - `backend/tests/test_database_auth.py`
  - `backend/migrations/versions/b2c3d4e5f6a7_add_project_archived_at.py`
  - `docs/tasks.md`
  - `docs/handoff.md`
- 当前任务状态：
  - `task-016`: IN_PROGRESS
  - 已完成第一阶段“项目归档不抹历史”，尚未补独立 `usage_ledger / task_archive` 结构化账本层
- 风险与注意事项：
  - 当前实现已经避免项目删除导致运营统计和账号用量回退，但历史口径仍主要依赖 `task + provider_call + audit`
  - 若后续需要“查看已归档项目”或“恢复项目”，还要为 `/admin/projects` 设计只读归档视图或恢复动作
  - 其他环境要跟进执行 Alembic migration，否则新代码会因为缺少 `projects.archived_at` 无法正常查询
- 下一位 agent 的第一步：
  - 先确认目标是继续做 `task-016` 第二阶段账本层，还是切回 Chat/模型运维
  - 若继续主线，优先设计 `usage_ledger / task_archive` 的最小结构，而不是回到硬删或自由 JSON
- 是否可直接接手：Yes

### [2026-05-18 10:06] Session Handoff
- 执行角色：Feature / Integration / Verification
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：No
  - 是否有未提交改动：Yes（本轮新增 backend/frontend/docs 改动）
  - 是否已 push：No
- 本次完成：
  - 为 `/api/v1/providers/profiles/{id}/probe` 新增 capability-aware 校验：`chat.completions` 走最小 `POST /chat/completions`，非 Chat profile 继续走 `GET /models`
  - `/admin/models` 已接入“校验”按钮与结果展示，可直接看到最近一次 probe 的 `detail / status`
  - 新增并通过 provider profile probe 后端测试，当前全量后端测试 `55` 项通过
  - 前端 `npm run build` 通过
  - 用真实本地数据冒烟确认：profile `2 / ms_zhipuai_glm-5` 的 probe 现会明确返回 `auth_error`，`checked_url` 为 `https://api-inference.modelscope.cn/v1/chat/completions`
- 修改文件：
  - `backend/app/routers/providers.py`
  - `backend/app/schemas.py`
  - `backend/tests/test_provider_profiles.py`
  - `frontend/src/api.ts`
  - `frontend/src/pages/admin/ModelsPage.tsx`
  - `docs/handoff.md`
- 当前任务状态：
  - `task-007`: DONE
  - `task-012`: DONE
  - 本轮为已完成能力补了一层“可用性校验”，未新开独立 task
- 风险与注意事项：
  - `/models` 可达不代表 Chat 真可用；本地当前问题已经定位为 Chat 上游鉴权失败，而不是 provider profile 完全不可连通
  - 该 probe 对 Chat 会发起一次最小真实请求，适合作为管理员手动排障动作，不应被高频自动轮询
  - 项目级删除仍是 `task-016` 风险源，和本轮修复无冲突但也尚未解决
- 下一位 agent 的第一步：
  - 先在 `/admin/models` 对现有 Chat profile 执行一次“校验”，确认 UI 呈现是否符合预期
  - 再决定是修正 ModelScope token / model 权限，还是继续推进 `task-016`
- 是否可直接接手：Yes

### [2026-05-18 09:38] Session Handoff
- 执行角色：Integration / Documentation
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：No
  - 是否有未提交改动：Yes（本轮仅同步文档）
  - 是否已 push：No
- 本次完成：
  - 按仓库协议重新接手，逐项阅读 `protocol/tasks/handoff/continuity/data-governance/roadmap-2.0-prep/architecture/decisions/server-operations`
  - 先读工作区 diff，再核对代码事实，确认当前未提交改动仅在 `docs/`
  - 基线验证完成：前端 `npm run build` 通过，`cmd /c start-dev.cmd --check` 通过，后端需使用 `backend/.venv/Scripts/python.exe -m unittest discover -s tests` 才能稳定跑全量测试；在仓库 `.venv` 下 51 个测试通过
  - 确认 `task-015` 的第一阶段其实已落地：task 删除已改为软删除，`dashboard/quota` 继续统计软删除历史，migration 与测试都已存在
  - 确认剩余真实风险已转移到项目级删除路径：`backend/app/routers/projects.py` 仍会硬删项目下 task 与 provider call
  - 已为 `task-016` 补首轮 2.0 Compatibility Check，明确项目级删除后续必须复用 task 侧留痕口径，并为未来 `usage_ledger / archive` 预留结构化字段
  - 同步修正文档：更新 `tasks/continuity/architecture/project status/handoff`，移除“App.tsx 仍是超长主入口”“ModelScope 自动派生仍在使用”“task-015 仍未开发”等过期描述
- 修改文件：
  - `docs/tasks.md`
  - `docs/continuity.md`
  - `docs/architecture.md`
  - `docs/deployment.md`
  - `docs/projects/QMDH-001/status.md`
  - `docs/handoff.md`
- 当前任务状态：
  - `task-015`: DONE（task 软删除与基础运营留痕）
  - `task-016`: TODO（项目级删除归档与用量账本补强）
- 风险与注意事项：
  - `/studio/chat` 已具备前后端链路，但必须先在 `/admin/models` 配置 `chat.completions` 模型才能实际使用
  - `frontend/src/features/studio/GenerateStudioShell.tsx` 仍是 4000+ 行热点文件
  - 项目删除当前仍是硬删历史，尚未纳入软删除 / ledger 口径
- 下一位 agent 的第一步：
  - 先用仓库 `.venv` 跑后端测试、再跑前端 build，确认环境无漂移
  - 再去 `/admin/models` 配一个真实 Chat 模型，验证 `/studio/chat`
  - 若继续做运营留痕，先为 `task-016` 做 2.0 Compatibility Check，再设计项目级删除归档
- 是否可直接接手：Yes

### [2026-05-13 17:03] Session Handoff
- 执行角色：Feature / Integration / Documentation
- 当前分支：`main`
- 仓库状态：
  - 工作区是否干净：Yes
  - 是否有未提交改动：No
  - 是否已 push：Yes
- 本次完成：
  - 完成 Chat 页面宽布局修正，消息区不再沿用生成页三栏骨架而被压窄
  - 完成模型管理页收敛：能力分配、adapter 类型、厂商模板、紧凑模板卡、筛选和编辑态回填
  - 修正模型管理页 KPI 中文乱码，并降低浏览器自动填充把 `admin` 误写进 `Base URL / API Key` 的概率
  - 核实库内现状：`tasks=0`、`provider_calls=0`、`assets=4`、`inspiration_posts=12`、`users=66`、`projects=1`
  - 当时确认现状风险：任务删除仍为硬删除，会连带抹掉运营统计来源；已按用户确认方向登记 `task-015 / prod-009`
  - 更新交接文档、任务文档，并同步当前仓库状态到 GitHub
- 修改文件：
  - `frontend/src/App.tsx`
  - `frontend/src/api.ts`
  - `frontend/src/styles.css`
  - `backend/app/routers/providers.py`
  - `backend/app/schemas.py`
  - `backend/tests/test_provider_profiles.py`
  - `docs/tasks.md`
  - `docs/ai-agent-project-docs/docs/handoff.md`
  - `docs/handoff.md`
  - `.gitignore`
- 当前任务状态：
  - `task-011`: DONE
  - `task-012`: DONE
  - `task-013`: DONE
  - `task-014`: DONE
  - `task-015`: 当时记录为 TODO；现已在代码中完成第一阶段软删除
- 风险与注意事项：
  - 运营看板为空是当前数据库里没有任务与 provider 调用，不是前端渲染故障
  - 这条记录已过时：当前 task 删除已改为软删除；仍需注意的是项目删除路径还会硬删历史

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
