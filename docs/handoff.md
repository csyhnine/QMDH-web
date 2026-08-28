# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-28] 提示词润色 + 生成行为分析 + 画布修复 — **Deploy-ready WIP（本地未提交）**

- **功能：** Studio 底部「润色」；Admin 润色开关；`generation_intents/sessions` + Outcome 埋点 + Admin「生成分析」看板；画布复制/连线 UX 修复
- **Git：** 已提交 HEAD **`c4f3812`**；**本批全部未 commit**
- **迁移：** `t1u2v3w4x5y6`（润色 platform_settings）→ `u2v3w4x5y6z7`（intents/sessions）；head = **`u2v3w4x5y6z7`**
- **详档：** `docs/archive/handoff-2026-08-28-prompt-polish-generation-analytics-deploy-ready.md`
- **下一对话任务：** commit → push → deploy → `alembic upgrade head` → Admin 开润色 + 配 chat 模型 → 验收
- **上线后必做：** 生产须有 `chat.completions` Provider；生成分析可选 backfill-intents
- Safe to hand off: **Yes（Deploy-ready，待 commit）**

### [2026-08-25] 计费审计 + Chat 助手 UI 隐藏 — **WIP（本地未提交）**

- **GPT 计费：** 用户 Admin 已将 `gpt-image-2` 改为 `per_image`；生产审计无第二个同类 enabled 生图 bug
- **Chat 助手：** 本地默认隐藏「设计助手」开关（`VITE_CHAT_AGENT_UI_ENABLED` 默认 `false`）；**未 commit / 未 push / 未部署**
- **Git：** **`9817ab5`** 在 `c4f3812` 之前；另有 WIP：`featureFlags.ts`、`docker-compose.yml`、`frontend/Dockerfile`
- **详档：** `docs/archive/handoff-2026-08-25-billing-chat-agent-ui.md`
- Safe to hand off: **Yes（标明 WIP）**

### [2026-08-18] Studio 创作区 UX + 历史复制 — **DONE**

- **功能：** 历史卡片「复制到创作区」；文生图/图生图命名与提交按钮分化
- **Git：** **`fcc7a0b`** + **`f10188e`**
- **生产：** frontend rebuild 2026-08-18
- Safe to hand off: **Yes**

（更早条目见 `docs/archive/`；灵感库搁置见 `docs/tasks.md` → `inspiration-001`）
