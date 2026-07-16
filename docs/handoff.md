# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-07-13] Studio 访客模式 — **待开发（当前最高优先级）**
- Role: 登录页「访客模式」→ Studio 四 Tab 能看不能用
- Branch: 建议 `main` 或 `feat/guest-mode-studio`；**代码未开始**
- 产品已定：
  - 入口：登录页按钮（非独立 /guest 路由）
  - 范围：生成 / 灵感 / 反馈 / 对话 — 设计师可见即访客可见，**全部只读**
  - 不含 Admin
- Archive: **`docs/archive/guest-mode-studio-2026-07-13.md`**
- Handoff: **`docs/archive/handoff-2026-07-13-guest-mode-wip.md`**
- Next step: P0 — `AuthContext` + `AuthGuard` + `LoginPage` + 生成页只读
- Safe to hand off: **Yes**

### [2026-07-03] Haodeya GPT-Image-2-VIP 异步生图 — **WIP，未部署**
- Role: Haodeya 网关 VIP 异步生图（`gpt-image-2-vip`）对接
- Branch: `main` @ **`1ed503d`**（已 push GitHub）
- Production: **未部署** VIP 异步适配
- Completed:
  - 策略 `haodeya_async_image`：`POST /images/generations` + GET 轮询 + `result.data[0].url`
  - 仅对接 **`https://newapi.haodeya.xyz/v1`**（不对接 ToAPI 直连）
  - 2K 临时规则：`gpt-image-2-vip` + `resolution: 2k`（`-2k` SKU 待 Haodeya 修复）
  - 单测 `test_task_executor_toapis_image.py`：6 passed
- Blocked / 待验收:
  - Studio 本地真实联调（1K/2K）需接班人跑通
  - Admin Provider + Key 配置
- Archive: **`docs/archive/haodeya-gpt-image-vip-async-2026-07.md`**
- Handoff: **`docs/archive/handoff-2026-07-03-haodeya-gpt-image-vip-wip.md`**
- Next step: 本地 Studio 验收 → 部署 backend/worker
- Safe to hand off: **Yes**

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
  - 上传限制：**图片 20MB / 文档 10MB**（前后端 + nginx `35m`；兼容上游图像编辑网关限制）
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

<!-- 2026-06-22 Gemini CPA 热更新条目已移入 archive，见 docs/archive/haodeya-image-model-routing-2026-07.md -->
