# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] 修删除对话 FK 冲突 — **待部署**
- 原因：`agent_memory_entries.conversation_id` 仍引用会话，DELETE conversations → 500
- 修复：删会话前 detach（删 session summary，长期记忆清空 conversation_id）+ FK `ON DELETE SET NULL`
- Safe to hand off: after deploy

### [2026-07-26] Agent 记忆筛选/经验 — **已上生产**
- GitHub / 生产：**`8955e61`**
- Scrub：删 8 turn summary；压 4 session
- 归档：`docs/archive/deploy-2026-07-26-agent-memory.md`
- Safe to hand off: **Yes**

### [2026-07-26] Studio 默认 1K + HappyHorse — **已上生产**
- Git：**`9fff78f`**
- Safe to hand off: **Yes**
