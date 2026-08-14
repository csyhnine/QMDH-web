# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-15] wan2.7 文生图 size 丢失比例 — **已上生产**

- **修复 commit：** **`bd67d8d`** — 恢复 `_wan_pixel_size_for_aspect` + 扩展 `_wan_image_size`
- **生产 HEAD / 热补：** **`c672aff`**（2026-08-15 热补 backend + 3×worker）
- **容器验收：** `wan_16_9_1k=1024x576`；health OK
- **详档：** `docs/archive/handoff-2026-08-15-wan-t2i-size-wip.md`
- **待人工验收：** 文生图 + wan2.7 + 16:9/1K → result 非 1024×1024
- Safe to hand off: **Yes**（热补已落；建议跑一单 wan 文生图确认出图）

### [2026-08-14] Haodeya 图生图 size 推断 + 遵循原图/智能区分 — **已上生产**

- Git tip / 生产：**`dd84fe4`**（后端热补）；frontend hint **`f98fae1`**
- count 图生图「遵循原图」推断像素；Gemini/VIP 原生 omit；「智能/匹配比例」不锁参考图
- Safe to hand off: **Yes**

### [2026-08-14] count 参考图热补 + 看板 video/chat — **已上生产**

- Git tip / 生产：**`fc75825`**
- count 发 `image_urls`；看板 video/chat 统计（`d8d5102` 等待部署项见 archive）
- 归档：`docs/archive/deploy-2026-08-14-count-reference-hotpatch.md`
- Safe to hand off: **Yes**
