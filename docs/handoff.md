# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] Agent 记忆筛选/经验/存量 scrub — **待 push 部署**
- **Done（`agent-memory-002`）**：停写 turn summary；distill；session compact；`experience`；scrub 脚本
- **文件**：`agent_memory_service.py`、`scrub_agent_memory_legacy.py`、`ChatAgentMemoryDrawer.tsx`、单测、docs
- **Deploy 计划**：push → 生产 pull → rebuild `frontend`+`backend` → scrub `--dry-run` 再 `--apply`
- Safe to hand off: **Yes after deploy**
- Hard rule：push/deploy 已获用户批准（本会话）

### [2026-07-26] 会话收束 — HappyHorse / Admin / Studio 默认
- 功能基线生产 **`9fff78f`**；文档曾至 `1d55c27`
- Safe to hand off: **Yes**

### [2026-07-26] Studio 默认 1K + HappyHorse — **已上生产**
- Git：**`9fff78f`**
- Safe to hand off: **Yes**
