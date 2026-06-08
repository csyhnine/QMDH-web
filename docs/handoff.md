# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-06-08 00:00] Session Handoff
- Role: Release/version record cleanup after Studio/model/billing deployment wave
- Branch: `main`
- Repo status:
  - Working tree clean: expected Yes for tracked files after this handoff/version commit
  - Local-only residuals expected: `storage/`, `tmp/`
  - Pushed: check `git ls-remote origin refs/heads/main`
- Version marker:
  - package version: `0.2.0`
  - frontend package version: `0.2.0`
  - changelog: `CHANGELOG.md`
  - optional tag: `v0.2.0`
- Product deployment baseline covered by this release record:
  - `6ae35b1` `feat(models): add model activation toggle`
  - deployed server head before this docs/version commit: `6ae35b1`
- What changed across this release wave:
  - constrained Studio template browser height after the three-column alignment change
  - kept the right-side template preview visible when the pointer moves into it
  - added provider-profile enable/disable actions without changing pricing rules
  - changed pricing rule defaults to unit size `1,000,000` and currency `USD`
  - retained earlier deployed branding, favicon/title, dashboard spend, CSV Excel, composer, and history-card fixes
- Verification completed:
  - frontend: `npm run build` passed
  - backend: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_provider_profiles.py -q` passed with `13 passed`
  - server health before this version-record commit:
    - `http://127.0.0.1:8080/api/v1/health` healthy
    - `http://120.79.227.11/api/v1/health` healthy
- Deployment status:
  - product code through `6ae35b1` was pushed and deployed
  - this version-record commit is documentation/package metadata only and does not require a server rebuild unless the user explicitly wants the server repo HEAD to include the release record
- Important deployment note:
  - server-side direct GitHub HTTPS fetch may still fail intermittently
  - local `git bundle` upload remains the known-good fallback
- Current known hotspots:
  - `frontend/src/features/studio/GenerateStudioShell.tsx` remains oversized
  - Studio template picker and composer behavior should continue to receive online smoke checks after UX changes
- Safe next step for a new agent:
  - re-check local/GitHub/server heads before any deployment
  - if the user wants server HEAD to include the `v0.2.0` record commit, deploy via the known bundle fallback
- Safe to hand off: Yes

### [2026-06-05 14:45] Session Handoff
- Role: Studio UX refinement / branding / CSV export fix / deploy
- Branch: `main`
- Repo status:
  - Working tree clean: No
  - Uncommitted changes: Yes, tracked docs only (`docs/continuity.md`, `docs/handoff.md`) plus local-only `storage/`, `tmp/`
  - Pushed: Yes
- Current important commits:
  - local repo head: `57d134c` `feat(frontend): refine studio flow and add branding`
  - GitHub head: `57d134c`
  - current deployed server head: `57d134c`
- What changed across this round:
  - added frontend branding assets from the provided logo source
  - fixed group-spend CSV export for Excel by emitting UTF-8 BOM
  - refined Studio template browser into an aligned three-column layout with improved right preview presentation
  - added Studio composer auto-collapse behavior while browsing history
  - tightened history cards while preserving full generated image content through proportional scaling
- Verification completed:
  - frontend: `npm run build` passed
  - backend: `.\.venv\Scripts\python.exe -m pytest tests\test_database_auth.py -q` passed with `13 passed`
- Deployment status:
  - GitHub pushed to `57d134c`
  - server deployed to `57d134c`
  - local and public health checks returned `200`
- Important deployment note:
  - local `git push origin main` succeeded
  - server deploy still used bundle fallback
- Current known hotspots:
  - composer auto-collapse still needs online smoke attention at the bottom-edge interaction
  - `frontend/src/features/studio/GenerateStudioShell.tsx` remains oversized
  - history-card density vs readability should still be visually checked with multiple aspect ratios
- Safe to hand off: Yes

### [2026-06-02 16:45] Session Handoff
- Role: Studio/template UX fixes / billing clarity / deploy / takeover prep
- Branch: `main`
- Repo status:
  - Working tree clean: No
  - Uncommitted changes: Yes, tracked docs only (`docs/continuity.md`, `docs/handoff.md`) plus local-only `storage/`, `tmp/`
  - Pushed: Yes
- Current important commits:
  - local repo head: `e6d0d32` `fix(studio): improve template uploads and preview sizing`
  - GitHub head: `e6d0d32`
  - current deployed server head: `e6d0d32`
- What changed across this round:
  - added shared-template admin management, shared/private template split, taxonomy, dual preview images, featured flag, analytics, pricing rules, and quota/billing support
  - fixed history-card image click and regenerate behavior
  - normalized template preview image paths through backend storage URL resolution
  - simplified Studio template cards and hover preview
  - added drag-and-drop upload for admin template original/final images
  - stabilized composer textarea height so long prompts scroll internally
  - clarified admin model-page billing logic
- Verification completed:
  - frontend: `npm run build` passed
  - backend: `backend\.venv\Scripts\python.exe -m pytest tests\test_prompt_template_metrics.py tests\test_quota_enforcement.py tests\test_chat_streaming.py -q` passed with `7 passed`
  - earlier billing/model-page regression slice passed with `17 passed`
- Deployment status:
  - GitHub pushed to `e6d0d32`
  - server deployed to `e6d0d32`
  - local and public health checks returned `200`
- Important deployment note:
  - server-side direct GitHub HTTPS fetch intermittently failed with `GnuTLS recv error (-110)`
  - latest deploy succeeded by shipping a local `git bundle` to the server and fetching from that bundle
- Safe to hand off: Yes
