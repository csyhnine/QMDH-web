# 本地工作区交接：画布模板 + Chat 上下文 + 真流式（2026-07-20）

Last updated: **2026-07-20**  
分支：`main`（与 `origin/main` 同步于 **`4a3e5ad`** 一带；工作区 **大量未 commit**）  
状态：**本地已实现并验证流式可用；未 commit / 未 push / 未部署**  
约束：未经用户明确同意，**禁止** `git push` / 生产部署

> **冷启动下一对话**：先读本文 → `docs/handoff.md` → `docs/continuity.md` →  
> Agent 合入另见 `docs/archive/handoff-2026-07-16-agent-wip-status.md`

---

## 1. 一句话

本轮在 `main` 工作区完成三块本地能力，并修好 Chat「假流式 / 一次出全文」：

1. **画布模板库**（与用户 `CanvasProject` 分离）
2. **Chat 上下文窗口 + 摘要落库**（选型 B + 落库）
3. **Chat SSE 真流式可见**（Transport 合批 + UI 状态进 AI 气泡；用户已确认「成功了」）

**下一件产品大事**：Agent WIP 合入（rebase + 按 B1→gov→B2 拆 PR），**不要整包 merge**。

---

## 2. 未提交范围（接手必看）

`git status` 约 **42 个已改文件 + 一批 untracked**。请勿假定已入库。

### 2.1 画布 / 模板（新功能）

| 区域 | 路径 |
| --- | --- |
| 模型 | `backend/app/models.py`（`CanvasTemplate` 等） |
| 迁移 | `backend/migrations/versions/h9i0j1k2l3m4_add_canvas_templates.py` |
| API | `backend/app/routers/canvas_projects.py`、`canvas_templates.py`；`main.py` 已挂载 |
| 测试 | `backend/tests/test_canvas_projects.py`、`test_canvas_templates.py` |
| 前端画布 | `frontend/src/features/canvas/**`、`pages/studio/CanvasPage.tsx` |
| 后台模板 | `frontend/src/pages/admin/CanvasTemplatesPage.tsx` |
| 路由/权限 | `frontend/src/router.tsx`、`features/access/roleAccess.ts`、`AppShell`、Studio rail |
| 依赖 | `@xyflow/react`（`frontend/package.json`） |
| Studio 联动 | 若干 `features/studio/*`（历史流 → 画布 / 参考图相关 props） |

要点：

- 用户项目与模板分离；使用模板 → 复制为私有项目
- 管理员可「发布为模板」、在画布编辑模板（`/admin/canvas-templates/:id/edit` 复用 `CanvasWorkspace`）
- 本地 SQLite：`bootstrap.ensure_schema` 会补列（`create_all` 不改已有表）

### 2.2 Chat 上下文压缩（新功能）

| 区域 | 路径 |
| --- | --- |
| 模型字段 | `Conversation.context_summary` / `context_summary_until_message_id` / `context_summary_updated_at` |
| 迁移 | `backend/migrations/versions/i0j1k2l3m4n5_add_conversation_context_summary.py` |
| 服务 | `backend/app/services/chat_context.py` |
| 接入 | `backend/app/routers/chat.py`（`pack_chat_context`；SSE 先 `preparing`/`compressing`/`generating`） |
| 配置 | `backend/app/core/config.py`（`chat_*` token 窗口相关） |
| Schema 自愈 | `backend/app/services/bootstrap.py` |
| 测试 | `backend/tests/test_chat_context.py` |
| UI | `ChatPage.tsx` 顶栏上下文用量 %、「早期对话已压缩」；`api.ts` 出参 |

选型：**窗口管理 + LLM 摘要落库**（失败则降级裁剪）。

未做愿景：Chat 摘要 promote 到用户级记忆（与 Agent harness/memory 对齐）→ 等 Agent 合入后再谈。

### 2.3 Chat 真流式修复（本轮收尾，用户已确认成功）

| 区域 | 路径 |
| --- | --- |
| Transport | `frontend/src/lib/chat/qmdhChatTransport.ts`（`start()` 泵 + ~40ms delta 合批） |
| SSE 解析 | `frontend/src/lib/chat/qmdhSseParser.ts`（status / label / context） |
| UI | `ChatPage.tsx`：「正在回复」进 **左侧 AI 气泡**；去掉消息区右侧 flex 浮动状态；`experimental_throttle: 50`；结束软同步消息 id |
| 轮次导航防抖 | `ChatConversationNav.tsx`（`roundsSignature`，修 React #185） |
| Vite 代理 | `frontend/vite.config.ts`（SSE 不缓冲相关） |
| 上游兜底 | `backend/app/services/chat_service.py`（大单帧拆 delta + `asyncio.sleep(0)`） |

**真假流式说明（对用户已说明）：**

- 链路是真 SSE：后端 `stream: True` + 浏览器读 `response.body`
- UI 有合批（~40ms），避免 AI SDK 每 token `structuredClone` 卡死重绘
- 若上游一帧吐超长文本，后端会拆帧——那时后半段更像「大块摊开」，不是上游 token 级推送

**曾出过的坑：**

1. 本地 500：缺 `context_summary` 列 → `ensure_schema` / 迁移
2. React #185：导航依赖不稳定 `rounds[]`
3. 「正在回复」在右上角：`.chat-stream-status` 是 `.chat-messages-wrap` 的 flex 兄弟
4. 「思考完一次全文」：Transport 一次 pull 抽干 + `onFinish` 整页 `loadConversation` 盖掉流式观感

### 2.4 其它杂项

- `.gitignore`：忽略 `.env.local` / `.env.*.local`
- `assets/sz-color-review-demo-mobile-review-qr.png`：**勿提交**（continuity 约定 assets 本地截图不入库）
- `backend/app/core/middleware.py`：有改动，接手时扫一眼是否与画布/媒体相关

---

## 3. 本地验证现状

- Chat 流式：用户 2026-07-20 确认「成功了」
- 画布 / 模板 / 上下文：本轮对话内已实现；**换对话前建议再跑**：
  - `backend\.venv\Scripts\python.exe -m pytest tests\test_chat_context.py tests\test_canvas_templates.py tests\test_canvas_projects.py -q`
  - 前端硬刷新后发短消息看 AI 气泡内状态 + 逐段变长
- 开发端口：前端 `18080`，后端 `18010`；改过 `vite.config.ts` 需重启 Vite

---

## 4. 建议下一对话怎么开

### 4.A 优先：整理提交（推荐先做）

工作区混了画布 + Chat 上下文 + 流式 + Studio 联动，**建议拆 commit**，例如：

1. `feat(canvas): templates library + admin CRUD`
2. `feat(chat): context window + summary persistence`
3. `fix(chat): real SSE streaming UX + status in assistant bubble`
4. （可选）Studio → 画布入口/props 若可独立再拆

用户未要求前 **不要主动 commit / push**。

### 4.B 下一产品大事：Agent 合入

- 分支：`wip/agent-multi-chat-2026-07` @ `4b0a5b3`
- 文档：`docs/archive/handoff-2026-07-16-agent-wip-status.md`
- 步骤：rebase 最新 `main`（含本轮未提交内容先入库后冲突更少）→ 切片 PR：B1 → gov → B2 → …
- **禁止**与 VIP / 生图路由 / 访客热修混 PR

### 4.C 可选收尾

- VIP Admin 建 `gpt-image-2-vip`（生产异步已可用）
- 访客 P2、Chat 轮次导航若尚未单独 commit 可并入整理

---

## 5. 给下一对话的启动提示（可直接粘贴）

```text
继续 QMDH-web。先读：
1) docs/archive/handoff-2026-07-20-canvas-chat-streaming-wip.md
2) docs/handoff.md
3) docs/continuity.md

当前 main 工作区有大量未提交改动（画布模板 + Chat 上下文摘要 + Chat 真流式）。
硬约束：未经我明确同意不要 git push / 部署生产。

下一步请先：git status 核对，再按我指定做「拆 commit」或「开始 Agent WIP rebase/B1 切片」。
```

---

## 6. 相关文档

| 文档 | 用途 |
| --- | --- |
| `docs/archive/handoff-2026-07-16-agent-wip-status.md` | Agent 合入现状 |
| `docs/archive/handoff-2026-07-03-agent-multi-chat-wip.md` | Agent 架构/文件表 |
| `docs/archive/chat-round-nav-2026-07-16.md` | 轮次导航（仍可能未单独 commit） |
| `docs/product-boundary.md` | 产品边界 |
