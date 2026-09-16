# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-09-16] Chat 模型切换 + 上下文统计（阶段 1）— **DONE（已部署生产）**

- **功能：** 会话内 PATCH 切换模型；消息 `estimated_input_tokens`；conversation context 快照；`GET …/context-stats` breakdown
- **GitHub main：** `b6edfd2`（`5777b1e` + 迁移修复 `b6edfd2`）
- **生产 HEAD：** `28c0f2ba`（merge origin + 保留 Banana 热补丁 `759f35ef`/`d16cc3c4`）
- **Migration：** `a8b9c0d1e2f3`（已 `alembic upgrade head`）
- **Chat 运营态：** 助手 UI **关**；可用模型 **claude-opus-4-6** / **gemini-3.7-flash-high**；GPT Chat **已禁用**
- **详档：** `docs/archive/handoff-2026-09-16-chat-model-switch-context-stats.md`
- **deploy 要点：** 先 `docker compose build backend` 再 alembic；生产 git 用 **merge** 非 ff-only
- Safe to hand off: **Yes**

### [2026-09-04] 符号主题链 + 豆包检索 + Grok/润色 hotfix — **DONE（本地 main；生产未 deploy 符号主题）**

- **符号主题：** `b935b58` 链式 5 节点 + C2 豆包两阶段检索 + Region 参考图
- **生产：** 符号主题 **未部署**；Grok hotpatch 曾 docker cp
- **详档：** `docs/archive/handoff-2026-09-03-session-end-cold-start.md`、`docs/archive/handoff-2026-09-04-haodeya-doc-grok-ref-hotpatch.md`
- Safe to hand off: **Yes**（符号主题 WIP 勿误 deploy）

### [2026-09-04] Haodeya 文档核对 + Grok 多参考图 hotpatch — **DONE（生产 hotpatch）**

- **详档：** `docs/archive/handoff-2026-09-04-haodeya-doc-grok-ref-hotpatch.md`
- Safe to hand off: **Yes**

（更早条目见 `docs/archive/`；灵感库搁置见 `docs/tasks.md` → `inspiration-001`）
