# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-06-12] Haodeya Grok video production verified + domain HTTPS live
- Role: Grok video downstream alignment, production deploy, domain SSL, login UX
- Branch: `main` @ `c41778e`
- Repo status:
  - Local `main`: `c41778e`
  - Production server: `c41778e` (bundle deploy)
  - GitHub `origin/main`: may lag local; push via `git -c http.proxy= -c https.proxy= push` when network allows
- Production URL: **`https://cityusbdisk.cn`**
- Completed:
  - Haodeya Grok adapter: four SKU, `/content` download, final `frame_images` format
  - Live E2E smoke **DONE**: 纯文生 ~2–3 min；首帧图生 ~6 min（用户确认可用）
  - Domain ICP complete; Let's Encrypt SSL for `cityusbdisk.cn`; `.env` switched to HTTPS origin + public media base
  - Login page: removed duplicate icon logo; added remember username/password
- Admin provider: single `haodeya_grok` profile + Studio four-tier SKU menu
- Archive detail: `docs/archive/handoff-2026-06-12-grok-video-production.md`
- Next step:
  - optional: push `main` to GitHub; fix server deploy key
  - optional: ICP footer on public pages
  - monitor slow video queue; no code change required unless upstream SLA changes
- Safe to hand off: **Yes**

### [2026-06-11] Development Sequence execution — Phases 0–3 done locally
- Role: Execute `docs/tasks.md` → Development Sequence (2026-06)
- Outcome: Studio refactor merged; video backend + Studio video UI landed on local `main`
- Note: production rollout for video completed in 2026-06-12 entry above
- Archive: prior phase detail in git history `411c719` … `4df3060`

### [2026-06-09] Video provider adapter implementation
- Role: Video provider adapter implementation, stages 1–6
- Branch: `codex/video-model-providers`
- Outcome: DashScope / Volcengine / Jimeng strategies, migration `4d5e6f7a8b9c`, admin models UI
- Note: Haodeya Grok added later in June 2026 session; see 2026-06-12 archive
