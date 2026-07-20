# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-20] 画布模板 + Chat 上下文 + 真流式 — **本地 DONE，未 commit（WIP 工作区）**
- Role: 本轮 `main` 工作区三大块本地实现；流式已获用户确认
- 含：Canvas 模板库；Chat 上下文窗口+摘要落库；SSE 真流式 UX（状态进 AI 气泡）
- Archive: **`docs/archive/handoff-2026-07-20-canvas-chat-streaming-wip.md`**
- 硬约束：勿 push / 勿部署，除非用户明确同意
- Next step: **先拆 commit 留档入库** → 再 Agent rebase/B1 切片；或按用户指定二选一
- Safe to hand off: **Yes**（代码在工作区未提交；详见 archive）

### [2026-07-16] Chat Agent / 多 Agent — **WIP 分支，未合 main、未上生产**
- Role: Agent 能力落点说明（为何 Chat 页看不到 agent mode）
- Branch: **`wip/agent-multi-chat-2026-07`** @ **`4b0a5b3`**
- 生产 / 当前 `main`：`/studio/chat` = **纯 LLM**，无 `agent_mode` 入口
- Archive: **`docs/archive/handoff-2026-07-16-agent-wip-status.md`**
- Next step: rebase 到 `main`（含 07-20 本地改动入库后）后按 B1→gov→B2 拆 PR（勿整包上）
- Safe to hand off: **Yes**

### [2026-07-16] Chat 对话轮次导航 — **本地 DONE，未 commit**
- Role: `/studio/chat` 右侧多轮翻记录导航（千问式横刻度）
- Behavior: 单轮不显示；多轮默认只显示横刻度；悬停刻度才展开摘要；点击跳转
- Files: `ChatConversationNav.tsx`、`chatRoundUtils.ts`、`ChatPage.tsx`、`styles.css`
- Archive: **`docs/archive/chat-round-nav-2026-07-16.md`**
- 备注：与 Agent 无关；可能已与 07-20 Chat 改动同在未提交工作区
- Next step: 整理 commit 时一并纳入或单独提交
- Safe to hand off: **Yes**

<!-- 更早：VIP 异步/UA 热修见 docs/archive/haodeya-gpt-image-vip-async-2026-07.md；访客部署见 docs/archive/deploy-2026-07-16-guest-workers-hotfix.md -->
