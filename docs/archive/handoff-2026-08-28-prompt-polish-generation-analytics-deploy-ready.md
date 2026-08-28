# Handoff Archive — 2026-08-28 提示词润色 + 生成行为分析 + 画布修复（待上线）

冷启动详档。摘要见 `docs/handoff.md` → `[2026-08-28]`。

**给下一对话的首要任务：commit → push → 部署 → 跑迁移 → Admin 配置 → 验收。**

---

## 会话摘要

本对话完成本地开发、未 commit。用户已验收 Studio「润色」按钮 UX（底部工具栏、与 chip 同高；提示词框恢复满高布局），要求留档后由新对话执行上线。

### 功能块（5）

1. **提示词润色（Studio）**
   - 生成区底部「润色」按钮（「开始生成」左侧）
   - Admin：设置中心 → 功能开关 → 提示词润色（须选 `chat.completions` 模型）
   - API：`POST /api/studio/prompt-polish`
   - 审计：`studio.prompt_polish`

2. **生成行为分析（埋点 + Admin 看板）**
   - 表：`generation_intents`（每次提交）、`generation_sessions`（30 分钟窗口聚合）
   - 指标：Gacha / Explore / Settle；模板 `quality_score` 排行
   - Outcome：`reused_as_reference` / `upscaled` / `bookmarked` / `shared_to_inspiration` / `applied_to_composer` / `regenerated`
   - Admin 页：`/admin/generation-analytics`（侧栏「生成分析」）
   - 运维 API：`backfill-intents`、`recompute-sessions`

3. **Studio 提交归因**
   - 任务创建带 `template_id`、`source_surface`、`canvas_node_id`
   - 应用共享模板时绑定 `activeTemplateId`

4. **画布 UX**
   - 复制节点：只复制选中节点（含编组子节点），不递归上游；粘贴可连回仍在画布的上游
   - 连线删除：中点 ×、220ms 悬停、Delete/Backspace、右键断开

5. **Admin 润色配置校验**
   - 启用时未选模型会阻止保存并提示

---

## Git 状态（留档时）

| 项 | 值 |
|----|-----|
| 分支 | `main` |
| 已提交 HEAD | **`c4f3812`** — Grok 图像适配、Chat 助手 Admin 开关、画布边缘 UX |
| **本批 WIP** | **全部未 commit**（见下方文件清单） |
| 生产 URL | `https://cityusbdisk.cn`（应与 `origin/main` 同步在 `c4f3812` 或更新） |
| 纪律 | **未经用户明确同意禁止 push / 部署** |

### 应纳入 commit 的文件

**后端新增**

- `backend/app/routers/prompt_polish.py`
- `backend/app/routers/generation_analytics.py`
- `backend/app/services/prompt_polish_service.py`
- `backend/app/services/generation_fingerprints.py`
- `backend/app/services/generation_intent_service.py`
- `backend/app/services/generation_session_service.py`
- `backend/app/services/generation_outcome_service.py`
- `backend/app/services/generation_analytics_dashboard_service.py`
- `backend/migrations/versions/t1u2v3w4x5y6_add_prompt_polish_platform_settings.py`
- `backend/migrations/versions/u2v3w4x5y6z7_add_generation_intents_and_sessions.py`
- `backend/tests/test_prompt_polish.py`
- `backend/tests/test_generation_analytics.py`

**后端修改**

- `backend/app/main.py`（注册 `prompt_polish`、`generation_analytics` router）
- `backend/app/models.py`（GenerationIntent/Session、platform_settings 润色字段）
- `backend/app/schemas.py`（TaskCreate 扩展、GenerationOutcomeIn/Out）
- `backend/app/core/audit.py`
- `backend/app/routers/platform_settings.py`
- `backend/app/routers/tasks.py`（intent 写入、outcome API）
- `backend/app/services/task_executor.py`
- `backend/tests/test_platform_settings.py`

**前端新增**

- `frontend/src/features/studio/useStudioPromptPolish.ts`
- `frontend/src/lib/usePromptPolishEnabled.ts`
- `frontend/src/features/studio/trackGenerationOutcome.ts`
- `frontend/src/pages/admin/PromptPolishSettingsPanel.tsx`
- `frontend/src/pages/admin/GenerationAnalyticsPage.tsx`

**前端修改（核心）**

- Studio 润色：`StudioComposerExpandedContent.tsx`、`StudioComposerSubmitActions.tsx`、`StudioPromptTextarea.tsx` 等
- Outcome 埋点：`useStudioTaskActions.ts`、`useStudioGalleryActions.ts`
- 提交归因：`studioTaskSubmissionActions.ts`、`studioTypes.ts`、`useStudioTemplates.ts`
- Canvas：`canvasGraphUtils.ts`、`CanvasEdge.tsx`、`CanvasBoard.tsx`
- `frontend/src/api.ts`、`router.tsx`、`AppShell.tsx`、`roleAccess.ts`、`SettingsPage.tsx`、`styles.css`

### 勿提交

- `projects/`、`assets/`、`backend/references/`、`backend/app.db`
- `frontend/dist/`、`__pycache__/`

---

## 数据库迁移

**Alembic head（本批后）：`u2v3w4x5y6z7`**

链：`s0t1u2v3w4x5`（platform_settings）→ `t1u2v3w4x5y6`（润色字段）→ `u2v3w4x5y6z7`（intents/sessions）

```bash
cd backend
alembic upgrade head
```

**注意**

- `t1` 迁移已改为 `batch_alter_table`，兼容 SQLite 本地；PostgreSQL 生产一般无问题
- 生产若已在 `c4f3812` 且跑过 `s0`，只需 `t1` + `u2`

---

## 部署步骤（下一对话执行）

1. `git status` / `git diff` 确认文件范围
2. `commit`（可单 commit 或按模块拆 2～3 个）
3. 用户批准后 `push` + 部署 backend + frontend build
4. 生产 `alembic upgrade head`
5. **Admin 必配**
   - 设置中心 → 功能开关 → **提示词润色**：启用 + 选择 **chat.completions** 模型 + 保存
   - （生产若无 chat Provider，须先在模型管理接入）
6. **可选**：生成分析补历史
   - `POST /api/admin/generation-analytics/backfill-intents` `{ "limit": 1000 }`
   - `POST /api/admin/generation-analytics/recompute-sessions`

---

## 验收清单

| 项 | 预期 |
|----|------|
| Studio 底部 | 「润色」在 chip 行右侧、「开始生成」左侧，高度与 chip 一致 |
| `/api/settings/platform` | `prompt_polish_enabled: true`（Admin 保存后） |
| 润色点击 | 提示词被 LLM 改写（需 chat 模型通） |
| 生成 + 收藏/置入参考 | `generation_intents.outcome_signals` 有记录 |
| Admin → 生成分析 | KPI / 模板排行 / 会话列表有数据（新数据或 backfill 后） |
| 画布复制 | 只复制选中节点，不带上游链 |
| 画布连线 | 悬停 × / Delete 可删 |

---

## 测试（留档时已通过）

```bash
cd backend
python -m pytest tests/test_generation_analytics.py tests/test_prompt_polish.py tests/test_platform_settings.py -q
# 16 passed

cd frontend
npm run build
# OK
```

建议上线前再跑全量 `backend/tests/`。

---

## 本地开发踩坑（已解决，供参考）

1. **润色按钮不显示**：本地 DB 缺 `prompt_polish_*` 列 → 跑 `t1` 迁移；Admin 须 **保存配置**（非只勾 checkbox）
2. **润色模型下拉为空**：本地仅有生图 Provider，须先加 `chat.completions`
3. **提示词框变矮**：曾改 `grid-template-rows` 为三行；已改回 `minmax(0, 1fr) auto`
4. **Alembic 脏版本**：本地曾出现 `j0k1l2m3n4o5` 幽灵 revision；生产勿 stamp 乱写，以仓库 migrations 为准

---

## 关键 API 索引

| 方法 | 路径 |
|------|------|
| POST | `/api/studio/prompt-polish` |
| GET/PATCH | `/api/settings/platform` |
| POST | `/api/tasks/{task_id}/generation-outcomes` |
| GET | `/api/admin/generation-analytics/overview` |
| GET | `/api/admin/generation-analytics/sessions` |
| GET | `/api/admin/generation-analytics/template-quality` |
| POST | `/api/admin/generation-analytics/backfill-intents` |
| POST | `/api/admin/generation-analytics/recompute-sessions` |

---

## 建议 commit message（单 commit 示例）

```
feat: prompt polish, generation analytics, canvas copy/edge UX

- Studio prompt polish with Admin toggle and bottom-toolbar button
- Generation intents/sessions, outcome tracking, admin analytics dashboard
- Fix canvas node copy to avoid upstream chain duplication; edge delete UX
```

---

## 用户明确意图（2026-08-28）

- **本批一并上线**（润色 + 生成分析 + 画布修复 + 相关埋点）
- **当前对话留档**，**新对话负责 commit / push / 部署**
- 回复语言：简体中文

Safe to hand off: **Yes（Deploy-ready WIP，待 commit）**
