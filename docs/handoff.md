# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-20] 生产部署 — **DONE @ `3ff220b`**
- Role: 画布 + Chat 上下文/流式 + Agent B1 代码（UI 隐藏）已上生产
- Production HEAD: **`3ff220b`**；Alembic：**`k2l3m4n5o6p7`**
- Archive: **`docs/archive/deploy-2026-07-20-main-canvas-chat-b1.md`**
- Chat：普通对话继续落库；「设计助手」默认不显示
- Next：人工冒烟登录/Chat/画布/生图；再考虑 gov 切片或 VIP Admin
- Safe to hand off: **Yes**

### [2026-07-20] Chat Agent B1 — **已合 main 且已部署（UI 隐藏）**
- Role: `agent_mode` 后端可用；前端需 `VITE_CHAT_AGENT_UI_ENABLED=true` 才显示开关
- Migration：`k2l3m4n5o6p7`
- Next：助手产品完整后再开 UI
- Safe to hand off: **Yes**

### [2026-07-16] Chat Agent / 多 Agent 整包 — **WIP 仍保留**
- Branch: **`wip/agent-multi-chat-2026-07`** @ **`4b0a5b3`**
- 含未切片：gov / B2 HITL / multi / crawl / ref-intent
- Archive: **`docs/archive/handoff-2026-07-16-agent-wip-status.md`**
- Next：B1 稳定后再抽 gov → B2；勿整包 merge
- Safe to hand off: **Yes**

<!-- 更早：deploy-ready / canvas-chat streaming archive -->
