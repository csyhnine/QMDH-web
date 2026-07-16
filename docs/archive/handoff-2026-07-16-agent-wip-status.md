# Agent / Chat Agent 现状交接（2026-07-16）

Last updated: **2026-07-16**  
状态：**WIP 在独立分支；未合入 `main`；未部署生产**  
生产 Chat：仍为 **纯 LLM 对话**（无 `agent_mode` / 无院内 tools）

> **冷启动**：本文 → `docs/archive/handoff-2026-07-03-agent-multi-chat-wip.md`（架构/文件表）→ `docs/handoff.md`

---

## 1. 一句话

Agent 能力（B1 / gov / B2 / multi-agent / crawl / ref-intent）已在分支 **`wip/agent-multi-chat-2026-07`** 做成一大包并推到远端；commit **`4b0a5b3`** 标明 **not for production deploy**。当前 **`main` / 生产 `186b127` 不含这些代码**。

---

## 2. 分支与基线

| 项 | 值 |
| --- | --- |
| 分支 | `wip/agent-multi-chat-2026-07`（本地 + `origin`） |
| Tip | **`4b0a5b3`**（2026-07-03） |
| 与 `main` 分叉点 | **`2bbe299`**（计费分档之后） |
| 当前 `main` / 生产 | **`186b127`**（访客、密码 4 位、worker×3、VIP 代码、Gemini 异步热修等） |
| 合入成本 | `main` 已超前多笔；**rebase / merge 预期有冲突**（尤其 `chat.py`、`api.ts`、`schemas.py`、文档） |

检出：

```bash
git fetch origin
git checkout wip/agent-multi-chat-2026-07
# 或仅查看：git show 4b0a5b3:docs/archive/handoff-2026-07-03-agent-multi-chat-wip.md
```

---

## 3. 能力完成度（均在 WIP 分支，未上生产）

| Task ID | 状态 | 要点 |
| --- | --- | --- |
| `chat-004` B1 | DONE（WIP） | `agent_mode` + 院内只读 tools + SSE thinking/tool_calls |
| `agent-gov-001` | gov-001a/b/c MVP DONE（WIP） | release + override + Admin 可观测 |
| `chat-b2-001` | DONE（WIP） | Chat → task + HITL 确认卡片 |
| `agent-multi-001/002/003` | DONE（WIP） | LangGraph trio、harness、HITL/checkpoint、Meili 记忆 |
| `crawl-001` | C1+C2 DONE；C3 TODO | fetch/import reference page |
| `ref-intent-001` | MVP DONE（WIP） | 文本/路径混合检索 |
| `chat-003` | PARTIAL | Markdown / smoke / 模型 fallback |

产品曾约定上线顺序：**gov → B2 → multi-agent → ref-intent**；实际已并行超前。部署时需 **migration**；Meilisearch **可选**（不可达时 warning 降级，不阻断启动）。

---

## 4. 为何说「拆 PR」（不是又堆成一个 App.tsx）

- **主因是范围**：约 **92 文件 / +1.2 万行** 打成一包，review、rebase、上线风险都太大。
- **不是**整坨堆回单一巨型前端文件；服务层已拆（harness / policy / persona / multi_agent / task 等）。
- **局部偏肥**（WIP tip 相对当时 main 大致行数）：
  - `backend/app/routers/agent.py` ≈ 805 → **1180**
  - `backend/app/routers/chat.py` ≈ 382 → **700**
  - `studio_agent/agent.py` ≈ 98 → **551**（最像单文件堆逻辑）
  - `ChatPage.tsx` ≈ 555 → **712**（前端已拆 thinking/tool/proposal 组件，尚可）
- 若合入前再瘦身：优先 `agent.py`（router）与 `studio_agent/agent.py`。

**建议能力切片合入（可调，但勿一次全上）：**

1. B1 只读 `agent_mode` + tools  
2. gov 策略 + Admin  
3. B2 HITL 生图确认  
4. multi-agent / crawl / ref-intent（可再拆）

---

## 5. 接手时还容易漏的点

1. **`main` 上原先没有** 本留档；2026-07-16 已把 `handoff-2026-07-03-…` 拷回 `main` 的 `docs/archive/`，并以本文为现状索引。
2. **生产 `/studio/chat` 无 Agent**；continuity / smoke 文案若写 `agent_mode`，指的是 **WIP 分支能力**，不是当前生产。
3. **勿与 VIP / 访客 / 生图热修混成一个 PR**（图像路由事故已证明交叉改 `provider_strategy` / `task_executor` 成本高）。
4. WIP 分支上的生产基线叙述仍写 v1.1.0 @ `0090a2a`，**已过时**；以本文 + `docs/continuity.md` 为准。
5. 合入前先 **rebase 到最新 `main`**，再按切片拆 PR；整包 merge 不推荐。

---

## 6. 与 Agent 无关、但同属「未闭合」清单（避免只盯 Agent）

见 `docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`：

- VIP：代码在镜像，**Admin 未建** `gpt-image-2-vip`
- 访客 P2：限流 / `useStudioAuth` / E2E
- 参考图 OSS/CDN（视频上游拉 media 跨境不稳）
- 视频 `STALE_RUNNING` 15min vs Grok 超时 900s 贴边
- 服务器 root 密码曾用于自动化：建议轮换 + 密钥登录

---

## 7. 相关文档

- 详细架构/文件表：`docs/archive/handoff-2026-07-03-agent-multi-chat-wip.md`
- 产品边界：`docs/product-boundary.md`
- 生产部署当日：`docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`
- VIP：`docs/archive/haodeya-gpt-image-vip-async-2026-07.md`
