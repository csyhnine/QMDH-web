# Handoff: Chat 模型切换 + 上下文统计（阶段 1）— 2026-09-16

**状态：DONE（已部署生产）**  
**Safe to hand off：Yes**

---

## 摘要

本次交付两项 Chat 能力，并已上生产：

1. **会话内切换模型** — 顶栏下拉框更新当前对话的 `model_provider_id`；历史消息保留，**后续回答由新模型生成**。
2. **上下文统计（阶段 1）** — 消息级 token 估算持久化 + 会话级 context 快照 + breakdown API，支撑压缩触发与运维排查。

**未包含：** 设计助手（`agent_mode`）修复、pydantic-ai 依赖、GPT Chat 模型恢复、阶段 2 上游 usage 校准。

---

## Git / 部署

| 项 | 值 |
|---|---|
| GitHub `main` | `b6edfd2`（`5777b1e` 功能 + `b6edfd2` 迁移修复） |
| 生产 git HEAD | `28c0f2ba`（merge `origin/main` + 保留 2 个 Banana 本地热补丁提交） |
| Alembic head | **`a8b9c0d1e2f3`**（`add_conversation_context_stats`） |
| 生产 URL | https://cityusbdisk.cn |
| 部署时间 | 2026-09-16 |

### Commits（GitHub main）

- `5777b1e` — `feat(chat): model switch, context stats snapshots, and breakdown API`
- `b6edfd2` — `fix(chat): point context stats migration at u2 head and fix bootstrap timestamp type`

### 生产 deploy 步骤（本次实际执行）

```bash
cd /www/wwwroot/qmdh-web
sudo -u admin git fetch origin main
sudo -u admin git -c user.name=admin -c user.email=admin@local merge origin/main --no-edit
docker compose build backend
docker compose run --rm backend alembic upgrade head
docker compose up -d --build backend frontend
curl -sf http://127.0.0.1:8080/api/v1/health?detail=full
```

**注意：**

- 生产 git **不能** `pull --ff-only`（有 Banana 本地提交 `759f35ef`、`d16cc3c4`）；用 **merge**。
- `alembic` 必须在 **`docker compose build backend` 之后**跑（迁移文件在镜像内，不在挂载卷）。
- 首次 deploy 曾因 migration `down_revision=z7…`（WIP 未入库）和 bootstrap `DATETIME`（Postgres 不支持）失败；已在 `b6edfd2` 修复。

---

## 功能说明

### 1. 模型切换

| 层 | 行为 |
|---|---|
| 创建对话 | `POST /chat/conversations` 绑定 `model_provider_id` |
| 切换 | `PATCH /chat/conversations/{id}` body: `{ "model_provider_id": N }` |
| 发消息 | 始终读 **conversation** 上的 `model_provider_id`，与下拉框 localStorage 无关 |
| 前端 | `ChatPage.tsx` — 打开对话同步下拉框；切换时 PATCH + 刷新 context 估算 |

### 2. 上下文统计（阶段 1）

**新 DB 字段：**

- `chat_messages.estimated_input_tokens` — 写入时估算（CJK/英文启发式 + 附件占位）
- `conversations.context_summary_tokens` / `context_recent_tokens` / `context_uncovered_tokens` / `context_packed_tokens` / `context_stats_updated_at`

**运行时：**

- 每次 `pack_chat_context` 结束写入快照并 `commit`
- 列表/打开会话：`estimate_conversation_context` → 顶栏「上下文 xx%」
- 发消息后 SSE `context` 事件刷新 UI

**API：**

```
GET /api/v1/chat/conversations/{id}/context-stats
```

返回：summary/recent/uncovered/packed tokens、消息条数分布、`will_compress_soon` 等。

**压缩逻辑未改：** 仍由 `pack_chat_context` 按 token 阈值 / 未覆盖条数触发 LLM 摘要；统计为观测与管理服务。

### 3. 关键代码路径

- `backend/app/services/chat_context.py` — `compute_context_breakdown`、`persist_conversation_context_stats`、`apply_message_input_tokens`
- `backend/app/routers/chat.py` — `update_conversation`、`get_conversation_context_stats`
- `frontend/src/pages/chat/ChatPage.tsx` — `handleModelChange`
- `frontend/src/api.ts` — `updateChatConversation`、`getChatConversationContextStats`

---

## Chat 生产运营态（2026-09-16，运维确认）

| 项 | 状态 |
|---|---|
| Admin「设计助手 UI」 | **关**（`platform_settings.chat_agent_ui_enabled = false`） |
| 可用 Chat 模型 | **`claude-opus-4-6-thinking`**、**`gemini-3.7-flash-high`** |
| 已禁用 | `openai/gpt-5.4` 及多数旧 Chat 模型（上游 GPT 系列问题，运维决策废弃） |
| 设计助手依赖 | `pydantic-ai==0.4.3` 与 `opentelemetry-api==1.44` **不兼容**（`_PYDANTIC_AI_AVAILABLE=False`）；** reopen 助手前须修依赖或 pin `opentelemetry-api<1.44` / 升 pydantic-ai≥1.0** |
| 旧对话 | 约 32 条 conversation 仍绑定已禁用 provider；用户可在旧对话里 **切换模型** 后继续，或新建对话 |

### 给设计师的一句话

打开旧对话 → 顶栏选 **claude** 或 **gemini** → 直接继续问；上下文百分比在发消息后会更新。

---

## 验证清单（生产已通过）

- [x] `GET /api/v1/health` → `healthy`
- [x] `alembic_version` = `a8b9c0d1e2f3`
- [x] `conversations.context_*_tokens` 列存在
- [x] `chat_messages.estimated_input_tokens` 列存在
- [x] backend import `compute_context_breakdown` / `update_conversation` OK
- [x] `backend` + `frontend` 容器 Up (healthy)

### 建议 smoke（人工）

1. 登录 → Chat → 打开旧对话（曾绑 gpt-5.4）→ 切换 claude → 发一条消息 → 有正常回复
2. 顶栏上下文 % 在回复后变化
3. （可选）DevTools 调 `GET /chat/conversations/{id}/context-stats` 看 breakdown

---

## 已知限制 / 后续（阶段 2，未做）

- 估算非 tiktoken；附件文件打包前用 1500 token 占位，可能与真实抽全文偏差大
- 未用上游 `prompt_tokens` 反校准
- Admin UI 未展示 breakdown（仅有 API）
- 切换模型 **不** 清空 `context_summary`（有意为之；摘要做为新模型上下文材料）
- 历史消息 `estimated_input_tokens=0` 的会在读取时 fallback 实时估算

---

## 本地仓库状态（交接时）

- GitHub `main` @ `b6edfd2` 已含本功能
- 本地可能有 **stash**（`wip-before-chat-deploy` 等）含画布/符号链 WIP — **未上生产**
- 符号主题 / 豆包检索等大批 WIP 仍在本地，与本次 Chat deploy **无关**

---

## 相关前序 incident（Chat 报错背景）

- **403 ToS（gpt-5.4）：** 上游拒绝，非本站故障；GPT Chat 已废弃
- **`chat_agent_unavailable` / pydantic-ai：** 助手路径；助手已关，普通 Chat 不受影响
- **9/15 停机/502：** 续费重启顺序问题，已恢复；与本次功能无关

---

## 纪律

- 未经用户同意 **禁止** 再次 deploy / force push
- **勿** 在生产 reopen 助手 UI，除非 pydantic-ai 依赖已修
- 生产 `git pull --ff-only` 会失败 — 用 merge 或先理清 Banana 热补丁与 origin 策略
