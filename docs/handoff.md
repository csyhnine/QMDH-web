# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-29] 画布撤销断线 / 公告 / AI 导航 — **已上生产**
- Git：**`90e1a82`**；Alembic：**`r9s0t1u2v3w4`**
- 画布：历史栈撤销、悬停连线断开、模板新建/覆盖；公告弹窗；Studio「导航」+ Admin 工具目录 + 生产种子约 24 条（含 Dify）；导航 UI 与筛选背景割裂修复
- 归档：`docs/archive/handoff-2026-07-29-canvas-announcements-nav.md`
- Safe to hand off: **Yes**

### [2026-07-26] 修删除对话 FK 冲突 — **已上生产**
- 原因：记忆表 `conversation_id` 引用会话，删对话 → FK 500
- 修复：`83d52be` detach + migration `p7q8r9s0t1u2`（ON DELETE SET NULL）
- 生产：当时 HEAD `83d52be`；随后 main 已前进到导航波次
- Safe to hand off: **Yes**

### [2026-07-26] Agent 记忆筛选/经验 — **已上生产**
- Git：**`8955e61`**；scrub 已执行
- 归档：`docs/archive/deploy-2026-07-26-agent-memory.md`
- Safe to hand off: **Yes**
