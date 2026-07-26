# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] HappyHorse size 1280*720 — **已上生产**
- Git：**`6dedbf2`** — `fix(video): set HappyHorse top-level size to 1280*720`
- 生产：pull + rebuild backend/worker；health 200；运行时 `size=1280*720`，`parameters.resolution=720P`
- Next：Studio 生产 smoke 一条 i2v（`hh-i2v-003`）
- Safe to hand off: **Yes**

### [2026-07-26] HappyHorse i2v 固定样例复测 — **media 已通**
- 生产直打归档最小 body（`size: 1280*720` + `metadata.input.media`）**1 次** → **completed**
- `task_id`: `task_2ngmWnoNnI5ASioE3folcgheW7yse92i`
- 已随 `6dedbf2` 部署 size 适配
- 归档：`docs/archive/handoff-2026-07-25-happyhorse-i2v-media-quota.md`
- Safe to hand off: **Yes**

### [2026-07-25] Admin 模型配置 UX 第一刀 — **本地完成（未 commit/deploy）**
- 目标：一人运维时侧栏更短、更可读；不改后端合同
- 已改：`ModelsPage.tsx` + `styles.css`（+ `providers.py` 视频导入）
- 未做：commit/部署
- Safe to hand off: **Yes（勿 push/deploy 除非用户批准）**

<!-- 更早条目见 docs/archive；含 HappyHorse 单模型档位、用量日志等 -->
