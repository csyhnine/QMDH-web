# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] Agent 记忆筛选/经验 — **已上生产**
- GitHub / 生产：**`ab5ac6e`**（功能 `56e9d64`）
- Deploy：frontend + backend rebuild；health OK
- Scrub apply：删 8 条 turn summary；压缩 4 条 session summary（scanned=12）
- 归档：`docs/archive/deploy-2026-07-26-agent-memory.md`
- Safe to hand off: **Yes**

### [2026-07-26] 会话收束 — HappyHorse / Admin / Studio 默认
- 功能基线曾生产 **`9fff78f`**
- Safe to hand off: **Yes**

### [2026-07-26] Studio 默认 1K + HappyHorse — **已上生产**
- Git：**`9fff78f`**
- Safe to hand off: **Yes**
