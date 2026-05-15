# Production Readiness - 进度交接文档

**最后更新：** 2026-05-15
**当前状态：** 52/52 任务已完成

## 概览

本文档记录 `production-readiness` spec 当前的实现进度、已完成审查结论、已修复问题，以及后续建议执行顺序。

本次会话按以下顺序推进：
1. 审查上一位 agent 在 commit `9200db1` 后留下的 10 个“待审查任务”
2. 对照 `requirements.md` 与 `design.md` 验证需求符合性
3. 修复审查中发现的问题
4. 完成 3.5 `Refactor App.tsx to router shell only`
5. 完成 10.1 - 10.4 `Session Expiry Cleanup`
6. 完成 12.1 - 12.5 `Static Asset Storage Strategy`

## 已审查任务

本次已完成审查的任务：
- 3.3 `extract page components`
- 3.4 `router with lazy loading`
- 6.4 `unhandled exception logging`
- 6.5 `wire middleware stack`
- 7.1 `enhanced health check`
- 7.2 `liveness probe`
- 8.1 `CORS origin parsing`
- 8.2 `CORS middleware update`
- 9.1 `sliding window rate limiter`
- 9.2 `RateLimitMiddleware`

## 审查结论

实现方向基本正确的项目：
- 7.2 `/health/live` 已存在，具备基础可用性
- 8.1 / 8.2 已补入 CORS 与 rate limit 相关配置入口，方向正确

审查发现的问题：
1. `backend/app/main.py` 注册了日志相关中间件，但未调用 `setup_logging()`，结构化日志配置未真正生效。
2. `backend/app/core/middleware.py` 的访问日志跳过了 `/health` 与 `/health/live`，且请求结束后未清理 correlation id。
3. `backend/app/routers/health.py` 的返回结构不符合需求：顶层状态值、组件字段结构、`detail=full` 扩展字段、`reason` / `latency_ms` 表达方式都与验收标准不一致。
4. `backend/app/core/rate_limit.py` 未实现通用限流与生成限流叠加，用户维度识别不完整，`X-RateLimit-Reset` 也不是 Unix 时间戳。
5. `frontend/src/router.tsx` 使用了错误路由路径，并向多个页面传入空数据或占位回调，未形成真正可用的受保护路由。
6. `frontend/src/pages/studio/GeneratePage.tsx` 仍是占位页，`frontend/src/App.tsx` 仍保留大量内联页面逻辑，因此 3.5 实际未完成。

上述问题均已在本次会话修复并重新验证。

## 本次已修复

### 审查整改

1. 在 `backend/app/main.py` 启动阶段调用 `setup_logging()`，补齐结构化日志初始化。
2. 调整 `backend/app/core/logging.py` 与 `backend/app/core/middleware.py`，统一 stdout JSON 日志、保留健康检查访问日志，并在请求结束后清理 correlation id。
3. 重写 `backend/app/routers/health.py`，使 `/health` 与 `/health/live` 响应结构符合 requirements / design 中的验收标准。
4. 重写 `backend/app/core/rate_limit.py`，补齐登录限流、通用限流、生成限流叠加、用户维度识别与正确的 reset header。
5. 将 `frontend/src/App.tsx` 重构为纯 router shell，并新增 `frontend/src/features/studio/GenerateStudioShell.tsx` 承载原生成页主体逻辑。
6. 重写 `frontend/src/router.tsx`，接入正确路由、懒加载、真实数据加载与权限保护。
7. 调整 `frontend/src/components/shared/AuthGuard.tsx` 与 `frontend/src/pages/auth/LoginPage.tsx`，支持登录后回跳原始目标页面。
8. 将 `frontend/src/pages/studio/GeneratePage.tsx` 改为导出真实生成页实现，移除占位行为。

### 新完成任务

1. `10.1` 新增 `backend/app/services/session_cleanup.py`
   - 删除 `expires_at < utcnow()` 且 `revoked_at IS NULL` 的会话
   - 删除 `revoked_at` 超过 30 天的已撤销会话
   - 按批次独立提交/回滚，失败记录 ERROR 日志并保留 correlation_id
2. `10.2` 在 `backend/app/main.py` 中通过 FastAPI `lifespan` 接入 APScheduler
   - 调度间隔来自 `QMDH_SESSION_CLEANUP_INTERVAL_SECONDS`
   - 使用 Redis `SET NX EX 300` 锁避免多副本重复执行
3. `10.3` 新增 `backend/app/cli.py`
   - 支持 `python -m app.cli cleanup_sessions`
4. `10.4` 新增 `backend/tests/test_session_cleanup.py`
   - 覆盖过期未撤销会话删除
   - 覆盖 30 天前已撤销会话清理
5. `12.1` 重构 `backend/app/services/media_storage.py`
   - 引入 `StorageBackend` 协议
   - 引入 `LocalStorage` 实现
6. `12.2` 实现 `OSSStorage`
   - 使用 `oss2` SDK
   - 支持最多 3 次瞬态错误重试，退避为 `1s / 2s / 4s`
   - 非瞬态错误立即失败
7. `12.3` 完成存储 URL 解析策略
   - 存储层内部统一返回相对路径
   - API 输出层按 backend/CDN 解析 URL
   - 绝对旧路径（`http://`、`https://`、`/`、其他 scheme）保持原样透传
   - 任务执行中当 provider 返回远程 `url` 时，会先下载再写入平台存储
8. `12.4` 新增 `backend/tests/test_media_storage.py`
   - 覆盖 storage backend 接口契约
9. `12.5` 新增存储单元测试
   - 覆盖 local 写入和 URL 解析
   - 覆盖 OSS retry 与 CDN URL 解析

## 验证情况

通过：
- `cd backend && .venv\\Scripts\\python -c "from app.main import app"`
- `cd backend && .venv\\Scripts\\python -m pytest tests/ -x`
- `cd frontend && npm run build`
- `cd backend && .venv\\Scripts\\python -m app.cli --help`
- 临时 SQLite 冒烟验证 `cleanup_sessions`

当前测试结果：
- backend pytest：`24 passed`
- frontend build：通过

已补充依赖：
- `pytest`
- `apscheduler`
- `oss2`

并已同步到：
- `backend/requirements.txt`

## 当前任务进度

已确认完成：
- 1.1 - 1.4
- 3.1 - 3.5
- 5.1 - 5.3
- 6.1 - 6.5
- 7.1 - 7.2
- 8.1 - 8.2
- 9.1 - 9.2
- 10.1 - 10.4
- 12.1 - 12.5

下一批 ready 任务：
1. `3.6` Verify frontend build and smoke test
2. `6.6` Structured logging unit tests
3. `7.3` Health check unit tests
4. `8.3` CORS origin matching property test
5. `9.3` Rate limit sliding window property test
6. `11` Checkpoint - Ensure backend services pass all tests
7. `13` Final checkpoint - Full integration verification

## 已知问题

1. `frontend/src/features/studio/GenerateStudioShell.tsx` 是从旧 `App.tsx` 主体逻辑迁移出来的，虽然已满足 3.5 的 “router shell only” 要求，但内部仍保留较重的页面级状态与分支逻辑，后续如果继续做前端架构整理，可以再拆分。
2. 如果再次尝试使用 `task_update`，仍可能遇到文件锁 `EPERM`；继续直接编辑 `tasks.md` 即可。
3. 如果再次尝试 `invoke_sub_agent`，仍可能遇到 `Invalid model ID`；需要手动执行。
4. `OSSStorage` 目前按 `QMDH_OSS_ENDPOINT + bucket` 推导公开 URL；如果线上使用自定义域名，优先通过 `QMDH_CDN_BASE_URL` 覆盖。

## 完整文件清单（本次会话改动）

**新增**
```text
backend/app/cli.py
backend/app/core/middleware.py
backend/app/core/rate_limit.py
backend/app/services/session_cleanup.py
backend/tests/test_media_storage.py
backend/tests/test_session_cleanup.py
frontend/src/router.tsx
frontend/src/pages/auth/LoginPage.tsx
frontend/src/pages/admin/DashboardPage.tsx
frontend/src/pages/admin/UsersPage.tsx
frontend/src/pages/admin/ModelsPage.tsx
frontend/src/pages/admin/ProjectsPage.tsx
frontend/src/pages/admin/SettingsPage.tsx
frontend/src/pages/inspiration/InspirationPage.tsx
frontend/src/pages/chat/ChatPage.tsx
frontend/src/pages/studio/GeneratePage.tsx
frontend/src/pages/studio/GeneratePagePlaceholder.tsx
frontend/src/features/studio/GenerateStudioShell.tsx
```

**修改**
```text
backend/app/core/config.py
backend/app/core/logging.py
backend/app/main.py
backend/app/routers/assets.py
backend/app/routers/health.py
backend/app/routers/tasks.py
backend/app/services/media_storage.py
backend/app/services/task_executor.py
backend/requirements.txt
backend/tests/test_task_executor_openai.py
frontend/src/App.tsx
frontend/src/components/shared/AuthGuard.tsx
frontend/src/components/shared/index.ts
frontend/src/pages/auth/LoginPage.tsx
frontend/src/pages/studio/GeneratePage.tsx
frontend/src/router.tsx
.kiro/specs/production-readiness/tasks.md
```

## Review Log - 2026-05-15

Current status: `52/52` tasks completed in `tasks.md`.

Reviewed and confirmed in this pass:
- `1.5`, `1.6`: soft-delete behavior now has automated coverage for idempotence, permission checks, hidden list/detail behavior, dashboard/quota inclusion, and audit payloads.
- `3.6`: frontend build passes, and the 9-route smoke test was completed locally. During this pass, the missing left navigation for designer/admin routes and the admin layout whitespace regression were fixed by introducing a shared app shell.
- `6.6`: structured logging now has unit coverage for JSON fields, invalid log-level fallback, console mode, and correlation-id propagation.
- `7.3`: health check responses now have unit coverage for healthy, degraded, timeout, `not_configured`, detail mode, and status-enum closure.
- `8.3`: CORS exact-match behavior now has property-style coverage. This pass also fixed a spec mismatch so non-whitelisted origins no longer receive `Access-Control-Allow-Credentials`.
- `9.3`: sliding-window rate limiting now has deterministic coverage proving counts only include requests inside the latest 60-second window.
- `2`, `4`, `11`, `13`: checkpoints re-run and validated after the fixes above.

Issues found and fixed in this pass:
1. `DELETE /tasks/{id}` previously ignored the caller-supplied deletion reason. The endpoint now accepts an optional JSON body, stores the reason (or an empty string), and records `deleted_at` in the audit log payload.
2. Exact-match CORS behavior had a hidden compliance gap: for disallowed origins, Starlette still emitted `Access-Control-Allow-Credentials`. Added `StrictCORSMiddleware` so disallowed origins now omit both allow-origin and allow-credentials headers.
3. The refactor removed the left rail for some designer/admin pages and caused uneven admin content layout. Added `frontend/src/components/shared/AppShell.tsx`, wrapped the non-generate studio/admin routes with it, and tightened layout CSS so the admin canvas recenters correctly.

Validation re-run on 2026-05-15:
- `cd backend && .venv\Scripts\python -c "from app.main import app"` -> OK
- `cd backend && .venv\Scripts\python -m pytest tests/ -x` -> `42 passed, 1 warning`
- `cd frontend && npm run build` -> OK
- Browser smoke rechecked after the shell/layout fix for `/studio/generate`, `/studio/inspiration`, `/studio/chat`, `/admin/dashboard`, `/admin/users`, `/admin/models`, `/admin/projects`, `/admin/settings`

Follow-up notes:
- `frontend/src/features/studio/GenerateStudioShell.tsx` still carries a lot of page-local state and branching. Functionally it is correct, but it remains the next good candidate for deeper frontend decomposition.
- The navigation/layout regression is fixed now; keeping a lightweight browser smoke around the left rail and admin canvas would help prevent this specific regression from resurfacing.
