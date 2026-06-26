# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-06-22] Gemini CPA 生产热更新 + Studio/创作区本地 WIP
- Role: Studio 布局迭代、Gemini 适配、局部生产部署、创作区 UX
- Branch: `main` @ `51aba1b`（Gemini 已 push；其余 Studio/日志/创作区 **未 commit**）
- Repo status:
  - Local `main`: `51aba1b` + 大量 unstaged frontend/backend 改动
  - GitHub `origin/main`: `51aba1b`
  - Production server git: `51aba1b5`
  - Production **runtime**: Gemini 后端已通过 **hotpatch** 生效；frontend **未更新**
- Production URL: **`https://cityusbdisk.cn`**
- Completed (production):
  - CPA `gemini-3.1-flash-image` → `chat_completions_image` 策略（commit `51aba1b`）
  - `git pull` + hotpatch backend/worker（Docker Hub build 失败时的兜底）
- Completed (local only):
  - Studio 历史卡片 1–4 张统一「上文案下图横向平铺」+ 滚动条贴右
  - 使用日志 KPI / 双重计费修复（`dashboard.py`）
  - 创作区移除无效标签；参考图右上角 × 移除；删除底部文件名列表
- Archive detail: `docs/archive/handoff-2026-06-22-studio-gemini-composer.md`
- Deploy log: `docs/archive/deploy-2026-06-22-gemini-hotpatch.log`
- CPA 配置文档: `docs/cpa-gemini-image-integration.md`
- Next step:
  - 生产补做 `docker compose build backend worker`（消除 hotpatch/镜像漂移）
  - 按需 commit + 部署 Studio CSS / 创作区 / 使用日志（frontend 需 rebuild）
  - Studio 实测 CPA gemini 生图
- Safe to hand off: **Yes (WIP local changes)**

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

<!-- Older entries: docs/archive/handoff-2026-06-12-ops-share-usage-logs-deploy.md, handoff-2026-06-12-grok-video-production.md -->
