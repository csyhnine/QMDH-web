# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-08-16] 生产全量 rebuild — **DONE**

- **HEAD：** **`59440b5`**（含 Dockerfile 阿里云 PyPI 镜像修复）
- **验收：** health healthy；容器内 `_build_haodeya_count_image_edits_plan` OK；uptime 重置
- **说明：** 首次 rebuild 因 PyPI 超时失败；`59440b5` 加 mirror 后二次成功
- Safe to hand off: **Yes**

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
