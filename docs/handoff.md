# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] Admin 模型配置 UX — **已上生产**
- ModelsPage：预设下拉、模型/Chat 计费 Tab、更多选项折叠；探测默认未导入 + 批量分类（含视频）
- `providers.py`：视频能力导入默认 `mp4` / `900s` / `per_video`
- Safe to hand off: **Yes**

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

<!-- 更早条目见 docs/archive；含 HappyHorse 单模型档位、用量日志等 -->
