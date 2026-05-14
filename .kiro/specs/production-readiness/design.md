# Design Document: Production Readiness

## Overview

本设计文档描述 QMDH-web 平台生产化准备的技术实现方案，覆盖前端架构拆分、后端可观测性、安全加固、数据生命周期和存储基础设施共 9 项改进。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + react-router-dom v6)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Admin/*  │ │ Studio/* │ │ Inspire  │ │ Chat     │           │
│  │ (lazy)   │ │ (lazy)   │ │ (lazy)   │ │ (lazy)   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────────────────────────────────────────────┐           │
│  │ AuthContext + RouterShell + SharedComponents     │           │
│  └──────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTP
┌─────────────────────────────▼───────────────────────────────────┐
│  FastAPI Middleware Stack (order matters)                        │
│  1. CORSMiddleware (multi-origin)                               │
│  2. CorrelationIdMiddleware (X-Request-ID → contextvar)         │
│  3. StructuredAccessLogMiddleware (request/response logging)    │
│  4. RateLimitMiddleware (Redis sliding window, opt-in)          │
│  ─────────────────────────────────────────────────────────────  │
│  Routers: /health, /auth, /tasks, /chat, /inspiration, ...     │
│  ─────────────────────────────────────────────────────────────  │
│  Services:                                                      │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────────┐    │
│  │ MediaStorage   │ │ SessionCleanup │ │ StructuredLogger │    │
│  │ (local / oss)  │ │ (APScheduler)  │ │ (python-json-log)│    │
│  └────────────────┘ └────────────────┘ └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Choices

| Requirement | Library / Tool | Rationale |
|-------------|---------------|-----------|
| Frontend routing | `react-router-dom@6` | De facto standard, supports lazy routes |
| Structured logging | `python-json-logger` | Lightweight, stdlib-compatible formatter |
| Rate limiting | Custom Redis sliding window | No extra dep; project already uses Redis |
| Session cleanup | `apscheduler@3.x` | In-process scheduler, no external infra |
| OSS storage | `oss2` (Alibaba Cloud) | Target deployment is China-based |
| Correlation ID | `contextvars` (stdlib) | Zero-dep, async-safe |

## Detailed Design

### 1. Frontend Component Architecture

**Target file structure:**
```
frontend/src/
├── App.tsx              (≤200 lines: providers, router shell, error boundary)
├── router.tsx           (route config with React.lazy imports)
├── context/
│   └── AuthContext.tsx  (user state, login/logout, token management)
├── components/shared/
│   ├── Layout.tsx       (nav rail + content area shell)
│   ├── AuthGuard.tsx    (redirect to /login if unauthenticated)
│   └── LoadingFallback.tsx
├── pages/
│   ├── auth/
│   │   └── LoginPage.tsx
│   ├── studio/
│   │   └── GeneratePage.tsx
│   ├── inspiration/
│   │   └── InspirationPage.tsx
│   ├── chat/
│   │   └── ChatPage.tsx
│   └── admin/
│       ├── DashboardPage.tsx
│       ├── UsersPage.tsx
│       ├── ModelsPage.tsx
│       ├── ProjectsPage.tsx
│       └── SettingsPage.tsx
├── api.ts               (unchanged)
└── styles.css           (unchanged)
```

**State migration:**
- All auth state → `AuthContext`
- Per-page state (e.g., `inspirationPosts`, `chatMessages`) → local state within each page component
- Shared API client → imported directly from `api.ts` (no context needed)

**Route mapping:**
| URL Path | Component | Auth Required |
|----------|-----------|---------------|
| `/login` | LoginPage | No |
| `/studio/generate` | GeneratePage | Yes |
| `/studio/inspiration` | InspirationPage | Yes |
| `/studio/chat` | ChatPage | Yes |
| `/admin/dashboard` | DashboardPage | Yes (ops+) |
| `/admin/users` | UsersPage | Yes (admin+) |
| `/admin/models` | ModelsPage | Yes (ops+) |
| `/admin/projects` | ProjectsPage | Yes (ops+) |
| `/admin/settings` | SettingsPage | Yes (admin+) |

### 2. Environment Variable Standardization

**New file:** `.env.production.example` at repo root.

**Validation approach:** In `backend/app/core/config.py`, the existing pydantic-settings `Settings` class already validates. Add a startup event in `main.py` that calls `settings.validate_required()` which checks the REQUIRED subset and raises `SystemExit` with a clear message before `uvicorn` binds the port.

**Required variables for production:**
- `QMDH_DATABASE_URL` (must be postgresql:// in prod)
- `QMDH_REDIS_URL`
- `QMDH_ENCRYPTION_KEY` (Fernet key for API key encryption)

### 3. Backend Structured Logging

**New file:** `backend/app/core/logging.py`

**Implementation:**
- Custom `logging.Formatter` subclass using `python-json-logger`'s `JsonFormatter`
- `CorrelationIdMiddleware` sets a `contextvars.ContextVar[str]` from `X-Request-ID` header or generates UUID4
- A `logging.Filter` injects `correlation_id` from the contextvar into every log record
- Access log middleware emits request/response entries; uvicorn's default access log disabled via `--access-log` flag or log config
- `QMDH_LOG_FORMAT=console` switches to a `logging.Formatter` with human-readable output

**Middleware ordering in `main.py`:**
```python
app.add_middleware(CORSMiddleware, ...)          # 1st: must handle preflight
app.add_middleware(CorrelationIdMiddleware)       # 2nd: sets correlation_id
app.add_middleware(AccessLogMiddleware)           # 3rd: logs req/resp
app.add_middleware(RateLimitMiddleware)           # 4th: checks limits
```

### 4. Health Check Enhancement

**Modified file:** `backend/app/routers/health.py`

**Design:**
- `GET /health` → runs DB `SELECT 1` + Redis `PING` concurrently (asyncio.gather with 2s per-check timeout)
- `GET /health/live` → always returns `{"status": "alive"}`, no auth, no checks
- Both endpoints exempt from auth middleware
- Component status enum: `healthy | degraded | timeout | not_configured`
- `?detail=full` adds `version`, `uptime_seconds`, per-component `latency_ms`

### 5. CORS Multi-Domain Whitelist

**Modified file:** `backend/app/main.py` (CORS setup section)

**Design:**
- Parse `QMDH_CORS_ORIGINS` → `list[str]` in `config.py`
- If empty, fall back to `[QMDH_FRONTEND_ORIGIN]`
- Pass list to `CORSMiddleware(allow_origins=...)` — FastAPI's built-in middleware already handles exact matching and credentials

### 6. API Rate Limiting

**New file:** `backend/app/core/rate_limit.py`

**Algorithm:** Sliding window log using Redis sorted sets:
- Key: `ratelimit:{user_id}:{endpoint_group}` (TTL = window size)
- On each request: `ZADD` current timestamp, `ZREMRANGEBYSCORE` older than window, `ZCARD` for count
- If count > limit → 429 with `Retry-After`
- Fail-open: if Redis raises, allow through

**Endpoint groups:**
- `general`: all `/api/v1/*` except login
- `generation`: `POST /tasks`, `POST /chat/conversations/*/messages`
- `login`: `POST /auth/login` (per-IP)

**Toggle:** `QMDH_RATE_LIMIT_ENABLED` (default `false`)

### 7. Session Expiry Cleanup

**New files:**
- `backend/app/services/session_cleanup.py` (cleanup logic)
- `backend/app/cli.py` (CLI entry point)

**Scheduler:** APScheduler `BackgroundScheduler` started in FastAPI `lifespan` event. Interval from `QMDH_SESSION_CLEANUP_INTERVAL_SECONDS`.

**Redis lock:** `SET cleanup_lock NX EX 300` before running; skip if lock exists (multi-replica safe).

**CLI:** `python -m app.cli cleanup_sessions` runs synchronously for ops use.

### 8. Static Asset Storage Strategy

**Modified file:** `backend/app/services/media_storage.py`

**Design:** Abstract base + two implementations:
```python
class StorageBackend(Protocol):
    def write(self, relative_path: str, data: bytes) -> str: ...
    def url_for(self, relative_path: str) -> str: ...

class LocalStorage(StorageBackend): ...   # current behavior
class OSSStorage(StorageBackend): ...     # oss2 SDK
```

**URL resolution:** DB stores relative paths. `url_for()` prepends `QMDH_CDN_BASE_URL` (if set) or `/media` prefix. Legacy absolute paths (starting with `http` or `/`) returned as-is.

**Retry:** Transient errors (network, 5xx) → retry 3x with 1s/2s/4s backoff. Non-transient (4xx) → immediate raise.

**Dependency:** `oss2` added as optional (`pip install qmdh-web[oss]` or just add to requirements.txt).

### 9. Task Soft-Delete and Usage Archival

**DB migration:** Add `deleted_at: DateTime(timezone=True), nullable=True, default=None, index=True` to `tasks` table.

**Query changes:**
- All task list/detail queries add `.where(Task.deleted_at.is_(None))`
- Dashboard stats queries do NOT filter by `deleted_at` (include all)
- Per-user monthly quota calculation does NOT filter by `deleted_at`

**API change:** `DELETE /tasks/{id}` → sets `deleted_at = utcnow()` instead of `db.delete(task)`. Returns 204.

**Audit:** Writes `task.soft_deleted` event with `{task_id, actor_id, reason}`.

## DB Migrations

| Migration | Table | Change |
|-----------|-------|--------|
| `add_task_deleted_at` | `tasks` | Add `deleted_at` column (nullable DateTime, indexed) |

## API Changes

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/v1/health` | Enhanced: returns component statuses, supports `?detail=full` |
| GET | `/api/v1/health/live` | **New**: always-200 liveness probe |
| DELETE | `/api/v1/tasks/{id}` | Changed: soft-delete (sets deleted_at) instead of hard delete |

## Dependencies (New)

| Package | Version | Purpose |
|---------|---------|---------|
| `react-router-dom` | ^6.20 | Frontend routing |
| `python-json-logger` | ^2.0 | JSON log formatter |
| `apscheduler` | ^3.10 | Session cleanup scheduler |
| `oss2` | ^2.18 | Alibaba Cloud OSS (optional) |

## Correctness Properties

### Property 1: CORS Origin Matching
- **Criteria:** Req 5.2 — exact string match, case-sensitive
- **Property:** For any origin string, `match_origin(origin, whitelist)` returns True iff origin is byte-for-byte equal to some entry in whitelist
- **Type:** Property-based test (pure function)

### Property 2: Rate Limit Sliding Window
- **Criteria:** Req 6.1 — sliding window over 60s
- **Property:** Given N requests at timestamps T1..TN within a 60s window, the counter equals exactly N; requests older than 60s from current time are not counted
- **Type:** Property-based test (deterministic with frozen time)

### Property 3: Soft-Delete Idempotence
- **Criteria:** Req 9.1, 9.9 — delete twice → same state
- **Property:** Calling soft-delete on an already-deleted task returns 404 and does not modify `deleted_at` or create a duplicate audit entry
- **Type:** Property-based test (state transition)

### Property 4: Storage Backend Interface Contract
- **Criteria:** Req 8.1, 8.5 — both backends preserve path structure
- **Property:** For any valid relative_path, `backend.write(path, data)` followed by `backend.url_for(path)` returns a URL containing the original relative_path as a suffix
- **Type:** Property-based test (interface contract)

### Property 5: Health Check Status Enum Closure
- **Criteria:** Req 4.6 — statuses from closed set
- **Property:** The `status` field in any health check response component is always one of `{healthy, degraded, timeout, not_configured}`
- **Type:** Unit test (enum validation)
