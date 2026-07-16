# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-07-16] Chat Agent / 多 Agent — **WIP 分支，未合 main、未上生产**
- Role: 说明 Agent 能力落在哪、为何要拆 PR、还有哪些未说清的坑
- Branch: **`wip/agent-multi-chat-2026-07`** @ **`4b0a5b3`**（commit 标明 *not for production deploy*）
- 与 `main`：分叉于 `2bbe299`；`main`/生产已到 **`186b127`**，整包 rebase 预期有冲突
- 生产：`/studio/chat` **仍是纯 LLM**；无 `agent_mode`、无院内 tools
- WIP 内已做完（均未上生产）：B1、gov MVP、B2 HITL、multi-agent、crawl C1/C2、ref-intent MVP
- 拆 PR：**主因是范围（~92 文件 / +1.2 万行）**，不是又堆回单个 App.tsx；局部偏肥：`routers/agent.py`、`studio_agent/agent.py`
- 建议切片：B1 → gov → B2 → multi/crawl/ref-intent
- Archive: **`docs/archive/handoff-2026-07-16-agent-wip-status.md`**（现状）+ `docs/archive/handoff-2026-07-03-agent-multi-chat-wip.md`（架构表）
- 同批未闭合（非 Agent）：VIP Provider 未建、访客 P2、OSS 图床、视频 stale vs 900s、root 密码轮换
- Safe to hand off: **Yes**（代码在分支；当前 checkout 仍是 `main`）

### [2026-07-16] 生产部署 — 访客模式 / Worker×3 / Gemini 路由热修 — **DONE**
- Role: 部署最新 main 到 `https://cityusbdisk.cn` 并记录上线范围
- Production Git: **`186b127`**（`60caa22` 功能包 + 异步误路由热修）
- Deployed:
  - Studio **访客模式** P0+P1（登录页入口；四 Tab 只读；optional auth）
  - 建号/重置密码最短 **4** 位
  - Compose **worker ×3**
  - 随包带上此前未部署的 main 增量（含 VIP **代码**；生产 **未配** `gpt-image-2-vip` Provider）
  - 运维：Grok 超时 900s；Nano Banana PRO `chat_completions_image`
  - 热修：Haodeya 异步默认仅匹配 VIP SKU，不再把全部 `newapi.haodeya.xyz` 当异步
- Archive: **`docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`**
- Next step: VIP Provider 接入验收；访客 P2；OSS 图床
- Safe to hand off: **Yes**

### [2026-07-03] Haodeya GPT-Image-2-VIP 异步生图 — **代码已在生产镜像，Provider 未接入**
- Role: Haodeya 网关 VIP 异步生图（`gpt-image-2-vip`）
- Branch: `main`（随 2026-07-16 部署进镜像）
- Production: **代码在**；Admin **尚无** `gpt-image-2-vip` 配置 → 对设计师未开通
- 2026-07-16 热修后：异步默认 **不会** 误伤 Gemini / 普通 gpt-image-2
- Archive: **`docs/archive/haodeya-gpt-image-vip-async-2026-07.md`**
- Next step: Admin 新建 VIP Provider + Studio 1K/2K 联调
- Safe to hand off: **Yes**

<!-- 访客模式已部署：docs/archive/guest-mode-studio-2026-07-13.md + deploy-2026-07-16-… -->
