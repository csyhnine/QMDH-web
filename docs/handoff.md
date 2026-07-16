# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

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

### [2026-07-13] Studio 访客模式 — **已部署（P0+P1）**
- Role: 登录页「访客模式」→ Studio 四 Tab 能看不能用
- Production: **已上线** @ `60caa22` / `186b127`
- 产品：入口登录页；生成/灵感/反馈/对话只读；不含 Admin
- Archive: **`docs/archive/guest-mode-studio-2026-07-13.md`**
- 留档部署：`docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`
- Next step: P2 限流 / 清理 `useStudioAuth` / E2E
- Safe to hand off: **Yes**

<!-- 更旧条目见 docs/archive/；v1.1.0 与 VIP WIP 原文见 archive handoff 文件 -->
