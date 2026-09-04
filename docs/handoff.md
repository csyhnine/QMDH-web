# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-09-04] 符号主题链 + 豆包检索 + Grok/润色 hotfix — **DONE（本地 main；生产未 deploy）**

- **符号主题：** `b935b58` 链式 5 节点 + C2 豆包两阶段检索 + Region 参考图；已 merge **`main`** @ **`6370594`**（含润色 hotfix merge）
- **Grok hotfix：** inline data URL（任务 5858 生产已验收）；**本 commit 待合入 main**（当前在 `hotfix/grok-ref-download-001`）
- **润色 hotfix：** 已 merge **`main`**；生产 backend 已 hotpatch（2026-09-03）
- **生产：** **符号主题未部署**；Grok hotpatch 已 docker cp；服务器 git **未 pull**
- **Migration head（本地）：** `y6z7a8b9c0d1`
- **详档：** `docs/archive/handoff-2026-09-03-session-end-cold-start.md`、`docs/archive/handoff-2026-09-04-haodeya-doc-grok-ref-hotpatch.md`
- **待办：** push `main` → 用户批准 deploy → `alembic upgrade head` + 配豆包 Key + symbol-theme-008 生产 smoke
- **纪律：** 未经同意禁止 deploy；**勿动**生产 `prompt_polish_*` hotpatch 文件
- Safe to hand off: **Yes**

### [2026-09-04] Haodeya 文档核对 + Grok 多参考图 hotpatch — **DONE（生产 hotpatch）**

- **Haodeya 文档 v2：** 协议/body 与代码一致；VIP 不接 4K
- **Grok：** 5846 失败 → inline data URL；5858 生产验收成功
- **详档：** `docs/archive/handoff-2026-09-04-haodeya-doc-grok-ref-hotpatch.md`
- Safe to hand off: **Yes**

### [2026-09-03] Studio 润色 500 热修 — **DONE（backend 已热更生产；已 merge main）**

- **修复：** 跳过不可读参考图 + 503 兜底
- **Git：** 已 merge **`main`** @ `6370594`
- **详档：** `docs/archive/handoff-2026-09-03-prompt-polish-500-hotfix.md`
- Safe to hand off: **Yes**

（更早条目见 `docs/archive/`；灵感库搁置见 `docs/tasks.md` → `inspiration-001`）
