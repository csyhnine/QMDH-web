# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-30] 对比多原图 / 画布导航 / 上游参考 — **已上生产**
- Git tip：**`79f4814`**；Alembic：**`r9s0t1u2v3w4`**（无新迁移）
- 多原图对比可选 + 灯箱铺满修复；画布进场/中键双击 fitView + 缩略图拖拽/点击；图生图换上游优先当前上游
- 归档：`docs/archive/handoff-2026-07-30-compare-canvas-upstream.md`；部署：`docs/archive/deploy-2026-07-29-compare-canvas-upstream.md`
- **已取消**：算力/对外简历运营数据专项（勿续做）
- 本对话收束：无代码 WIP；未跟踪仅 `assets/` 与旧 handoff 草稿（勿提交）
- Safe to hand off: **Yes**

### [2026-07-29] 画布撤销断线 / 公告 / AI 导航 — **已上生产**
- 运行时曾底仓 **`90e1a82`**；现已前进到 **`79f4814`**
- 归档：`docs/archive/handoff-2026-07-29-canvas-announcements-nav.md`
- Safe to hand off: **Yes**

### [2026-07-26] 修删除对话 FK 冲突 — **已上生产**
- 修复：`83d52be` + migration `p7q8r9s0t1u2`（ON DELETE SET NULL）
- Safe to hand off: **Yes**
