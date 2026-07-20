# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-20] Chat Agent B1 切片 — **本地分支 DONE，未 push / 未合 main**
- Role: 从 WIP 整包抽出 `chat-004` B1：`agent_mode` + 5 只读 tools + SSE thinking/tool_calls
- Branch: **`feat/chat-004-agent-b1`**（worktree 可选：`E:/projects/QMDH-web-b1`）；基于 `main` @ **`29d7841`**
- 策略：**未**整包 rebase `wip/agent-multi-chat-2026-07`（迁移 ID 与 canvas/context 冲突）；按需移植
- 调用链：`chat.py` → `run_studio_agent_isolated`（无 harness / LangGraph）
- Migration：`k2l3m4n5o6p7`（`AgentSkillRelease` prompt/allowlist；`down_revision=i0j1k2l3m4n5`）
- Tests：`test_chat_agent_*` + `test_chat_context` / canvas 回归已绿
- 硬约束：勿 push / 勿部署，除非用户明确同意
- Next step：用户同意后 push + PR；再切片 gov → B2（整包 WIP 仍保留）
- Safe to hand off: **Yes**

### [2026-07-20] 画布模板 + Chat 上下文 + 真流式 — **已 commit 到 main，未 push**
- Role: 三大块已拆 4 commit 入库 `main`（领先 origin 4）
- Commits：`e75cb3d` canvas → `dd0f121` context → `0b76caa` streaming → `29d7841` docs
- Archive: **`docs/archive/handoff-2026-07-20-canvas-chat-streaming-wip.md`**
- Next step：用户同意后再 push；或继续 Agent 切片
- Safe to hand off: **Yes**

### [2026-07-16] Chat Agent / 多 Agent — **WIP 整包仍在，未合 main**
- Role: 完整 Agent 能力仍在独立 WIP（gov/B2/multi/crawl/ref）
- Branch: **`wip/agent-multi-chat-2026-07`** @ **`4b0a5b3`**（保持不动）
- 生产 / `main`：仍无完整 Agent；B1 仅在 `feat/chat-004-agent-b1`
- Archive: **`docs/archive/handoff-2026-07-16-agent-wip-status.md`**
- Next step：B1 合入后再从 WIP 抽 gov → B2；勿整包 merge
- Safe to hand off: **Yes**

<!-- 更早：轮次导航 docs/archive/chat-round-nav-2026-07-16.md；VIP / 访客部署见对应 archive -->
