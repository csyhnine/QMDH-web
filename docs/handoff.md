# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] HappyHorse i2v 固定样例复测 — **media 已通**
- 生产直打归档最小 body（`size: 1280*720` + `metadata.input.media`）**1 次** → **completed**
- `task_id`: `task_2ngmWnoNnI5ASioE3folcgheW7yse92i`
- 本地仍有未 commit：`size: 1280*720`（`haodeya_grok_video.py` + 单测）；生产仍为 `d2a0c98`（顶层 `size: 720P`）
- Next：用户批准后 commit/deploy → Studio smoke（`hh-i2v-002` / `003`）
- 归档：`docs/archive/handoff-2026-07-25-happyhorse-i2v-media-quota.md`
- Safe to hand off: **Yes（勿擅自 push/deploy）**

### [2026-07-25] Admin 模型配置 UX 第一刀 — **本地完成（未 commit/deploy）**
- 目标：一人运维时侧栏更短、更可读；不改后端合同
- 已改：`ModelsPage.tsx` + `styles.css`
  - 侧栏 Tab：**模型配置** / **Chat 计费**
  - **紧凑首屏**：预设下拉 + 关键字段 + 「更多选项」
  - **探测优化**：默认「未导入」筛选、搜索、已用 Base URL 快捷填入、批量设分类（含**视频**）、导入后本地标记已存在；视频导入会选 `haodeya_grok` / DashScope / Ark / 即梦 adapter + strategies
- 未做：后端 preset schema、probe 共用 body、commit/部署
- Safe to hand off: **Yes（勿 push/deploy 除非用户批准）**

### [2026-07-25] 历史卡片下载 + wan 比例/分辨率传参 — **已上生产**
- Git：**`4edaaec`**（含 `afa563d` 灯箱下载）
- 历史卡片「置入/放大」旁新增「下载」；对比预览/灯箱也可下载
- wan：具体比例 → `WxH` size；「智能/遵循原图」仍用字面 `1K/2K/4K`；编辑模式 4K 自动降为 2K
- 部署：frontend + backend + worker；health 200
- 归档：`docs/archive/deploy-2026-07-25-gallery-download-wan-size.md`
- Safe to hand off: **Yes**

<!-- 更早条目见 docs/archive；含 HappyHorse 单模型档位、用量日志等 -->
