# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-07-16] Chat 对话轮次导航 — **本地 DONE，未 commit**
- Role: `/studio/chat` 右侧多轮翻记录导航（千问式横刻度）
- Behavior: 单轮不显示；多轮默认只显示横刻度；悬停刻度才展开摘要；点击跳转
- Files: `ChatConversationNav.tsx`、`chatRoundUtils.ts`、`ChatPage.tsx`、`styles.css`
- Archive: **`docs/archive/chat-round-nav-2026-07-16.md`**
- 备注：与 Agent 无关；`agent_mode` 仍只在 WIP 分支（见下条）
- Next step: 需要时 commit + 部署；或继续 VIP Provider 接入
- Safe to hand off: **Yes**（代码在工作区未提交）

### [2026-07-16] Chat Agent / 多 Agent — **WIP 分支，未合 main、未上生产**
- Role: Agent 能力落点说明（为何 Chat 页看不到 agent mode）
- Branch: **`wip/agent-multi-chat-2026-07`** @ **`4b0a5b3`**
- 生产 / 当前 `main`：`/studio/chat` = **纯 LLM**，无 `agent_mode` 入口
- Archive: **`docs/archive/handoff-2026-07-16-agent-wip-status.md`**
- Next step: rebase 到 `main` 后按 B1→gov→B2 拆 PR（勿整包上）
- Safe to hand off: **Yes**

### [2026-07-16] VIP 异步出图 — **下载 UA 热修已部署 `f0497b3`**
- Role: `gpt-image-2-vip` 异步生图
- Production: **`f0497b3`**（backend/worker 已 rebuild；UA=`Go-http-client/1.1`）
- **事故**：创建/轮询成功、已扣费，但「下载生成结果失败」HTTP 403 / CF 1010  
  根因：裸 `urlopen` → Python-urllib 默认 UA 被 `files.toapis.com` 拦截  
  修复：下载带 `User-Agent: Go-http-client/1.1` — **已上生产**
- Archive: **`docs/archive/haodeya-gpt-image-vip-async-2026-07.md`** §3.2
- Next step: Studio 再测 VIP 1K/2K；已失败任务勿盲目重提（链接未过期可重下）
- Safe to hand off: **Yes**

<!-- 生产部署访客/worker：docs/archive/deploy-2026-07-16-guest-workers-hotfix.md -->
