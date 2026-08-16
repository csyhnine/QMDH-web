# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-16] 生产全量 rebuild — **deploy-ready**

- **目标：** `be-image-rebuild-001` — `./scripts/deploy-production-rebuild.sh` 固化 count multipart 等热补
- **Git：** 期望 HEAD **`1979343`**；详档 `docs/archive/deploy-ready-2026-08-16-production-rebuild.md`
- **阻塞：** 本工作站无 SSH；**需在服务器 / 宝塔终端执行**
- Safe to hand off: **Yes**（待服务器跑完验收）

### [2026-08-16] 灵感库迭代搁置

- **用户确认：** 灵感库不再继续开发（内容 / seed bundle / 分享收口）
- **现状：** task-014 功能已交付（12 条 seed + 灵感页 CRUD）；现有路由保留，仅 bugfix
- **关联：** 与图链路暂停并列；见 `docs/tasks.md` → `inspiration-001`
- Safe to hand off: **Yes**

### [2026-08-16] prod-003/008 运维收口 + rebuild 脚本

- **prod-003 DONE：** JSON 结构化日志已在生产路径（`QMDH_LOG_FORMAT=json`）
- **prod-008：** OSS 代码 + `sync_local_media_to_oss` 就绪；生产仍 local；runbook 写入 `server-operations.md`
- **be-image-rebuild-001：** 新增 `scripts/deploy-production-rebuild.sh`（全量 build 替代 docker cp）
- **Git：** `2dc1d15` 起；图链路仍暂停
- Safe to hand off: **Yes**

### [2026-08-16] count 图生图（gpt-image-2-count i2i）— **已验收**

- **问题链：** `image_urls` 无效 → URL/`.bin` 修复 → `/images/edits` JSON → `-2k` 无渠道 → multipart 500 → **multipart + 1K SKU 成功**
- **正确用法：** Studio **图像编辑**（非文生图）+ 参考图 + count；上游 `/images/edits` multipart 字段 `image`
- **生产：** 热补已落容器（2026-08-16 晚）；Git 已入库 multipart 补丁
- **详档：** `docs/archive/handoff-2026-08-16-count-i2i-multipart.md`
- **用户：** 2026-08-16 确认成功；**文生图/图生图先暂停**
- Safe to hand off: **Yes**
