# Archived Handoff: 2026-06-08 00:00 Release Record

Moved from `docs/handoff.md` on 2026-06-09 during the `prod-001` Studio refactor Phase 1 checkpoint, so `docs/handoff.md` can keep only the latest three handoff entries.

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
