# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-15] wan2.7 文生图 size 丢失比例 — **已 commit，待热补**

- **问题：** 文生图手动选 **16:9 + 1K** 时，wan 仍出 **1024×1024**；同批 count/seedream/gemini 正常
- **根因：** `d547a12` 误删 `_wan_pixel_size_for_aspect`；生产只向上游发 `size:"1K"`，丢弃 `aspect_ratio`
- **已核实：** 生产 tasks **3939–3943**（08/15 00:13）均为 `image-generate` + `aspect_ratio=16:9`，非「遵循原图」
- **修复 commit：** **`bd67d8d`** — 恢复 `_wan_pixel_size_for_aspect` + 扩展 `_wan_image_size`（所有具体比例）
- **测试：** `test_task_executor_wan_image_size.py` 等 32 passed（本地 2026-08-15）
- **Git HEAD（已 push）：** `c9935a0`（含 UI「匹配比例」改名 `a529368`，与 wan fix 无关）
- **详档：** `docs/archive/handoff-2026-08-15-wan-t2i-size-wip.md`
- **下一对话：** 生产 `./scripts/deploy-production-hotpatch.sh` → 文生图 wan 16:9 验收（result 非 1024×1024）
- Safe to hand off: **No**（生产 bug 仍在，待热补）

### [2026-08-14] Haodeya 图生图 size 推断 + 遵循原图/智能区分 — **已上生产**

- Git tip / 生产：**`dd84fe4`**（后端热补）；frontend hint **`f98fae1`**
- count 图生图「遵循原图」推断像素；Gemini/VIP 原生 omit；「智能/匹配比例」不锁参考图
- Safe to hand off: **Yes**

### [2026-08-14] count 参考图热补 + 看板 video/chat — **已上生产**

- Git tip / 生产：**`fc75825`**
- count 发 `image_urls`；看板 video/chat 统计（`d8d5102` 等待部署项见 archive）
- 归档：`docs/archive/deploy-2026-08-14-count-reference-hotpatch.md`
- Safe to hand off: **Yes**
