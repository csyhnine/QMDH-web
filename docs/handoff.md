# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-06-11] Development Sequence execution — Phase 0–1 done, Phase 2 in progress
- Role: Execute `docs/tasks.md` → Development Sequence (2026-06)
- Branch: `codex/video-model-providers` (video WIP on top of merged Studio)
- Repo status:
  - Working tree clean: No
  - Local `main`: `c237d93` (Studio refactor + composer CSS fix)
  - GitHub `origin/main`: still `005e25d` — **not pushed**
  - Server: still `6ae35b1` — Studio **not deployed**
- Completed this session:
  - Phase 0: production health OK; local `npm run smoke:studio` 8/8
  - Phase 1: PR #1 verified (build, 55 pytest, smoke); composer CSS fix committed; fast-forward merge to local `main`
  - Phase 2 started: video WIP stashed and reapplied onto Studio merge; backend files auto-merged; docs conflicts resolved
- Verification on merged Studio (`c237d93`):
  - `npm run build` passed
  - `npm run smoke:studio` 8/8
  - backend pytest slice: 50 passed
- Next step:
  - run video pytest + alembic heads + commit video backend
  - merge to `main`, push, close PR #1
  - no deploy without user approval
- Safe to hand off: WIP — video backend uncommitted

### [2026-06-09] Video provider adapter implementation
- Role: Video provider adapter implementation, stages 1–6
- Branch: `codex/video-model-providers`
- Outcome: adapter layer, DashScope/Volcengine/Jimeng strategies, migration `4d5e6f7a8b9c`, admin models UI; tests passed locally before Studio merge
- Note: superseded by 2026-06-11 execution entry for current branch state

### [2026-06-08] v0.2.0 release record
- Role: Release/version record after model activation / Studio UX wave
- Branch: `main` @ `005e25d`
- Deployed product baseline: `6ae35b1`
- Server health verified; bundle deploy fallback remains known-good
