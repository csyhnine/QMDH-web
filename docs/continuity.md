# Development Continuity

## Purpose

This file is the fast handoff baseline for the next agent. Read these first:

1. `docs/protocol.md`
2. `docs/tasks.md`
3. `docs/handoff.md`
4. `docs/product-boundary.md`
5. `docs/server-operations.md`
6. `docs/data-governance.md`
7. `docs/architecture.md`
8. `docs/decisions.md`
9. this file

## Current Baseline

- Current branch: `main`
- Current release marker: `v0.2.0`
- Current product deployment baseline before the version-recording commit:
  - `6ae35b1` `feat(models): add model activation toggle`
- Local / GitHub / server were re-verified aligned at `6ae35b1` before creating the `v0.2.0` release-record commit.
- After the `v0.2.0` documentation/version commit, re-check `git log -1 --oneline` for the current local/GitHub HEAD; the server remains at the deployed product baseline unless a separate deploy is requested.
- Recent commit chain:
  - `6ae35b1` `feat(models): add model activation toggle`
  - `ceda88e` `fix(studio): keep template preview on hover`
  - `c9a9161` `fix(studio): constrain template browser height`
  - `57d134c` `feat(frontend): refine studio flow and add branding`
  - `e30e191` `fix(dashboard): contain ops cards and hide zero-cost currency`
- Current local working tree status:
  - expected after committing the version record: no tracked code/docs changes
  - untracked local-only folders: `storage/`, `tmp/`
- Local dev URLs:
  - frontend: `http://127.0.0.1:18080`
  - backend: `http://127.0.0.1:18010`
- Local helper commands:
  - startup check: `cmd /c start-dev.cmd --check`
  - frontend build: `npm run build`
  - backend regression slice:
    - `.\.venv\Scripts\python.exe -m pytest tests\test_database_auth.py -q`

## Current Product Reality

- Active runtime roles remain only `admin` and `designer`.
- Studio history, assets, chat conversations, and personal projects are account-owned, not project-member shared.
- Backend/admin surfaces remain admin-only.
- `project_code` / `project_id` still exist as compatibility identifiers, but active product semantics are personal containers.
- `/admin/projects` is not an active frontend surface.
- Shared prompt templates and private prompt templates coexist:
  - shared templates are admin-managed and visible to all designers
  - private templates remain user-owned
- Shared templates support:
  - two-level category taxonomy
  - original image + final image preview assets
  - recent apply / submit-success analytics
  - a manual featured flag that currently still powers the studio `热度` bucket
- Studio template picker supports:
  - category sidebar
  - hover compare preview
  - aligned three-column browsing layout
  - adaptive right preview for wide / tall / balanced images
- Admin template management supports:
  - create / update / delete shared templates
  - drag-and-drop upload for original/final preview images
- Current metering model:
  - image tasks bill from provider profile `pricing_currency / pricing_unit / unit_price`
  - chat bills from `provider_pricing_rules`
  - chat supports `input_tokens`, `output_tokens`, `cached_input_tokens`
  - if a chat model has no pricing rule, usage continues to work but cost is recorded as `0`
  - provider pricing rule defaults are now `unit_size = 1,000,000` and `currency = USD`
- Current quota model:
  - `soft_warn` does not block
  - `hard_block` blocks new image/chat usage based on current-month `usage_ledgers`
  - `billing_status = suspended` blocks immediately
- Current branding reality:
  - left rail now uses the provided QMDH icon asset instead of the placeholder `Q`
  - login uses full `清美道合` wordmark + icon
  - browser title is now `清美道合`
- Current studio composer reality:
  - the composer can auto-collapse into a compact bar while browsing history
  - focusing, opening menus, hovering the collapsed bar, uploading references, or submitting expands it again
- Current history card reality:
  - cards are denser than earlier versions
  - generated image previews now preserve full image content through proportional shrink (`contain`) instead of banner-like crop
- Current admin model reality:
  - provider profiles can be enabled or disabled from the model list without changing existing pricing rules
  - toggling a provider profile updates only the `enabled` state

## Key Recent Changes

- Added model activation toggles and deployed them.
- Changed provider pricing rule defaults to `1,000,000` unit size and `USD`.
- Added provider `display_name` support and deployed it.
- Added user group assignment plus group spend reporting on dashboard/users surfaces.
- Unified dashboard `账号监管` and `执行人排行` activity logic while keeping account-level spend/quota details in monitoring view.
- Excluded legacy local `gpt-image-2` CNY history from current operational spend views to avoid mixed-currency operational summaries.
- Fixed group-spend CSV export for Excel by emitting UTF-8 BOM.
- Added frontend branding assets (`清美道合` wordmark + icon), favicon, and browser title update.
- Refined studio template browser layout, preview presentation, and hover stability.
- Added auto-collapse / expand behavior for the studio composer while browsing history.
- Compressed history-card chrome while preserving full generated image content through proportional preview scaling.

## Current Server Snapshot

- Server IP: `120.79.227.11`
- Deploy path: `/www/wwwroot/qmdh-web`
- Deployment model: Docker Compose
- Current deployed product repo head: `6ae35b1`
- Server working tree: clean
- Verified runtime after latest deploy:
  - `docker compose ps` healthy
  - `http://127.0.0.1:8080/api/v1/health` returns `200`
  - `http://120.79.227.11/api/v1/health` returns `200`
- Current migration status:
  - no new migration was required for the `6ae35b1` deployment baseline
- Current deployment caveat:
  - server-side pull remains unreliable
  - recent deploys continue to use local `git bundle` fallback
- Server access practice:
  - use `admin` for normal git operations when credentials cooperate
  - use `root` for Docker / PostgreSQL / logs / fallback deployment work

## Known Risks And Follow-Up

- `frontend/src/features/studio/GenerateStudioShell.tsx` is still a major hotspot and should still be split further.
- Release/version records are tracked through `CHANGELOG.md`, package versions, and the optional `v0.2.0` Git tag.
- `storage/` and `tmp/` remain expected local-only directories and must not be committed.
- Server deploy fallback still depends on `git bundle`.
- Image upload still uses base64 data URLs and keeps a 10MB per-image limit; raising it safely requires changing both frontend/backend limits and possibly nginx body size.
- Auto-collapsing composer behavior is improved but still a likely UX hotspot; if touched again, re-check bottom-edge expand behavior and scroll jitter.
- Older docs may still contain stale wording about historical `owner / ops` roles or project-member sharing; when docs disagree, trust `docs/product-boundary.md`, `docs/handoff.md`, and this file.

## If A New Agent Takes Over

1. Run `git status --short` first.
2. Expect current local residuals to be:
   - `storage/`
   - `tmp/`
3. Read the latest entry in `docs/handoff.md`.
4. Reconfirm:
   - local head
   - GitHub head
   - server head
   - server health
5. If the task involves deploy, remember:
   - server-side pull may fail
   - fallback via local `git bundle` is known-good
6. If touching studio UX again, re-check:
   - template picker cards and hover preview
   - regenerate behavior
   - history image lightbox behavior
   - composer auto-collapse / expand behavior near the bottom of the history pane
   - history card image readability after compact layout
   - branded rail / login / favicon rendering
7. Do not commit or deploy `tmp/`, `.env`, `backend/app.db`, `storage/`, `frontend/dist/`, or `node_modules/`.

## Near-Term Suggested Next Steps

1. Run a fresh online smoke pass for:
   - composer collapsed-bar expand behavior at scroll bottom
   - history card image readability across wide / tall outputs
   - template picker right preview on mixed aspect ratios
   - branded rail / login / favicon rendering
2. Continue splitting `frontend/src/features/studio/GenerateStudioShell.tsx`.
3. Decide whether template `热度` should remain manual-only or gain true usage-based ranking in the studio UI.
4. Decide whether to keep base64 image upload or move to multipart/direct upload before increasing image size limits.
5. Continue cleaning old docs and mental models so new agents do not reintroduce project-shared history assumptions.
