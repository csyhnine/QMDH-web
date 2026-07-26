# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-26] Agent 记忆筛选/经验 — **已 push，待服务器部署**
- GitHub：**`56e9d64`**（`main` 已推送）
- 本机无 SSH → **生产尚未 rebuild**；步骤见 `docs/archive/deploy-ready-2026-07-26-agent-memory.md`
- Deploy：pull → build `frontend`+`backend` → scrub dry-run → apply
- Safe to hand off: **Yes（代码已上 GitHub；部署待有 SSH 的人执行）**

### [2026-07-26] 会话收束 — HappyHorse / Admin / Studio 默认
- 功能基线曾生产 **`9fff78f`**；文档 `1d55c27`
- Safe to hand off: **Yes**

### [2026-07-26] Studio 默认 1K + HappyHorse — **已上生产**
- Git：**`9fff78f`**
- Safe to hand off: **Yes**
