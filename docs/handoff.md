# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-17] 图生图「遵循原图」尺寸 — **DONE**

- **问题：** gpt-image-2 / count / Seedream / Wan / OpenAI edits 在「遵循原图」时仍默认 1:1 或与参考图不符的固定档
- **修复：** `b55e280` — 全链路从参考图推断比例或真实像素；前端 `studioFollowSourceHint.ts` 文案同步
- **生产：** HEAD **`b55e280`**；rebuild 完成；health healthy；**用户验收通过**
- **详档：** `docs/archive/handoff-2026-08-17-i2i-follow-source-size.md`
- **纪律：** 图链路 **新功能迭代仍暂停**（2026-08-16）；本项为 bugfix
- Safe to hand off: **Yes**

### [2026-08-16] 生产全量 rebuild — **DONE**

- **HEAD：** 初 **`59440b5`**（PyPI mirror）；follow-source 修复后生产已对齐 **`b55e280`**
- **验收：** health healthy；`deploy-production-rebuild.sh` 可复用
- **详档：** `docs/archive/deploy-ready-2026-08-16-production-rebuild.md`
- Safe to hand off: **Yes**

### [2026-08-16] 灵感库迭代搁置

- **用户确认：** 灵感库不再继续开发（内容 / seed bundle / 分享收口）
- **现状：** task-014 功能已交付；现有路由保留，仅 bugfix
- **关联：** 见 `docs/tasks.md` → `inspiration-001`
- Safe to hand off: **Yes**
