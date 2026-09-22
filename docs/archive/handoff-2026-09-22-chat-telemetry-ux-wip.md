# 交接档 — 2026-09-22（Chat UX 修复 + 埋点 P0–P3）

Date: **2026-09-22**  
Status: **WIP — 本地已完成，未 commit / 未部署**  
Production: `https://cityusbdisk.cn`  
本地 Git 分支: **`main`** @ **`10daf55`**（远端同步状态部署前需再 `git fetch` 确认）  
Safe to hand off: **Yes（给审查 + 提交 + 部署 Agent）**

---

## 一句话

针对生产用户许潇「上传大 PDF 后 Claude 无回复 / network error」问题，本地实现了 **Chat 流式 UX 修复**（分步进度、防重复发送、失败落库）和 **完整 Chat 埋点体系 P0–P3**（漏斗表、前端事件、Admin 看板、阈值告警）。**下一对话应先 Code Review，再 commit + 生产部署。**

---

## 背景：许潇事件（生产已排查，修复未上线）

| 项 | 结论 |
|----|------|
| 用户 | `xx`（许潇），`designer`，billing 正常 |
| 会话 | #92：3 条 user、0 条 assistant；PDF(8.55MB)+DOCX |
| 管理员 | 同模型 `claude-opus-4-6-thinking`，conv #95 正常 |
| 根因 | 大附件 pack 耗时 → 用户重复发送 abort SSE → **上游未调用** → 页面无回复 / `network error` |
| 非原因 | 非 8MB 超限、非权限问题 |

临时运维脚本（**勿提交**）：`scripts/_tmp_prod_xuxiao_chat_check.py`、`scripts/_tmp_prod_conv92_*.py` 等。

---

## 本次本地改动（两大块）

### A. Chat UX 修复（许潇类问题）

**后端 `backend/app/routers/chat.py`**
- SSE 分步 status（pack / 读附件 / 调上游）
- pack 期间队列刷 status
- `try/except/finally`：中断/失败写入 assistant 错误消息
- `_persist_chat_assistant_reply`、`_chat_status_sse`、`_chat_error_sse`

**后端服务**
- `chat_message_content.py`：`on_stage` 回调（「正在读取附件：xxx…」）
- `chat_context.py`：`on_status` 传入 `build_provider_messages`

**前端**
- `ChatPage.tsx`：`replyPending` / `busyReply`、处理中提示条、重复发送拦截、`onError` 同步消息
- `qmdhChatTransport.ts`：更多 status 触发 UI
- `styles.css`：`.chat-streaming-hint`

**测试**
- `test_chat_streaming.py`：含 `test_chat_message_route_persists_interrupted_stream_message`

---

### B. Chat 埋点 P0–P3（完整方案）

#### P0 — 后端漏斗

| 文件 | 作用 |
|------|------|
| `backend/app/models.py` | `ChatTurnTelemetry` 模型 |
| `backend/migrations/versions/x9y0z1a2b3c4_add_chat_turn_telemetry.py` | 表 `chat_turn_telemetry` |
| `backend/app/services/chat_telemetry_service.py` | `begin_chat_turn` / `ChatTurnTracker.finalize` / 客户端事件合并 |
| `backend/app/routers/chat.py` | 全链路埋点 + `POST /chat/telemetry` |
| `backend/app/schemas.py` | `ChatTelemetryClientEventIn` / `ChatTelemetryBatchIn` |

**outcome 枚举：** `success` / `upstream_error` / `attachment_error` / `interrupted` / `stream_error` / `agent_success` / `agent_error`

#### P1 — 前端事件

| 文件 | 作用 |
|------|------|
| `frontend/src/lib/chat/chatTelemetry.ts` | 上报队列、pre-turn 缓冲、correlation 关联 |
| `frontend/src/api.ts` | `postChatTelemetry` |
| `frontend/src/lib/chat/qmdhChatTransport.ts` | 读 `X-Request-ID` + SSE `correlation_id` |
| `frontend/src/lib/chat/qmdhSseParser.ts` | `correlation_id` 字段 |
| `frontend/src/lib/chat/useChatAttachments.ts` | 附件 upload 埋点 |
| `frontend/src/pages/chat/ChatPage.tsx` | send/blocked/error/status/switch 埋点 |

**事件清单：**
- `chat.send.clicked` / `chat.send.blocked_busy`
- `chat.stream.client_error` / `chat.stream.status`
- `chat.conversation.switch`（处理中切会话）
- `chat.attachment.upload.start|success|error`

**设计要点：** 发送前事件先缓冲，SSE 首帧拿到本轮 `correlation_id` 后合并入库（避免挂到上一轮）。

#### P2 — Admin 看板

| 文件 | 作用 |
|------|------|
| `backend/app/services/chat_telemetry_dashboard_service.py` | 聚合 overview + turn 列表 |
| `backend/app/routers/chat_experience.py` | `GET /admin/chat-experience/overview|turns` |
| `backend/app/main.py` | 注册 router |
| `frontend/src/pages/admin/ChatExperiencePage.tsx` | Admin 页面 |
| `frontend/src/router.tsx` + `AppShell.tsx` + `roleAccess.ts` | 路由与导航「Chat 体验」 |

#### P3 — 告警

| 文件 | 作用 |
|------|------|
| `backend/app/models.py` | `ChatTelemetryAlert` |
| `backend/migrations/versions/y0z1a2b3c4d5_add_chat_telemetry_alerts.py` | 表 `chat_telemetry_alerts` |
| `backend/app/services/chat_telemetry_alert_service.py` | 规则评估 + open/resolve |
| `backend/app/core/config.py` | 阈值 env 配置 |
| `backend/app/main.py` | 每小时定时任务（Redis 锁） |
| `chat_experience.py` | `GET /alerts` + `POST /alerts/evaluate` |
| `ChatExperiencePage.tsx` | 告警横幅 +「立即评估告警」 |

**默认告警规则（近 1h 窗口，≥10 轮才评估）：**

| alert_key | 条件 | 级别 |
|-----------|------|------|
| `upstream_call_rate_low` | upstream 调用率 < 90% | critical |
| `success_rate_low` | 成功率 < 85% | warning |
| `interrupted_rate_high` | 中断占比 > 10% | warning |
| `pack_p95_high` | 带附件 Pack P95 > 30s | warning |

**可选 env：**
```env
QMDH_CHAT_TELEMETRY_ALERTS_ENABLED=true
QMDH_CHAT_TELEMETRY_ALERT_INTERVAL_SECONDS=3600
QMDH_CHAT_TELEMETRY_ALERT_WINDOW_HOURS=1
QMDH_CHAT_TELEMETRY_ALERT_MIN_TURNS=10
QMDH_CHAT_TELEMETRY_ALERT_UPSTREAM_CALL_RATE_MIN=0.90
QMDH_CHAT_TELEMETRY_ALERT_SUCCESS_RATE_MIN=0.85
QMDH_CHAT_TELEMETRY_ALERT_INTERRUPTED_RATE_MAX=0.10
QMDH_CHAT_TELEMETRY_ALERT_PACK_P95_MS_MAX=30000
```

---

## Migration 链（部署前必查生产版本）

```
v3w4x5y6z7a8          ← 生产可能仍在此（2026-09-18 部署记录）
  └─ w4x5y6z7a8b9      ← 已在 GitHub main（10daf55 润色 limits）
       └─ x9y0z1a2b3c4  ← 本次：chat_turn_telemetry
            └─ y0z1a2b3c4d5  ← 本次：chat_telemetry_alerts（head）
```

**部署前在生产执行：**
```bash
docker compose exec backend alembic current
# 期望最终：y0z1a2b3c4d5 (head)
```

---

## 测试（本地已通过）

```bash
cd backend
python -m pytest \
  tests/test_chat_telemetry.py \
  tests/test_chat_telemetry_alerts.py \
  tests/test_chat_experience_analytics.py \
  tests/test_chat_streaming.py \
  tests/test_chat_attachments.py -q
# 结果：19 passed（2026-09-22）
```

---

## 下一对话：建议工作流

### 1. Code Review 重点

- [ ] `chat.py`：`generate()` / `generate_agent()` 所有路径是否都 `finalize` telemetry（含 early return）
- [ ] 中断/失败时 assistant 错误消息是否泄漏内部细节
- [ ] `chatTelemetry.ts` pre-turn 缓冲是否在 correlation 到达后正确 flush
- [ ] 告警 `logger.warning` 的 `extra` 不用 reserved key（已修 `message` → `alert_message`）
- [ ] Admin API 均 `require_ops_access`
- [ ] migration `down_revision` 与生产 alembic 链接是否正确
- [ ] **不要** commit `scripts/_tmp_*`、`.pytest_cache`、`__pycache__`

### 2. Git Commit（建议拆 1 或 2 个 commit）

**方案 A — 单 commit：**
```
feat: Chat UX hardening and turn telemetry with admin alerts

Fix streaming UX for large attachment pack (status, busy guard, error persist).
Add chat_turn_telemetry funnel, client events, admin dashboard, and P3 alerts.
```

**应纳入 commit 的文件（17 modified + 10 new，不含 scripts/_tmp_*）：**

Modified:
- `backend/app/core/config.py`
- `backend/app/main.py`
- `backend/app/models.py`
- `backend/app/routers/chat.py`
- `backend/app/schemas.py`
- `backend/app/services/chat_context.py`
- `backend/app/services/chat_message_content.py`
- `backend/tests/test_chat_streaming.py`
- `frontend/src/api.ts`
- `frontend/src/components/shared/AppShell.tsx`
- `frontend/src/features/access/roleAccess.ts`
- `frontend/src/lib/chat/qmdhChatTransport.ts`
- `frontend/src/lib/chat/qmdhSseParser.ts`
- `frontend/src/lib/chat/useChatAttachments.ts`
- `frontend/src/lib/chat/chatTelemetry.ts`（新）
- `frontend/src/pages/chat/ChatPage.tsx`
- `frontend/src/router.tsx`
- `frontend/src/styles.css`

New:
- `backend/app/routers/chat_experience.py`
- `backend/app/services/chat_telemetry_service.py`
- `backend/app/services/chat_telemetry_dashboard_service.py`
- `backend/app/services/chat_telemetry_alert_service.py`
- `backend/migrations/versions/x9y0z1a2b3c4_add_chat_turn_telemetry.py`
- `backend/migrations/versions/y0z1a2b3c4d5_add_chat_telemetry_alerts.py`
- `backend/tests/test_chat_telemetry.py`
- `backend/tests/test_chat_experience_analytics.py`
- `backend/tests/test_chat_telemetry_alerts.py`
- `frontend/src/pages/admin/ChatExperiencePage.tsx`
- `docs/archive/handoff-2026-09-22-chat-telemetry-ux-wip.md`
- `docs/handoff.md`（更新 Latest）

### 3. 生产部署（参考历史流程）

```bash
# 本机
git push origin main

# 生产 /www/wwwroot/qmdh-web
sudo -u admin git fetch origin main
sudo -u admin git merge origin/main --no-edit
docker compose run --rm backend alembic upgrade head   # → y0z1a2b3c4d5
docker compose up -d --build backend worker frontend
```

VPN 如需：`127.0.0.1:7897`（历史对话提及）

### 4. 部署后验收

| 检查 | 命令/路径 |
|------|-----------|
| Health | `GET /api/v1/health` |
| Alembic | `alembic current` → `y0z1a2b3c4d5` |
| Admin 看板 | `/admin/chat-experience` 可打开 |
| 发一条 Chat | `chat_turn_telemetry` 有新行 |
| 告警 | Admin 点「立即评估告警」或等 1h 定时任务 |
| UX | 大 PDF 发送时可见进度文案；处理中无法重复发送 |

**SQL 抽查：**
```sql
SELECT id, correlation_id, outcome, pack_duration_ms, upstream_called, error_code, started_at
FROM chat_turn_telemetry ORDER BY id DESC LIMIT 10;

SELECT alert_key, severity, status, message, last_seen_at
FROM chat_telemetry_alerts ORDER BY last_seen_at DESC LIMIT 5;
```

---

## 关键路径速查

```
backend/app/routers/chat.py              # 发送、SSE、埋点、telemetry API
backend/app/services/chat_telemetry_service.py
backend/app/services/chat_telemetry_dashboard_service.py
backend/app/services/chat_telemetry_alert_service.py
backend/app/routers/chat_experience.py
frontend/src/pages/chat/ChatPage.tsx
frontend/src/lib/chat/chatTelemetry.ts
frontend/src/pages/admin/ChatExperiencePage.tsx
```

---

## 已知限制 / 未做

- 附件 **per-file 提取明细**（耗时/字数/成败）仅有 turn 级汇总，无独立 per-attachment 事件表
- 告警仅写 DB + 结构化日志，**无邮件/企微推送**
- 许潇 conv #92 **未**在生产补写历史错误消息（可选运维）
- 生产磁盘仍偏紧（2026-09-20 约 88%），与本次无关但部署时注意

---

## 给新 Agent 的开场指令（可复制）

```
请阅读 docs/archive/handoff-2026-09-22-chat-telemetry-ux-wip.md 和 docs/handoff.md。
先对 Chat UX + 埋点 P0–P3 做 code review，跑 backend chat 相关 pytest（期望 19 passed），
然后 commit（不含 scripts/_tmp_*），push，并按文档部署生产（alembic upgrade head + rebuild）。
部署后验证 /admin/chat-experience 和 chat_turn_telemetry 表有数据。
```
