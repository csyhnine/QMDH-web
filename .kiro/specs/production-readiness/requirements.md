# Requirements Document

## Introduction

Production readiness engineering improvements for the QMDH-web platform (design firm internal AI platform). The project is currently a working MVP and requires production hardening across frontend architecture, backend observability, security, data lifecycle, and storage infrastructure. This spec covers items prod-001 through prod-009 from the project backlog.

## Glossary

- **Platform**: The QMDH-web application consisting of a FastAPI backend and React frontend
- **Frontend_App**: The React single-page application served by Vite, currently implemented as a single App.tsx file
- **Backend_API**: The FastAPI application providing REST endpoints at `/api/v1`
- **Health_Endpoint**: The `/api/v1/health` HTTP endpoint used for service availability checks
- **Task**: A design generation job record in the `tasks` table, containing cost, latency, provider, and result data
- **Auth_Session**: A record in the `auth_sessions` table representing an authenticated user login session
- **Media_Storage_Service**: The backend service responsible for writing and reading user-uploaded and generated image files
- **Rate_Limiter**: Middleware that restricts the number of API requests a client can make within a time window
- **Session_Cleanup_Job**: A scheduled background process that removes expired session records
- **Structured_Logger**: The backend logging subsystem that outputs log entries in machine-parseable JSON format
- **OSS**: Object Storage Service (e.g., Alibaba Cloud OSS or AWS S3) for production file storage
- **CDN**: Content Delivery Network used to serve static assets with low latency
- **Correlation_ID**: A short identifier attached to all log entries within a single HTTP request lifecycle for tracing

## Requirements

### Requirement 1: Frontend Component Architecture

**User Story:** As a frontend developer, I want the monolithic App.tsx file split into route-based components, so that I can maintain and extend individual pages independently without merge conflicts.

#### Acceptance Criteria

1. THE Frontend_App SHALL place each page-level component in a dedicated file under `frontend/src/pages/<domain>/<PageName>.tsx`, where domains are `admin`, `studio`, `inspiration`, `chat`, and `auth`; no single source file under `frontend/src/pages/` SHALL exceed 600 lines.
2. THE Frontend_App SHALL use `react-router-dom` v6 with a central router configuration that maps URL paths (`/login`, `/studio/generate`, `/studio/inspiration`, `/studio/chat`, `/admin/users`, `/admin/dashboard`, `/admin/models`, `/admin/projects`, `/admin/settings`) to page components imported via `React.lazy()`.
3. WHEN a route is navigated to, THE Frontend_App SHALL load only the route's component bundle, and SHALL display a Suspense fallback indicator while the bundle is loading.
4. THE Frontend_App SHALL extract shared UI elements (top navigation, layout shell, route guard component) into modules under `frontend/src/components/shared/`; modules in this directory SHALL NOT contain page-specific business logic or page-specific state.
5. THE Frontend_App SHALL provide a single React context module (`frontend/src/context/AuthContext.tsx`) that exposes the current authenticated user, login/logout actions, and replaces all current prop-drilling of user/auth state through App.tsx.
6. WHEN an unauthenticated request is made to any route except `/login`, THE Frontend_App SHALL redirect to `/login` while preserving the originally requested path so that the user returns to it after successful login.
7. WHEN the refactored Frontend_App is built with `npm run build`, THE Vite build SHALL complete with zero TypeScript errors, AND a manual smoke test on each of the 9 listed routes SHALL produce zero new browser console errors compared to the pre-refactor baseline.
8. THE post-refactor `frontend/src/App.tsx` SHALL contain at most 200 lines and SHALL only declare the router shell, providers, and global error boundary — no inline page logic.

### Requirement 2: Environment Variable Standardization

**User Story:** As a DevOps engineer, I want a documented environment variable reference with required/optional/default annotations, so that I can configure production deployments without reading source code.

#### Acceptance Criteria

1. THE Platform SHALL provide a `.env.production.example` file at the repository root containing every environment variable read by the backend or frontend at runtime.
2. THE `.env.production.example` file SHALL annotate each variable with one of two prefix comments: `# REQUIRED:` for variables whose absence MUST stop startup, or `# OPTIONAL (default: <value>):` for variables with a built-in default.
3. THE `.env.production.example` file SHALL group variables under section header comment lines of the form `# === <subsystem> ===`, with subsystems: `database`, `redis`, `auth`, `storage`, `providers`, `application`.
4. THE following variables SHALL be classified as REQUIRED for production: `QMDH_DATABASE_URL`, `QMDH_REDIS_URL`, `QMDH_ENCRYPTION_KEY`, `QMDH_AUTH_SECRET` (or equivalent token-signing secret); all other variables SHALL be classified as OPTIONAL with documented defaults.
5. IF the Backend_API process starts and any REQUIRED environment variable is missing or empty, THEN THE process SHALL terminate before binding the network port AND SHALL write an error message to stderr that includes the name of the missing variable.
6. THE `.env.production.example` file SHALL include an inline comment for each variable explaining its purpose and valid value range or accepted format.
7. THE existing `.env.example` and `backend/.env.example` files SHALL be reconciled with `.env.production.example` so that no variable is documented in only one location.

### Requirement 3: Backend Structured Logging

**User Story:** As an operations engineer, I want all backend log output in structured JSON format, so that I can ingest logs into ELK or Loki for search, alerting, and dashboards.

#### Acceptance Criteria

1. THE Backend_API SHALL output every log entry to stdout as a single-line JSON object (one entry per line, JSON Lines format) containing at minimum: `timestamp` (ISO 8601 UTC with millisecond precision), `level`, `logger`, `message`, and any context fields supplied by the caller.
2. THE Structured_Logger SHALL include a `correlation_id` field in every log entry emitted within an HTTP request lifecycle; the correlation_id SHALL be derived from the inbound `X-Request-ID` header when present, or generated as a UUID v4 otherwise, and SHALL propagate to logs emitted by background tasks spawned within the request via Python contextvars.
3. WHEN an HTTP request is received, THE Structured_Logger SHALL emit exactly one INFO-level entry containing `method`, `path`, and `client_ip`; the entry SHALL NOT include the request body or any authorization header values.
4. WHEN an HTTP response is sent, THE Structured_Logger SHALL emit exactly one INFO-level entry containing `status_code` and `latency_ms` as a non-negative integer.
5. IF an unhandled exception escapes a request handler, THEN THE Structured_Logger SHALL emit exactly one ERROR-level entry containing the exception class name, exception message, full traceback, and the request's correlation_id.
6. THE Structured_Logger SHALL accept a `QMDH_LOG_LEVEL` environment variable with allowed values `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`, defaulting to `INFO`; IF the variable contains any other value, THEN THE Backend_API SHALL fall back to `INFO` and emit a WARNING entry naming the invalid value.
7. THE Backend_API SHALL disable or replace uvicorn's default access logger so that only one access-log entry is emitted per request.
8. WHEN the environment variable `QMDH_LOG_FORMAT` is set to `console`, THE Structured_Logger SHALL emit human-readable single-line text instead of JSON to support local development; the default value SHALL be `json`.
9. THE Structured_Logger SHALL accept and emit optional context fields including `user_id`, `project_code`, and `task_id` when supplied by the caller via the logger's `extra` argument.

### Requirement 4: Health Check Enhancement

**User Story:** As a platform operator, I want the health endpoint to verify downstream dependencies, so that Kubernetes liveness and readiness probes can detect partial failures.

#### Acceptance Criteria

1. WHEN the `/api/v1/health` endpoint is called, THE Health_Endpoint SHALL execute a `SELECT 1` query through the existing SQLAlchemy session with a per-check timeout of 2 seconds; the result SHALL populate a `database` component status entry.
2. WHEN the `/api/v1/health` endpoint is called AND `QMDH_TASK_EXECUTION_MODE` is `redis`, THE Health_Endpoint SHALL execute a Redis `PING` command with a per-check timeout of 2 seconds; the result SHALL populate a `redis` component status entry.
3. WHERE `QMDH_TASK_EXECUTION_MODE` is not `redis`, THE Health_Endpoint SHALL still emit a `redis` component status entry with the value `not_configured`, and this status SHALL NOT cause the overall response to be downgraded.
4. WHEN every component status is `healthy` or `not_configured`, THE Health_Endpoint SHALL return HTTP 200 with a top-level `status` field set to `healthy` and a `components` map containing each component's individual status.
5. IF any component check returns a status other than `healthy` or `not_configured`, THEN THE Health_Endpoint SHALL return HTTP 503 with the top-level `status` field set to `degraded` and the failing component's name and reason in the `components` map.
6. IF a component check exceeds its 2-second timeout, THEN the corresponding component status SHALL be set to `timeout` (distinct from `degraded`) and the response SHALL be HTTP 503; component statuses SHALL be drawn from the set `{healthy, degraded, timeout, not_configured}`.
7. THE Health_Endpoint SHALL complete the full response within 5 seconds even if individual checks time out, by running checks concurrently or by enforcing a global response budget.
8. THE Health_Endpoint SHALL accept a `?detail=full` query parameter; when supplied, the response SHALL additionally include the application version (read from package metadata), uptime in seconds since process start, and integer `latency_ms` per component check.
9. THE Backend_API SHALL also expose a `/api/v1/health/live` endpoint that always returns HTTP 200 with `{"status": "alive"}` within 1 second, performing no dependency checks, suitable as a Kubernetes liveness probe.
10. THE `/api/v1/health` and `/api/v1/health/live` endpoints SHALL be reachable without authentication headers so that infrastructure probes can call them.

### Requirement 5: CORS Multi-Domain Whitelist

**User Story:** As a DevOps engineer, I want to configure multiple allowed frontend origins for CORS, so that staging and production domains can both access the API.

#### Acceptance Criteria

1. THE Backend_API SHALL accept a comma-separated list of allowed origins via the `QMDH_CORS_ORIGINS` environment variable; the list SHALL contain at most 20 entries, each at most 253 characters, and whitespace around entries and empty entries SHALL be ignored.
2. WHEN a preflight or actual request arrives, THE Backend_API SHALL compare the request's `Origin` header against the parsed whitelist using case-sensitive exact string matching across scheme, hostname, and port; wildcard, regex, and suffix matching SHALL NOT be supported.
3. IF the Origin header matches an entry in the whitelist, THEN THE Backend_API SHALL set the `Access-Control-Allow-Origin` response header to the matched origin AND set `Access-Control-Allow-Credentials` to `true`.
4. IF the Origin header does not match any whitelist entry, THEN THE Backend_API SHALL still route the request normally but SHALL omit `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials` from the response (browser-side enforcement model).
5. IF the parsed `QMDH_CORS_ORIGINS` list is empty (variable unset, empty string, or only whitespace), THEN THE Backend_API SHALL fall back to using the value of `QMDH_FRONTEND_ORIGIN` as a single allowed origin.
6. WHERE both `QMDH_CORS_ORIGINS` and `QMDH_FRONTEND_ORIGIN` are set with non-empty values, THE Backend_API SHALL use `QMDH_CORS_ORIGINS` and SHALL ignore `QMDH_FRONTEND_ORIGIN`.

### Requirement 6: API Rate Limiting

**User Story:** As a platform operator, I want API rate limiting, so that a single client cannot exhaust backend resources or abuse AI generation endpoints.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL enforce a sliding-window rate limit over a 60-second window, scoped per authenticated user (by user_id) for all endpoints under `/api/v1/` except `/api/v1/auth/login`.
2. THE Rate_Limiter SHALL enforce a separate, lower rate limit on the AI generation endpoints `POST /api/v1/tasks` and `POST /api/v1/chat/conversations/{id}/messages`, in addition to the general per-user limit.
3. WHEN a client exceeds either rate limit, THE Rate_Limiter SHALL return HTTP 429 with a `Retry-After` header containing an integer between 1 and 60 indicating seconds until the limit resets.
4. THE Rate_Limiter SHALL use Redis as the backing store for rate limit counters, with each counter operation completing within 100 milliseconds; IF a Redis operation exceeds this timeout, THEN the request SHALL be allowed through (fail-open).
5. THE Rate_Limiter SHALL accept configuration via environment variables `QMDH_RATE_LIMIT_GENERAL_PER_MINUTE` (default 60) and `QMDH_RATE_LIMIT_GENERATION_PER_MINUTE` (default 10) and `QMDH_RATE_LIMIT_LOGIN_PER_MINUTE` (default 10).
6. IF the environment variable `QMDH_RATE_LIMIT_ENABLED` is not set to `true` (case-insensitive), THEN THE Rate_Limiter SHALL allow all requests through without checking or incrementing any counter; the default value SHALL be `false`.
7. WHEN the `/api/v1/auth/login` endpoint receives a request, THE Rate_Limiter SHALL apply a per-IP-address rate limit using the client IP from the request, since user identity is not yet established.
8. WHEN a request is allowed, THE Rate_Limiter SHALL include `X-RateLimit-Limit` (configured limit), `X-RateLimit-Remaining` (requests remaining in current window), and `X-RateLimit-Reset` (unix timestamp of window reset) headers in the response.

### Requirement 7: Session Expiry Cleanup

**User Story:** As a database administrator, I want expired session records automatically cleaned up, so that the auth_sessions table does not grow unbounded.

#### Acceptance Criteria

1. WHEN the Session_Cleanup_Job runs, THE Session_Cleanup_Job SHALL delete `auth_sessions` rows where `expires_at` is earlier than the current UTC time AND `revoked_at` is NULL.
2. WHEN the Session_Cleanup_Job runs, THE Session_Cleanup_Job SHALL also delete `auth_sessions` rows where `revoked_at` is non-null AND `revoked_at` is more than 30 days earlier than the current UTC time.
3. THE Session_Cleanup_Job SHALL execute on a configurable interval set by `QMDH_SESSION_CLEANUP_INTERVAL_SECONDS` (allowed range 60 to 86400, default 3600).
4. WHEN the Session_Cleanup_Job processes deletions, THE Session_Cleanup_Job SHALL delete in batches of size set by `QMDH_SESSION_CLEANUP_BATCH_SIZE` (allowed range 50 to 5000, default 500), committing each batch in its own transaction.
5. WHEN the Session_Cleanup_Job completes a run, THE Structured_Logger SHALL emit one INFO-level entry containing `expired_deleted_count`, `revoked_purged_count`, `duration_ms`, and `status` (`success` or `failed`).
6. WHEN multiple Backend_API replicas are running, THE Session_Cleanup_Job SHALL coordinate via a Redis lock with a 5-minute TTL so that at most one replica executes the job per scheduled tick.
7. IF a batch deletion raises an exception, THEN THE Session_Cleanup_Job SHALL roll back the failing batch's transaction, log the error at ERROR level with the correlation_id, and continue with the next scheduled run rather than aborting all subsequent batches.
8. THE Backend_API SHALL provide a CLI command (`python -m app.cli cleanup_sessions`) that runs the cleanup logic synchronously and exits, for use by operators outside the scheduler.

### Requirement 8: Static Asset Storage Strategy

**User Story:** As a platform operator, I want user-uploaded and generated images stored in cloud object storage with CDN distribution, so that the backend server disk is not a single point of failure and assets load quickly for users.

#### Acceptance Criteria

1. THE Media_Storage_Service SHALL accept a `QMDH_STORAGE_BACKEND` environment variable with allowed values `local` and `oss`, defaulting to `local`; any other value SHALL cause the Backend_API to fail fast at startup with an error naming the invalid value.
2. WHEN `QMDH_STORAGE_BACKEND` is `oss` AND the Media_Storage_Service is asked to write a file, THE Media_Storage_Service SHALL upload the file to the configured OSS bucket within a 30-second timeout per upload.
3. IF `QMDH_STORAGE_BACKEND` is `oss` AND any of the OSS configuration variables (bucket, endpoint, access key, secret) are missing or empty, THEN THE Backend_API SHALL fail fast at startup with an error naming the missing variables.
4. THE Media_Storage_Service SHALL store relative paths (e.g., `generated/<provider>/<filename>`) in database fields and SHALL resolve full URLs at read time by prepending either the value of `QMDH_CDN_BASE_URL` (when set) or the local `/media` URL prefix.
5. WHEN `QMDH_STORAGE_BACKEND` is `local`, THE Media_Storage_Service SHALL maintain its current behavior of writing to the directory tree under `QMDH_MEDIA_ROOT` and serving files via the `/media` URL prefix.
6. THE Media_Storage_Service SHALL preserve the existing relative path structure (`generated/<provider>/<filename>`, `inspiration/<filename>`, `references/<filename>`) regardless of which backend is active.
7. IF an OSS upload fails with a transient error (network error, 5xx response), THEN THE Media_Storage_Service SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s, capped at 8s) before raising an error to the caller.
8. IF an OSS upload fails with a non-transient error (4xx response other than 408/429, authentication error), THEN THE Media_Storage_Service SHALL NOT retry and SHALL raise the error immediately.
9. WHEN serving a legacy asset whose stored path is absolute (begins with `http://`, `https://`, or `/`), THE Media_Storage_Service SHALL return the path as-is without prepending any prefix, preserving backward compatibility.

### Requirement 9: Task Soft-Delete and Usage Archival

**User Story:** As a platform administrator, I want deleted tasks to be soft-deleted rather than permanently removed, so that operational statistics, account usage tracking, and audit trails remain intact.

#### Acceptance Criteria

1. WHEN an authenticated user with delete permission invokes the task delete endpoint with an existing task ID whose `deleted_at` is null, THE Backend_API SHALL set the Task record's `deleted_at` field to the current UTC timestamp and SHALL retain the row, all of its columns, and its primary key in the database.
2. WHEN any caller requests the standard task list endpoint or fetches a task by ID through a non-audit endpoint, THE Backend_API SHALL exclude every Task whose `deleted_at` is non-null from the response, AND SHALL return HTTP 404 when the requested task is soft-deleted.
3. WHEN dashboard statistics are computed (total cost, total task count, per-provider usage counts), THE Backend_API SHALL include both active and soft-deleted Task records in the aggregated values by default, without requiring an explicit "include deleted" flag.
4. WHEN per-user usage quota is calculated for the current calendar month in UTC, THE Backend_API SHALL include soft-deleted tasks created within that month in the consumed-quota total compared against the user's `monthly_quota` field.
5. WHERE the requesting user holds the admin role AND accesses the audit log endpoint, THE Backend_API SHALL return soft-deleted Task records together with their `deleted_at` timestamp, actor identifier, and deletion reason for audit review.
6. WHEN a task is soft-deleted, THE Backend_API SHALL append a `task.soft_deleted` entry to the AuditLog containing the task ID, actor user ID, deletion timestamp, and deletion reason text supplied by the caller; IF the caller omits the reason field, THEN THE Backend_API SHALL store an empty string for the reason and SHALL still complete the soft-delete.
7. WHEN a task is soft-deleted, THE Backend_API SHALL retain all ProviderCall rows and Asset metadata rows whose foreign key references the task without any cascading deletion, and SHALL leave the binary files referenced by each Asset's `storage_path` in place.
8. IF a caller without delete permission for the target task attempts to invoke the task delete endpoint, THEN THE Backend_API SHALL reject the request with HTTP 403 and SHALL NOT modify the `deleted_at` field of any Task record.
9. IF the task delete endpoint is invoked with an ID that does not exist OR whose `deleted_at` is already non-null, THEN THE Backend_API SHALL return HTTP 404 and SHALL NOT modify the existing record or write a new audit log entry.
10. THE Backend_API SHALL NOT expose any endpoint that permanently removes a Task row from the database or that clears the `deleted_at` field to restore a soft-deleted task.
