# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-16] prod-002 生产环境变量模板补全 + count i2i push

- **Git：** `f7ddeb3` count multipart 已 push `origin/main`；`.env.production.example` 补全 `PUBLIC_MEDIA_BASE_URL`、OSS、Meili、Agent 等
- **prod-004：** `/health` DB/Redis 检查已实现（无需新开发）
- **暂停：** 文生图/图生图（count + wan）— 见 `handoff-2026-08-16-count-i2i-multipart.md`
- Safe to hand off: **Yes**

### [2026-08-16] count 图生图（gpt-image-2-count i2i）— **已验收**

- **问题链：** `image_urls` 无效 → URL/`.bin` 修复 → `/images/edits` JSON → `-2k` 无渠道 → multipart 500 → **multipart + 1K SKU 成功**
- **正确用法：** Studio **图像编辑**（非文生图）+ 参考图 + count；上游 `/images/edits` multipart 字段 `image`
- **生产：** 热补已落容器（2026-08-16 晚）；Git 已入库 multipart 补丁
- **详档：** `docs/archive/handoff-2026-08-16-count-i2i-multipart.md`
- **用户：** 2026-08-16 确认成功；**文生图/图生图先暂停**
- Safe to hand off: **Yes**

### [2026-08-15] wan2.7 文生图 size 丢失比例 — **已上生产**

- **修复 commit：** **`bd67d8d`** — 恢复 `_wan_pixel_size_for_aspect` + 扩展 `_wan_image_size`
- **生产 HEAD / 热补：** **`c672aff`**（backend 热补）；frontend **`ad7d80c`** `--no-cache` 重建
- **容器验收：** `wan_16_9_1k=1024x576`；bundle 含「匹配比例」
- **详档：** `docs/archive/handoff-2026-08-15-wan-t2i-size-wip.md`
- **待人工验收：** 文生图 + wan2.7 + 16:9/1K → result 非 1024×1024（低优先级，用户已暂停图链路）
- Safe to hand off: **Yes**
