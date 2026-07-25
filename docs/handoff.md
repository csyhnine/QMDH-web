# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-25] 用量日志单行 + 能力/参数展示 — **已上生产**
- Git：**`8809239`**（本地 = `origin/main` = 生产 `/www/wwwroot/qmdh-web`）
- Alembic：**`o6p7q8r9s0t1` (head)**（本轮无新迁移）
- 变更：
  - `abf2e19`：默认「按任务汇总」只显示 `task.finalized` + 对话，避免与 `provider_call` 双行
  - `8809239`：汇总行补齐能力/模型；输入摘要（比例·分辨率·参考图等）；输出摘要（`N 张` / `N 段`）；历史空行列表时从 Task/ProviderCall 回填
- 关键文件：`backend/app/services/usage_ledger.py`、`backend/app/routers/dashboard.py`、`frontend/src/pages/admin/UsageLogsPage.tsx`、`backend/tests/test_usage_logs.py`
- 部署：frontend + backend + worker 已重建；健康检查 OK
- 归档：`docs/archive/deploy-2026-07-25-usage-logs-summary.md`
- 本地残留（勿提交）：`assets/`、`docs/archive/handoff-2026-07-21-canvas-copy-run-wip.md`
- Safe to hand off: **Yes**

### [2026-07-24] Studio ↔ Canvas 联动 + 图生图「遵循原图」— **已上生产**
- Git 含：`f057dff`（`studioCanvasLinkage.ts`）、`aff7bda`（编辑模式默认遵循原图 / 上游省略 `aspect_ratio`）
- 约定：改比例选项/默认值/workflow 映射只改 `frontend/src/features/studio/studioCanvasLinkage.ts`
- 画布 `img2img` ↔ 生成页「图像编辑」；`upscale` / `upload` / `annotate` 为画布侧专用
- Safe to hand off: **Yes**

### [2026-07-24] 对比预览 / 画布复制运行 / Chat 助手 UI — **已上生产**
- 相关提交：`377bd7e`、`3e83811`、`eff67a3`；Agent harness 已合 main（`7ae061d`）
- Chat「设计助手」UI：默认开启（`VITE_CHAT_AGENT_UI_ENABLED !== "false"`）
- 画布：节点复制粘贴、全部/所选运行；对比滑杆可贴边（0–100%）
- 旧「stash 中」交接已过时：复制运行已进 main，勿再当 WIP stash
- Safe to hand off: **Yes**

<!-- 更早条目见 docs/archive/handoff-2026-07-21-stale-entries.md；deploy-2026-07-20 -->
