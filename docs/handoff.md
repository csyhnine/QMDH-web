# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-20] 部署就绪 — **GitHub `main` 已齐，生产未部署**
- Role: 画布 + Chat 上下文/流式 + **Agent B1 代码**均已在 GitHub `main`
- HEAD: 以 `origin/main` 为准（含 PR #2；助手 **UI 默认隐藏**）
- Deploy checklist: **`docs/archive/deploy-ready-2026-07-20-main-canvas-chat-b1.md`**
- **Chat 产品方向**：普通对话继续落库收集；个性化助手方向不变；`设计助手` 开关默认隐藏（`VITE_CHAT_AGENT_UI_ENABLED=true` 才显示）
- 硬约束：**等用户确认服务器空闲后再部署**；勿改 `.env`
- Agent：B1 后端已合 main；gov/B2/multi 仍在 `wip/agent-multi-chat-2026-07` @ `4b0a5b3`
- Next step：用户下令 → 按 deploy-ready 清单部署
- Safe to hand off: **Yes**

### [2026-07-20] Chat Agent B1 — **已合入 main（PR #2）**
- Role: `agent_mode` + 5 只读 tools + thinking/tool_calls；无 harness/LangGraph
- Branch 历史：`feat/chat-004-agent-b1`；已 merge → `main`
- Migration：`k2l3m4n5o6p7`
- Next step：随上述部署上生产后验收 Chat 助手开关
- Safe to hand off: **Yes**

### [2026-07-16] Chat Agent / 多 Agent 整包 — **WIP 仍保留**
- Branch: **`wip/agent-multi-chat-2026-07`** @ **`4b0a5b3`**
- 含未切片：gov / B2 HITL / multi / crawl / ref-intent
- Archive: **`docs/archive/handoff-2026-07-16-agent-wip-status.md`**
- Next step：B1 上线稳定后再抽 gov → B2；勿整包 merge
- Safe to hand off: **Yes**

<!-- 更早：画布/流式手写留档 docs/archive/handoff-2026-07-20-canvas-chat-streaming-wip.md；访客部署 archive -->
