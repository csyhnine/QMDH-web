# 生产部署记录 — 2026-07-20

Date: **2026-07-20**  
Production: `https://cityusbdisk.cn`  
最终 Git：**`3ff220b`**  
前一生产 HEAD：`4a3e5ad`  
Alembic：**`k2l3m4n5o6p7` (head)**

---

## 一句话

将 **画布模板库 + Chat 上下文摘要 + 真流式 UX + Agent B1 代码（UI 默认隐藏）** 部署上线；`.env` 未改；worker×3 保持。

---

## 上线内容

| 项 | 说明 |
| --- | --- |
| 画布模板 | `canvas_projects` / `canvas_templates`；Studio / Admin 入口 |
| Chat 上下文 | `context_summary*`；顶栏用量 % |
| Chat 真流式 | SSE 可见增量；状态进 AI 气泡 |
| Agent B1 | 后端已上；**「设计助手」UI 默认隐藏**（`VITE_CHAT_AGENT_UI_ENABLED` 未开） |
| 普通 Chat | 继续落库，服务后续个性化助手方向 |

**未上：** gov / B2 HITL / multi-agent / crawl / ref-intent（仍在 WIP 分支）

---

## 执行步骤（已完成）

```bash
sudo -u admin git -C /www/wwwroot/qmdh-web fetch origin main
sudo -u admin git -C /www/wwwroot/qmdh-web reset --hard origin/main
cd /www/wwwroot/qmdh-web
docker compose build backend worker
docker compose run --rm backend alembic upgrade head   # -> k2l3m4n5o6p7
docker compose up -d --build --scale worker=3 frontend backend worker
```

迁移实际跑了：

- `g8…` → `h9i0j1k2l3m4`（canvas）
- → `i0j1k2l3m4n5`（context summary）
- → `k2l3m4n5o6p7`（agent policy columns）

---

## 验收

| 检查 | 结果 |
| --- | --- |
| Git HEAD | `3ff220be` |
| Alembic | `k2l3m4n5o6p7 (head)` |
| `/api/v1/health` | healthy |
| compose | backend healthy；frontend；worker-1/2/3 |

建议人工再点：登录、Chat 流式+上下文 %、画布入口、生图不回归。Chat **不应**出现「设计助手」开关。

---

## 相关文档

- 部署前清单：`docs/archive/deploy-ready-2026-07-20-main-canvas-chat-b1.md`
- Agent WIP：`docs/archive/handoff-2026-07-16-agent-wip-status.md`
