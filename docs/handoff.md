# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-06-26] Studio 创作区与运营看板 UX — GitHub 已同步，生产待部署
- Role: Studio 布局/创作区 UX、运营看板、使用日志修复、交接文档
- Branch: `main` @ `cecab36`
- Repo status:
  - Local `main`: `cecab36`（工作区干净；`assets/` 未跟踪，可忽略）
  - GitHub `origin/main`: `cecab36`
  - Production server git: `51aba1b5`（**尚未** pull / deploy 本次改动）
  - Production **runtime**: Gemini 后端 hotpatch 仍生效；frontend 与 `cecab36` 功能 **未上线**
- Production URL: **`https://cityusbdisk.cn`**
- Completed (commit `cecab36`, GitHub):
  - Studio 历史卡片 1–4 张统一「上文案 / 下图横向平铺 / 底操作栏」；滚动条贴主栏最右
  - 创作区：标准 1K 标注 + 2K 占位、一次最多 3 张、工具栏固定网格、Ctrl+Enter 提交、参考图右上角 ×、移除无效状态标签与底部文件名列表（删 `StudioReferenceUploadList.tsx`）
  - 运营看板：分组支出统计支持自定义起止日期 + CSV 导出
  - 使用日志：KPI 对齐、双重计费修复（`dashboard.py` + `backend/tests/test_usage_logs.py`）
  - 后端：`image_count` 上限改为 3
- Archive detail: `docs/archive/handoff-2026-06-22-studio-gemini-composer.md`（含 Gemini 热更新背景）
- CPA 配置文档: `docs/cpa-gemini-image-integration.md`
- Next step（**勿擅自部署**，除非负责人明确要求）:
  - 生产 `sudo -u admin git pull` + `docker compose up -d --build frontend backend worker`（或 `tmp/deploy_prod.py`；跳过 migration / 不改 `.env`）
  - 补做 `docker compose build backend worker` 消除 Gemini hotpatch 与镜像漂移
  - Studio 实测 CPA `gemini-3.1-flash-image` 生图
- Safe to hand off: **Yes**

### [2026-06-22] Gemini CPA 生产热更新（后端）
- Role: Gemini CPA 适配、局部生产部署
- Branch: `main` @ `51aba1b` → 后续 Studio/看板改动已在 `cecab36`
- Production URL: **`https://cityusbdisk.cn`**
- Completed (production):
  - CPA `gemini-3.1-flash-image` → `chat_completions_image`（commit `51aba1b`）
  - `git pull` + hotpatch backend/worker（Docker Hub 拉 `python:3.12-slim` 失败时的兜底）
- Deploy log: `docs/archive/deploy-2026-06-22-gemini-hotpatch.log`
- Next step: 见 `[2026-06-26]` 生产部署项
- Safe to hand off: **Yes**

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

<!-- Older entries: docs/archive/handoff-2026-06-12-ops-share-usage-logs-deploy.md, handoff-2026-06-12-grok-video-production.md -->
