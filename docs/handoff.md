# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-06-15] Server git pull restored (admin user)
- Role: Diagnose deploy key, fix deploy workflow, update docs
- Branch: `main` @ `cfed87f`
- Repo status:
  - Local `main`: `cfed87f`
  - GitHub `origin/main`: `cfed87f`
  - Production server: `cfed87f` (`sudo -u admin git pull` verified)
- Root cause:
  - GitHub deploy key on `admin` was already healthy
  - prior failures came from running `git pull` as `root` in `tmp/deploy_prod.py`
- Completed:
  - verified `sudo -u admin ssh -T git@github.com` and `git pull origin main`
  - updated `tmp/deploy_prod.py` to pull as `admin`
  - updated `docs/server-operations.md` and `docs/continuity.md`
- Next step:
  - continue Production Readiness backlog (`prod-002`, `prod-004`, etc.)
- Safe to hand off: **Yes**

### [2026-06-12] Ops role + inspiration share + usage logs layout deployed
- Role: Commit, GitHub push, production deploy, archive
- Branch: `main` @ `d3d8116` (product code `30cbd1c`; deploy archive through `51d8d56`)
- Repo status:
  - Local `main`: `d3d8116`
  - GitHub `origin/main`: `d3d8116` (push via proxy `127.0.0.1:7897`)
  - Production server: `51d8d56` (git bundle fallback; runtime matches `30cbd1c`)
- Production URL: **`https://cityusbdisk.cn`**
- Completed:
  - **运维 ops 角色**：设计师权限 + 灵感/反馈/模板后台；其他模块 🔒
  - **灵感分享**：支持无原图单图分享、视频分享到灵感库（`media_type`）
  - **使用日志页**：表格列对齐修复
- Archive detail: `docs/archive/handoff-2026-06-12-ops-share-usage-logs-deploy.md`
- Deploy log: `docs/archive/deploy-2026-06-12-30cbd1c.log`
- Next step:
  - optional: smoke ops login / video share / usage logs in browser
- Git push note: `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main` if direct push fails
- Safe to hand off: **Yes**

### [2026-06-12] Usage logs + dashboard default 7d deployed
- Role: Commit, GitHub push, production deploy
- Branch: `main` @ `6771de1`
- Repo status:
  - Local `main`: `6771de1` (in sync with GitHub)
  - GitHub `origin/main`: `6771de1`
  - Production server: `6771de1` (deployed via git bundle fallback)
- Production URL: **`https://cityusbdisk.cn`**
- Completed:
  - Admin **使用日志** page (`/admin/usage-logs`) + `GET /dashboard/usage-logs`
  - Ops dashboard default window changed from 30d → **7d**
  - Deploy: bundle fetch + `docker compose up -d --build`; health OK
- Next step:
  - fix server GitHub deploy key (restore `git pull`)
  - optional: smoke `/admin/usage-logs` in browser
- Safe to hand off: **Yes**

### [2026-06-12] Haodeya Grok video production verified + domain HTTPS live
- Role: Grok video downstream alignment, production deploy, domain SSL, login UX, repo hygiene
- Branch: `main` @ `eb1057f`
- Repo status:
  - Local `main`: `eb1057f` (in sync with GitHub)
  - GitHub `origin/main`: `eb1057f`
  - Production server: `c41778e` (code deployed; `eb1057f` is docs-only, server pull still via bundle)
  - Merged remote branches deleted: `codex/prod-001-studio-refactor`, `codex/production-readiness-release`
- Production URL: **`https://cityusbdisk.cn`**
- Completed:
  - Haodeya Grok adapter: four SKU, `/content` download, final `frame_images` format
  - Live E2E smoke **DONE**: 纯文生 ~2–3 min；首帧图生 ~6 min（用户确认可用）
  - Domain ICP complete; Let's Encrypt SSL for `cityusbdisk.cn`; `.env` switched to HTTPS origin + public media base
  - Login page: removed duplicate icon logo; added remember username/password
- Admin provider: single `haodeya_grok` profile + Studio four-tier SKU menu
- Archive detail: `docs/archive/handoff-2026-06-12-grok-video-production.md`
- Next step:
  - fix server GitHub deploy key (restore `git pull`; until then use git bundle deploy)
  - optional: deploy docs commit `eb1057f` to server (non-urgent)
  - optional: ICP footer on public pages; remove stale local worktree `E:\projects\QMDH-web-pr1-review`
  - monitor slow video queue; no code change required unless upstream SLA changes
- Git push note: from dev machine use proxy `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push origin main` if direct push fails
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
