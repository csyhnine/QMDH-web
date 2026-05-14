# Implementation Plan: Production Readiness

## Overview

Production hardening of the QMDH-web platform across 9 areas: task soft-delete, frontend architecture, environment variables, structured logging, health checks, CORS, rate limiting, session cleanup, and static asset storage. Tasks are ordered by dependency: database migration first, then frontend refactor while backend is stable, followed by incremental backend improvements.

## Tasks

- [ ] 1. Task Soft-Delete (Database Migration & Query Layer)
  - [ ] 1.1 Create Alembic migration to add `deleted_at` column to `tasks` table
    - Create new migration file in `backend/migrations/versions/`
    - Add `deleted_at: DateTime(timezone=True), nullable=True, default=None` column
    - Add index on `deleted_at` for query performance
    - _Requirements: 9.1_

  - [ ] 1.2 Update Task model and query filters for soft-delete
    - Modify `backend/app/models.py` to add `deleted_at` field to Task model
    - Update `backend/app/routers/tasks.py` list/detail queries to filter `WHERE deleted_at IS NULL`
    - Return HTTP 404 when a requested task has `deleted_at` set
    - _Requirements: 9.1, 9.2_

  - [ ] 1.3 Modify DELETE endpoint to perform soft-delete with audit logging
    - Change `DELETE /api/v1/tasks/{id}` in `backend/app/routers/tasks.py` to set `deleted_at = utcnow()` instead of deleting the row
    - Accept optional `reason` field in request body (default empty string)
    - Write `task.soft_deleted` audit log entry via `backend/app/core/audit.py`
    - Return HTTP 204 on success, HTTP 403 for unauthorized, HTTP 404 for missing/already-deleted
    - _Requirements: 9.1, 9.6, 9.8, 9.9, 9.10_

  - [ ] 1.4 Update dashboard statistics to include soft-deleted tasks
    - Modify `backend/app/routers/dashboard.py` aggregation queries to NOT filter by `deleted_at`
    - Ensure total cost, task count, and per-provider usage include soft-deleted records
    - Update per-user monthly quota calculation to include soft-deleted tasks created within the month
    - _Requirements: 9.3, 9.4_

  - [ ]* 1.5 Write property test for soft-delete idempotence
    - **Property 3: Soft-Delete Idempotence**
    - Verify: calling soft-delete on already-deleted task returns 404, does not modify `deleted_at`, does not create duplicate audit entry
    - **Validates: Requirements 9.1, 9.9**

  - [ ]* 1.6 Write unit tests for soft-delete behavior
    - Test permission check (403 for unauthorized users)
    - Test 404 for non-existent task ID
    - Test dashboard stats include soft-deleted tasks
    - Test audit log entry creation with and without reason
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

- [ ] 2. Checkpoint - Ensure soft-delete migration and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Frontend Component Architecture
  - [ ] 3.1 Create directory structure and shared components
    - Create `frontend/src/pages/admin/`, `frontend/src/pages/studio/`, `frontend/src/pages/inspiration/`, `frontend/src/pages/chat/`, `frontend/src/pages/auth/`
    - Create `frontend/src/components/shared/Layout.tsx` (nav rail + content area shell)
    - Create `frontend/src/components/shared/AuthGuard.tsx` (redirect to /login if unauthenticated, preserve original path)
    - Create `frontend/src/components/shared/LoadingFallback.tsx` (Suspense fallback)
    - _Requirements: 1.1, 1.4, 1.6_

  - [ ] 3.2 Create AuthContext for centralized auth state
    - Create `frontend/src/context/AuthContext.tsx`
    - Expose current user, login/logout actions, loading state
    - Replace all prop-drilling of user/auth state from App.tsx
    - _Requirements: 1.5_

  - [ ] 3.3 Extract page components from App.tsx into dedicated files
    - Create `frontend/src/pages/auth/LoginPage.tsx`
    - Create `frontend/src/pages/studio/GeneratePage.tsx`
    - Create `frontend/src/pages/inspiration/InspirationPage.tsx`
    - Create `frontend/src/pages/chat/ChatPage.tsx`
    - Create `frontend/src/pages/admin/DashboardPage.tsx`
    - Create `frontend/src/pages/admin/UsersPage.tsx`
    - Create `frontend/src/pages/admin/ModelsPage.tsx`
    - Create `frontend/src/pages/admin/ProjectsPage.tsx`
    - Create `frontend/src/pages/admin/SettingsPage.tsx`
    - Each file ≤600 lines, contains only its own page logic and local state
    - _Requirements: 1.1, 1.3_

  - [ ] 3.4 Create central router configuration with lazy loading
    - Create `frontend/src/router.tsx` with `react-router-dom` v6 route config
    - Use `React.lazy()` for all page component imports
    - Map all 9 URL paths to their respective page components
    - Wrap lazy routes in `<Suspense fallback={<LoadingFallback />}>`
    - _Requirements: 1.2, 1.3_

  - [ ] 3.5 Refactor App.tsx to router shell only
    - Reduce `frontend/src/App.tsx` to ≤200 lines
    - Keep only: AuthContext provider, router shell, global error boundary
    - Remove all inline page logic, move to page components
    - _Requirements: 1.7, 1.8_

  - [ ]* 3.6 Verify frontend build and smoke test
    - Run `npm run build` and confirm zero TypeScript errors
    - Verify each of the 9 routes renders without new console errors
    - _Requirements: 1.7_

- [ ] 4. Checkpoint - Ensure frontend refactor builds cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Environment Variable Standardization
  - [ ] 5.1 Create `.env.production.example` with full variable reference
    - Create `.env.production.example` at repository root
    - Group variables under section headers: `# === database ===`, `# === redis ===`, `# === auth ===`, `# === storage ===`, `# === providers ===`, `# === application ===`
    - Annotate each variable with `# REQUIRED:` or `# OPTIONAL (default: <value>):`
    - Add inline comment explaining purpose and valid format for each variable
    - Mark `QMDH_DATABASE_URL`, `QMDH_REDIS_URL`, `QMDH_ENCRYPTION_KEY`, `QMDH_AUTH_SECRET` as REQUIRED
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [ ] 5.2 Add startup validation for required environment variables
    - Modify `backend/app/core/config.py` to add `validate_required()` method to Settings class
    - Add startup event in `backend/app/main.py` that calls validation before port binding
    - On missing REQUIRED variable: write error to stderr naming the variable, then `sys.exit(1)`
    - _Requirements: 2.5_

  - [ ] 5.3 Reconcile existing `.env.example` files
    - Update root `.env.example` and `backend/.env.example` to be consistent with `.env.production.example`
    - Ensure no variable is documented in only one location
    - _Requirements: 2.7_

- [ ] 6. Backend Structured Logging
  - [ ] 6.1 Create structured logging module with JSON formatter
    - Create `backend/app/core/logging.py`
    - Implement custom formatter using `python-json-logger` JsonFormatter
    - Output single-line JSON per entry with: `timestamp` (ISO 8601 UTC ms), `level`, `logger`, `message`, context fields
    - Support `QMDH_LOG_LEVEL` env var (DEBUG/INFO/WARNING/ERROR/CRITICAL, default INFO, fallback on invalid)
    - Support `QMDH_LOG_FORMAT=console` for human-readable local dev output
    - Accept optional context fields: `user_id`, `project_code`, `task_id` via `extra`
    - _Requirements: 3.1, 3.6, 3.8, 3.9_

  - [ ] 6.2 Implement CorrelationId middleware
    - Create `CorrelationIdMiddleware` in `backend/app/core/logging.py`
    - Read `X-Request-ID` header or generate UUID4
    - Store in `contextvars.ContextVar` for async propagation
    - Add logging filter that injects `correlation_id` into every log record
    - _Requirements: 3.2_

  - [ ] 6.3 Implement access log middleware and disable uvicorn default
    - Create `AccessLogMiddleware` in `backend/app/core/logging.py`
    - Emit one INFO entry on request: `method`, `path`, `client_ip` (no body, no auth headers)
    - Emit one INFO entry on response: `status_code`, `latency_ms`
    - Disable uvicorn's default access logger in `backend/app/main.py`
    - _Requirements: 3.3, 3.4, 3.7_

  - [ ] 6.4 Add unhandled exception logging
    - Add exception handler in `backend/app/main.py` or middleware
    - Emit one ERROR entry with: exception class, message, full traceback, correlation_id
    - _Requirements: 3.5_

  - [ ] 6.5 Wire middleware stack in correct order in main.py
    - Add middleware in order: CORS → CorrelationId → AccessLog → RateLimit
    - Update `backend/app/main.py` with the new middleware registrations
    - _Requirements: 3.2, 3.3, 3.4_

  - [ ]* 6.6 Write unit tests for structured logging
    - Test JSON output format contains required fields
    - Test correlation_id propagation across request lifecycle
    - Test log level configuration and fallback behavior
    - Test console format output when `QMDH_LOG_FORMAT=console`
    - _Requirements: 3.1, 3.2, 3.6, 3.8_

- [ ] 7. Health Check Enhancement
  - [ ] 7.1 Implement enhanced health check endpoint with dependency checks
    - Modify `backend/app/routers/health.py`
    - Run DB `SELECT 1` and Redis `PING` concurrently with 2s per-check timeout
    - Return component status map with values from `{healthy, degraded, timeout, not_configured}`
    - Return HTTP 200 when all healthy/not_configured, HTTP 503 when any degraded/timeout
    - Support `?detail=full` query param for version, uptime, per-component latency_ms
    - Set Redis status to `not_configured` when `QMDH_TASK_EXECUTION_MODE` is not `redis`
    - Ensure full response completes within 5s global budget
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ] 7.2 Add liveness probe endpoint
    - Add `GET /api/v1/health/live` endpoint in `backend/app/routers/health.py`
    - Always return HTTP 200 with `{"status": "alive"}`, no auth, no dependency checks
    - Ensure both health endpoints are exempt from authentication
    - _Requirements: 4.9, 4.10_

  - [ ]* 7.3 Write unit tests for health check responses
    - Test healthy response when all dependencies up
    - Test degraded response when DB or Redis down
    - Test timeout handling
    - Test `not_configured` status for Redis when not in redis mode
    - Test `?detail=full` response includes version and uptime
    - **Property 5: Health Check Status Enum Closure**
    - **Validates: Requirements 4.4, 4.5, 4.6**

- [ ] 8. CORS Multi-Domain Whitelist
  - [ ] 8.1 Implement CORS origin parsing and configuration
    - Modify `backend/app/core/config.py` to parse `QMDH_CORS_ORIGINS` as comma-separated list
    - Enforce max 20 entries, max 253 chars each, strip whitespace, ignore empty entries
    - Fall back to `QMDH_FRONTEND_ORIGIN` as single origin when `QMDH_CORS_ORIGINS` is empty
    - When both set, use `QMDH_CORS_ORIGINS` and ignore `QMDH_FRONTEND_ORIGIN`
    - _Requirements: 5.1, 5.5, 5.6_

  - [ ] 8.2 Update CORSMiddleware configuration in main.py
    - Pass parsed origins list to `CORSMiddleware(allow_origins=...)` in `backend/app/main.py`
    - Ensure `allow_credentials=True` for matched origins
    - Verify case-sensitive exact matching (scheme + hostname + port)
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]* 8.3 Write property test for CORS origin matching
    - **Property 1: CORS Origin Matching**
    - Verify: `match_origin(origin, whitelist)` returns True iff origin is byte-for-byte equal to some entry in whitelist
    - **Validates: Requirements 5.2**

- [ ] 9. API Rate Limiting
  - [ ] 9.1 Implement sliding window rate limiter with Redis
    - Create `backend/app/core/rate_limit.py`
    - Implement sliding window using Redis sorted sets (ZADD, ZREMRANGEBYSCORE, ZCARD)
    - Key pattern: `ratelimit:{user_id}:{endpoint_group}` with TTL = window size
    - Support three endpoint groups: `general`, `generation`, `login` (per-IP)
    - Fail-open: allow request if Redis operation exceeds 100ms or raises error
    - _Requirements: 6.1, 6.2, 6.4, 6.7_

  - [ ] 9.2 Create RateLimitMiddleware and wire into FastAPI
    - Create middleware class in `backend/app/core/rate_limit.py`
    - Return HTTP 429 with `Retry-After` header (1-60 seconds) when limit exceeded
    - Include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on allowed requests
    - Read config from `QMDH_RATE_LIMIT_GENERAL_PER_MINUTE` (default 60), `QMDH_RATE_LIMIT_GENERATION_PER_MINUTE` (default 10), `QMDH_RATE_LIMIT_LOGIN_PER_MINUTE` (default 10)
    - Toggle via `QMDH_RATE_LIMIT_ENABLED` (default `false`); when disabled, skip all checks
    - Register middleware in `backend/app/main.py` in correct stack position
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.8_

  - [ ]* 9.3 Write property test for rate limit sliding window
    - **Property 2: Rate Limit Sliding Window**
    - Verify: given N requests at timestamps T1..TN within 60s window, counter equals exactly N; requests older than 60s are not counted
    - **Validates: Requirements 6.1**

- [ ] 10. Session Expiry Cleanup
  - [ ] 10.1 Implement session cleanup service
    - Create `backend/app/services/session_cleanup.py`
    - Delete expired sessions (`expires_at < utcnow()` AND `revoked_at IS NULL`)
    - Delete old revoked sessions (`revoked_at` > 30 days ago)
    - Process in batches (configurable via `QMDH_SESSION_CLEANUP_BATCH_SIZE`, default 500, range 50-5000)
    - Each batch in its own transaction; rollback failing batch and continue
    - Log completion with `expired_deleted_count`, `revoked_purged_count`, `duration_ms`, `status`
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.7_

  - [ ] 10.2 Add APScheduler integration with Redis lock
    - Configure APScheduler `BackgroundScheduler` in FastAPI `lifespan` event
    - Interval from `QMDH_SESSION_CLEANUP_INTERVAL_SECONDS` (range 60-86400, default 3600)
    - Acquire Redis lock (`SET cleanup_lock NX EX 300`) before running; skip if lock exists
    - _Requirements: 7.3, 7.6_

  - [ ] 10.3 Create CLI command for manual cleanup
    - Create `backend/app/cli.py` with `cleanup_sessions` command
    - Run cleanup logic synchronously and exit
    - Invoked via `python -m app.cli cleanup_sessions`
    - _Requirements: 7.8_

  - [ ]* 10.4 Write unit tests for session cleanup
    - Test expired session deletion
    - Test revoked session purge (>30 days)
    - Test batch processing and transaction rollback on error
    - Test Redis lock prevents concurrent execution
    - _Requirements: 7.1, 7.2, 7.4, 7.6, 7.7_

- [ ] 11. Checkpoint - Ensure backend services pass all tests
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Static Asset Storage Strategy
  - [ ] 12.1 Refactor MediaStorageService with StorageBackend protocol
    - Modify `backend/app/services/media_storage.py`
    - Define `StorageBackend` protocol with `write(relative_path, data)` and `url_for(relative_path)` methods
    - Extract current local storage logic into `LocalStorage` class
    - Add `QMDH_STORAGE_BACKEND` env var support (`local` | `oss`, default `local`)
    - Fail fast at startup if invalid value provided
    - _Requirements: 8.1, 8.5_

  - [ ] 12.2 Implement OSSStorage backend with retry logic
    - Add `OSSStorage` class in `backend/app/services/media_storage.py` using `oss2` SDK
    - Upload to configured bucket with 30s timeout
    - Retry transient errors (network, 5xx) up to 3 times with exponential backoff (1s, 2s, 4s)
    - Fail immediately on non-transient errors (4xx except 408/429)
    - Fail fast at startup if OSS config vars (bucket, endpoint, access key, secret) are missing
    - _Requirements: 8.2, 8.3, 8.7, 8.8_

  - [ ] 12.3 Implement URL resolution with CDN support
    - Store relative paths in DB (e.g., `generated/<provider>/<filename>`)
    - `url_for()` prepends `QMDH_CDN_BASE_URL` when set, or `/media` prefix for local
    - Legacy absolute paths (starting with `http://`, `https://`, `/`) returned as-is
    - Preserve existing path structure regardless of backend
    - _Requirements: 8.4, 8.6, 8.9_

  - [ ]* 12.4 Write property test for storage backend interface contract
    - **Property 4: Storage Backend Interface Contract**
    - Verify: for any valid relative_path, `backend.write(path, data)` followed by `backend.url_for(path)` returns a URL containing the original relative_path as a suffix
    - **Validates: Requirements 8.1, 8.5**

  - [ ]* 12.5 Write unit tests for storage backends
    - Test local storage write and URL resolution
    - Test OSS storage retry on transient errors
    - Test OSS storage immediate failure on non-transient errors
    - Test legacy absolute path passthrough
    - Test startup failure on missing OSS config
    - _Requirements: 8.2, 8.3, 8.7, 8.8, 8.9_

- [ ] 13. Final Checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Backend uses Python (FastAPI), frontend uses TypeScript (React + Vite)
- The middleware stack order in main.py is critical: CORS → CorrelationId → AccessLog → RateLimit

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1", "5.1"] },
    { "id": 1, "tasks": ["1.2", "3.2", "5.2", "5.3"] },
    { "id": 2, "tasks": ["1.3", "3.3", "6.1"] },
    { "id": 3, "tasks": ["1.4", "3.4", "6.2", "8.1"] },
    { "id": 4, "tasks": ["1.5", "1.6", "3.5", "6.3", "8.2"] },
    { "id": 5, "tasks": ["3.6", "6.4", "8.3", "7.1"] },
    { "id": 6, "tasks": ["6.5", "6.6", "7.2", "7.3", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "10.4", "12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3"] },
    { "id": 10, "tasks": ["12.4", "12.5"] }
  ]
}
```
