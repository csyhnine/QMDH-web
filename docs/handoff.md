# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-06-26] v1.1.0 — push GitHub，**生产仍为 v1.0.0，勿部署**
- Role: v1.1.0 功能合入、版本号管理、反馈多轮对话、上传限制、2K 生图与历史 meta
- Branch: `main` @ **本 commit**
- Version:
  - **生产 `https://cityusbdisk.cn`：v1.0.0**（Git `51aba1b`，未 pull 本次改动）
  - **GitHub `main`：v1.1.0**（`VERSION` / `CHANGELOG.md` / `README.md`）
- Repo status:
  - Local + GitHub `main`: v1.1.0 全量改动已 commit / push
  - Production server git: `51aba1b5`（**负责人要求：先不部署**）
- Completed (v1.1.0):
  - Studio **2K 生图**（Haodeya；Gemini 2K + 16:9 → 2752×1536，本地已验收）
  - 历史卡片：分辨率 + 像素尺寸 + **Asia/Shanghai** 时间
  - **反馈多轮对话**（`user_feedback_messages` + 用户/管理员线程 UI）
  - 上传限制：**图片 20MB / 文档 10MB**（前后端 + nginx `35m`）
  - 版本管理：`VERSION`、`backend/app/version.py`、健康检查返回版本号
  - 文档：`README.md`、`CHANGELOG.md`、`docs/cpa-gemini-image-integration.md`
  - 含此前 `cecab36`：Studio 创作区 UX、运营看板日期/CSV、使用日志修复
- Local verification:
  - Gemini @ Haodeya：1K ✅、2K ✅
  - `test_feedback_api.py`：6 passed
  - **GPT `gpt-image-2`：401** — Provider Key 配置问题，非代码问题
- **勿 commit**: `assets/` 本地截图
- 未来部署 v1.1.0（**非本次**）:
  1. `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`
  2. **`alembic upgrade head`**（`user_feedback_messages`）
  3. `docker compose up -d --build frontend backend worker`
  4. 验收：2K 2752×1536、反馈多轮、health `version=1.1.0`
- Next step: 负责人确认后再部署生产
- Safe to hand off: **Yes**

### [2026-06-26] Studio 创作区与运营看板 UX — 已并入 v1.1.0
- Commit `cecab36` 内容已包含在 v1.1.0；生产仍未部署。
- Archive: `docs/archive/handoff-2026-06-22-studio-gemini-composer.md`

### [2026-06-22] Gemini CPA 生产热更新（后端）
- Role: Gemini CPA 适配、局部生产部署
- Branch: `main` @ `51aba1b` → 后续改动已合入 v1.1.0
- Production URL: **`https://cityusbdisk.cn`**
- Completed (production):
  - CPA `gemini-3.1-flash-image` → `chat_completions_image`（commit `51aba1b`）
  - `git pull` + hotpatch backend/worker（Docker Hub 拉 `python:3.12-slim` 失败时的兜底）
- Deploy log: `docs/archive/deploy-2026-06-22-gemini-hotpatch.log`
- Next step: 见 v1.1.0 部署项（待负责人确认）
- Safe to hand off: **Yes**

<!-- Older entries: docs/archive/handoff-2026-06-15-server-git-pull.md, handoff-2026-06-12-ops-share-usage-logs-deploy.md -->
