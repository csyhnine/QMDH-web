# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] 修删除对话 FK 冲突 — **已上生产**
- 原因：记忆表 `conversation_id` 引用会话，删对话 → FK 500
- 修复：`83d52be` detach + migration `p7q8r9s0t1u2`（ON DELETE SET NULL）
- 生产：HEAD `83d52be`；alembic `p7q8r9s0t1u2`；health OK
- Safe to hand off: **Yes**

### [2026-07-26] Agent 记忆筛选/经验 — **已上生产**
- Git：**`8955e61`**；scrub 已执行
- 归档：`docs/archive/deploy-2026-07-26-agent-memory.md`
- Safe to hand off: **Yes**

### [2026-07-26] Studio 默认 1K + HappyHorse — **已上生产**
- Git：**`9fff78f`**
- Safe to hand off: **Yes**
