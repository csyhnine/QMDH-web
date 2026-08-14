# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-15] wan2.7 文生图 size 丢失比例 — **WIP，未部署**

- **问题：** 文生图手动选 **16:9 + 1K** 时，wan 仍出 **1024×1024**；同批 count/seedream/gemini 正常
- **根因：** `d547a12` 误删 `_wan_pixel_size_for_aspect`；生产只向上游发 `size:"1K"`，丢弃 `aspect_ratio`
- **已核实：** 生产 tasks **3939–3943**（08/15 00:13）均为 `image-generate` + `aspect_ratio=16:9`，非「遵循原图」
- **本地：** `task_executor.py` 已恢复 WxH 逻辑（**所有具体比例**，非仅 16:9）；**未 commit**
- **同工作区另有：**「智能→匹配比例」UI 改名（未 commit，与 wan bug 无关，建议拆分 commit）
- **Git HEAD（已 push）：** `f98fae1`（follow-source 按模型一行提示）
- **详档：** `docs/archive/handoff-2026-08-15-wan-t2i-size-wip.md`（含 SQL、复查清单、验收步骤）
- **下一对话：** 先复查生产 + 本地测试 → 再 commit / 热补 `task_executor.py` → 文生图 wan 16:9 验收
- Safe to hand off: **No**（生产 bug 仍在）

### [2026-08-14] Haodeya 图生图 size 推断 + 遵循原图/智能区分 — **已上生产**

- Git tip / 生产：**`dd84fe4`**（后端热补）；frontend hint **`f98fae1`**
- count 图生图「遵循原图」推断像素；Gemini/VIP 原生 omit；「智能/匹配比例」不锁参考图
- Safe to hand off: **Yes**

### [2026-08-14] count 参考图热补 + 看板 video/chat — **已上生产**

- Git tip / 生产：**`fc75825`**
- count 发 `image_urls`；看板 video/chat 统计（`d8d5102` 等待部署项见 archive）
- 归档：`docs/archive/deploy-2026-08-14-count-reference-hotpatch.md`
- Safe to hand off: **Yes**
