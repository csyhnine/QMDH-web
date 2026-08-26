# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-25] 计费审计 + Chat 助手 UI 隐藏 — **WIP（本地未提交）**

- **GPT 计费：** 用户 Admin 已将 `gpt-image-2` 改为 `per_image`；生产审计无第二个同类 enabled 生图 bug
- **Chat 助手：** 本地默认隐藏「设计助手」开关（`VITE_CHAT_AGENT_UI_ENABLED` 默认 `false`）；**未 commit / 未 push / 未部署**
- **Git：** 本地 **`9817ab5`**（ahead 1，未 push）；WIP 文件：`featureFlags.ts`、`docker-compose.yml`、`frontend/Dockerfile`
- **详档：** `docs/archive/handoff-2026-08-25-billing-chat-agent-ui.md`
- **纪律：** 图链路 / 灵感库 / 画布 poll·复制逻辑 **仍搁置**；助手 UI 等产品修完再开
- Safe to hand off: **Yes（标明 WIP）**

### [2026-08-18] Studio 创作区 UX + 历史复制 — **DONE**

- **功能：** 历史卡片「复制到创作区」（参考图 + 提示词，不自动提交）；文生图/图生图命名与提交按钮分化；参考图区布局修复
- **Git：** **`fcc7a0b`**（功能）+ **`f10188e`**（handoff）
- **生产：** HEAD **`f10188e`**；frontend rebuild 2026-08-18；health **healthy**；`/studio/generate` **200**
- Safe to hand off: **Yes**

### [2026-08-17] 图生图「遵循原图」尺寸 — **DONE**

- **问题：** gpt-image-2 / count / Seedream / Wan / OpenAI edits 在「遵循原图」时仍默认 1:1 或与参考图不符的固定档
- **修复：** `b55e280` — 全链路从参考图推断比例或真实像素；前端 `studioFollowSourceHint.ts` 文案同步
- **生产：** HEAD **`b55e280`**；rebuild 完成；health healthy；**用户验收通过**
- **详档：** `docs/archive/handoff-2026-08-17-i2i-follow-source-size.md`
- **纪律：** 图链路 **新功能迭代仍暂停**（2026-08-16）；本项为 bugfix
- Safe to hand off: **Yes**

（更早条目见 `docs/archive/deploy-ready-2026-08-16-production-rebuild.md`；灵感库搁置见 `docs/tasks.md` → `inspiration-001`）
