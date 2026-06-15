# Infrastructure Integrations

Last updated: `2026-06-15`

QMDH-web now integrates five infrastructure projects as an adapter layer instead of replacing the existing `workflow + task` execution core.

## Integrated Stack

| Project | QMDH integration | Entry points |
| --- | --- | --- |
| Vercel AI SDK | Chat stream transport via `useChat` + custom `QmdhChatTransport` | `frontend/src/lib/chat/`, `ChatPage` |
| PydanticAI | Studio assistant with typed tools over existing DB/services | `POST /api/v1/studio-agent/assist` |
| MCP | Stdio MCP server exposing the same Studio tools | `python -m app.integrations.mcp` |
| Meilisearch | Optional full-text search with PostgreSQL fallback | `GET /api/v1/search`, `GET /api/v1/search/status`, `POST /api/v1/search/sync` |
| Biome | Frontend lint/format baseline | `npm --prefix frontend run lint`, `npm --prefix frontend run lint:integrations` |

## Architecture Rule

- **Keep** `workflow + task + worker + usage_ledgers` as the production execution plane for image/video jobs.
- **Add** agent/search infrastructure as sidecars that call existing services.
- **Do not** replace task persistence, billing, or worker execution with a third-party agent runtime.

## Meilisearch

Local Docker service:

```bash
docker compose up -d meilisearch
```

Enable in `.env`:

```env
QMDH_MEILISEARCH_ENABLED=true
QMDH_MEILISEARCH_URL=http://meilisearch:7700
QMDH_MEILISEARCH_API_KEY=qmdh_meili_dev_key
```

Sync indexes after enabling:

```bash
curl -X POST https://cityusbdisk.cn/api/v1/search/sync -H "Authorization: Bearer <admin-token>"
```

When Meilisearch is disabled or unavailable, search automatically falls back to PostgreSQL `ILIKE`.

Incremental index updates run automatically on inspiration and shared-template CRUD when Meilisearch is enabled. Use `POST /api/v1/search/sync` for a full rebuild after bulk imports or first-time enablement.

## Studio Agent

`POST /api/v1/studio-agent/assist`

Body:

```json
{
  "message": "帮我找商业综合体相关的共享模板",
  "provider_id": 12
}
```

The agent can call:

- `search_inspiration_posts`
- `search_shared_templates`
- `list_enabled_image_providers`
- `list_active_workflows`
- `summarize_generation_stack`

It explains generation choices to humans, but actual media generation still happens through the Studio composer and persisted `tasks`.

## MCP Server

MCP is optional because its Python SDK currently conflicts with FastAPI's `starlette` pin.
Install only when you need the stdio server:

```bash
cd backend
pip install -r requirements-mcp.txt
```

Run locally:

```bash
cd backend
python -m app.integrations.mcp
```

Expose the same tool surface to Cursor, Claude Desktop, or other MCP clients.

## Mastra vs QMDH `workflow + task`

These overlap in naming, not in responsibility.

| Dimension | QMDH `workflow + task` | Mastra |
| --- | --- | --- |
| Primary job | Durable async production jobs | In-process agent orchestration |
| Execution | Redis worker, minutes-long upstream calls | Request-scoped agent/workflow runtime |
| Persistence | `tasks`, `assets`, `usage_ledgers`, audit | Agent memory, workflow suspend/resume state |
| Billing | First-class per-task/per-token metering | Not a production billing system |
| Best fit | Image/video generation platform | Open-ended LLM apps and tool-using agents |

### Verdict

For QMDH, the current `workflow + task` design is **more correct** for production media generation because:

1. Jobs are long-running and must survive process restarts.
2. Cost, latency, provider, and failure reason must be queryable in admin surfaces.
3. Worker isolation keeps slow upstream providers away from API request threads.

Mastra is stronger when the product itself is an agent runtime. QMDH is a design production platform that should **borrow agent patterns**, not become a Mastra app.

### Worth absorbing from Mastra

| Mastra idea | QMDH adoption |
| --- | --- |
| Tool registry shared across agents/MCP/clients | Implemented via `studio_agent/tools.py` + MCP server |
| MCP-first tool exposure | Implemented via `app.integrations.mcp.server` |
| Human-in-the-loop suspend/resume | Future candidate for `agent_jobs`, not for image worker tasks |
| Observability around tool calls | `studio_agent.assist` and `mcp.tool_call` audit events |
| Skill manifests | Already present in repo `skills/`; keep aligning with agent router |

### Explicit non-goals

- Do not move image/video execution into Mastra workflows.
- Do not replace `ProviderProfile` with Mastra model router.
- Do not store generated assets only in agent memory.

## Completed Product Wiring

- Inspiration and shared-template browsers call `GET /api/v1/search` with PostgreSQL fallback.
- Studio assistant panel calls `POST /api/v1/studio-agent/assist`.
- Chat page uses `@ai-sdk/react` `useChat` with `QmdhChatTransport`.
- MCP stdio tool calls write `mcp.tool_call` audit events.
- Admin inspiration page exposes **同步搜索索引** for full Meilisearch rebuild.

## Technical Integration Checklist

Status below means **code-level integration is complete**. Product rollout and production enablement are separate.

| Project | Backend / package | Frontend / tooling | Tests | Status |
| --- | --- | --- | --- | --- |
| AI SDK | — | `useChat`, `QmdhChatTransport`, shared `qmdhSseParser`, `src/lib/index.ts` | build + `lint:integrations` | DONE |
| PydanticAI | `app/integrations/studio_agent`, `/studio-agent/assist`, audit | `StudioAssistantPanel` | `test_studio_agent_tools.py` | DONE |
| MCP | `app/integrations/mcp`, `requirements-mcp.txt`, `run_mcp_tool`, audit | — | `test_mcp_audit.py` | DONE |
| Meilisearch | search service/sync/index_hooks/status API, CRUD hooks | `useServerSearch`, `searchSync`, `searchStatus` | `test_search_*`, `test_meilisearch_integration.py` | DONE |
| Biome | — | `biome.json`, `lint`, `lint:integrations`, `format` (`src/lib`) | `npm run lint:integrations` | DONE |

### Public module surfaces

- `backend/app/integrations/search/__init__.py`
- `backend/app/integrations/studio_agent/__init__.py`
- `backend/app/integrations/mcp/__init__.py`
- `frontend/src/lib/index.ts`

### Operational follow-ups (not part of technical integration)

1. Enable Meilisearch in production `.env`, run full sync once.
2. Expand Biome to more frontend directories gradually.
3. Commit and deploy after user approval.
