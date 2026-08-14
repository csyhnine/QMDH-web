# Handoff



## Usage Rules



- Keep only the latest 3 handoff entries here.

- Move older records into `docs/archive/` if they still matter.

- Write for a cold-start agent.

- Mark `WIP` explicitly if the repo is not in a safe handoff state.





---



## Latest Handoffs



### [2026-08-14] Haodeya 图生图 size 推断 + 遵循原图/智能区分 — **已上生产**

- Git tip / 生产：**`dd84fe4`**

- 后端热补 + frontend `--no-cache` rebuild；容器校验：`OK: count image_urls + follow-source size + smart/follow split + URL encode`

- `/api/v1/health` healthy

- Safe to hand off: **Yes**

### [2026-08-14] 运营看板视频/Chat 统计 + harness Slice B — **待部署**

- Git tip：**`d8d5102`**；上一提交 **`2f85bfb`**（harness Slice B）

- Alembic：**`r9s0t1u2v3w4`**（无新迁移）

- **运营看板**：

  - 后端：`_infer_task_capability` 优先读 ledger `capability`（修复视频误计为生图）；新增 `window_video_generate_count`

  - 前端：KPI「窗口视频任务」；每日趋势改为出图 + 视频 + Chat 分段柱；执行人/按模型文案对齐

  - 使用日志：视频输出默认「1 段」；Chat 输出显示 token

- **harness Slice B**（`2f85bfb`）：memory 工具不再强制追加；Skill 仅目录索引

- 生产仍为 **`e005414`**（Seedance/Grok）；本波次 frontend + backend 需 rebuild/热补后生效

- 验收：Admin 看板窗口内有视频任务与 Chat 轮次；每日趋势柱含紫（视频）/绿（Chat）段

- Safe to hand off: **Yes**（commit 后）



### [2026-08-14] count 参考图热补 + 看板 video/chat — **已上生产**
- Git tip / 生产：**`fc75825`**（热补 backend + 3×worker；未全量 rebuild 镜像）
- 根因：旧 `task_executor` 未发 `image_urls` → count 当纯 T2I；`0d6fa6e` 已热补进容器
- 容器校验：`OK: gpt-image-2-count sends image_urls when reference_images present`
- 归档：`docs/archive/deploy-2026-08-14-count-reference-hotpatch.md`
- 验收：图像编辑 + count + 参考图重跑 → `reference_image_mode=haodeya_sync_image_urls`
- Safe to hand off: **Yes**

### [2026-08-14] Seedance 入库 + Grok `asset://` — **已上生产**

- Git tip / 生产：**`e005414`**

- 归档：`docs/archive/handoff-2026-08-14-seedance-avatar-grok-asset.md`；部署：`docs/archive/deploy-2026-08-14-seedance-grok-asset.md`

- Safe to hand off: **Yes**



### [2026-07-30] 对比多原图 / 画布导航 / 上游参考 — **已上生产**

- 归档：`docs/archive/handoff-2026-07-30-compare-canvas-upstream.md`

- Safe to hand off: **Yes**

