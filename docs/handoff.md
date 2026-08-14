# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-15] count 图生图参考图 URL — **已上生产（第二版）**

- **问题：** count + 参考图仍出无关图；`image_urls` 已发但 `image_tokens=0`（tasks 3955/3956）
- **根因 1（已修 `2d798e9`）：** OSS URL 双重编码 → 404
- **根因 2（已修 `90d1f12`）：** 上游 URL 用 OSS 直链 + `.bin`/`application/octet-stream`；Haodeya 忽略
- **修复：** 上游改 `cityusbdisk.cn/media/...png`；`.bin` PNG 自动镜像为 `.png` 别名
- **容器验收：** ref URL → `image/png`，magic `89504e47`
- **待验收：** 同哥特参考图 + count 重跑 → `image_tokens>0`、出图贴近原图
- Safe to hand off: **Yes**（请用户重试）

### [2026-08-15] wan2.7 文生图 size 丢失比例 — **已上生产**

- **修复 commit：** **`bd67d8d`** — 恢复 `_wan_pixel_size_for_aspect` + 扩展 `_wan_image_size`
- **生产 HEAD / 热补：** **`c672aff`**（backend 热补）；frontend **`ad7d80c`** `--no-cache` 重建（2026-08-15）
- **容器验收：** `wan_16_9_1k=1024x576`；bundle 含「匹配比例」
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
