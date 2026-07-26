# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] 会话收束 — **Safe to hand off**
- **HEAD / 生产**：**`9fff78f`**（`main` = `origin/main`；工作区干净）
- **本轮已上生产**：
  1. HappyHorse i2v media 通（复测 `task_2ngmWnoNnI5ASioE3folcgheW7yse92i` completed）+ `size: 1280*720`（`6dedbf2`）
  2. Admin Models UX（`4c32d90`）
  3. Studio 默认：图像 **1K**、视频优先 **HappyHorse**（`9fff78f`）；用户确认 OK
- **归档**：`docs/archive/handoff-2026-07-26-happyhorse-admin-defaults.md`；media 细节见 `docs/archive/handoff-2026-07-25-happyhorse-i2v-media-quota.md`
- **Next（可选）**：`hh-i2v-004` 多 Key；探测 SKU「勿导入」提示；模板分类
- Safe to hand off: **Yes**
- Hard rule：未经用户明确同意，禁止 git push / 生产部署

### [2026-07-26] Studio 默认 1K + HappyHorse — **已上生产**
- Git：**`9fff78f`**
- 冷启动套模板保留 1K；进视频模式 / 画布视频节点优先 HappyHorse
- Safe to hand off: **Yes**

### [2026-07-26] Admin 模型配置 UX — **已上生产**
- Git：**`4c32d90`** — ModelsPage 预设/计费 Tab/探测优化；视频 bulk-import 默认 mp4/900s/per_video
- Safe to hand off: **Yes**
