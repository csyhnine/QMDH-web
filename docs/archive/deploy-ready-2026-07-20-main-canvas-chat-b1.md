# 部署就绪清单：main @ 234dd8b（画布 + Chat 上下文/流式 + Agent B1）

Last updated: **2026-07-20**  
状态：**GitHub `main` 已就绪；生产尚未部署**  
触发条件：用户确认服务器空闲后，再执行本文「部署步骤」

---

## 1. 本次将上线什么

| 能力 | Commit 一带 | 说明 |
| --- | --- | --- |
| 画布模板库 | `e75cb3d` | 用户项目 / 模板分离；Admin CRUD |
| Chat 上下文窗口 + 摘要 | `dd0f121` | `context_summary*` 落库 |
| Chat 真流式 UX | `0b76caa` | SSE 可见 + 状态进 AI 气泡 |
| **Agent B1** | `79b0b8d` / PR #2 | `/studio/chat` 可开 `agent_mode`；5 只读 tools；thinking/tool_calls |
| docs | `29d7841` / `cd123da` / merge `234dd8b` | 交接与任务状态 |

**GitHub `main` HEAD（部署目标）**：`234dd8b`  
**生产当前（上次记录）**：约 `186b127` — 以服务器 `git rev-parse HEAD` 为准

**不上本次：**

- gov Admin overrides / B2 HITL / multi-agent LangGraph / crawl / ref-intent  
  （仍在 `wip/agent-multi-chat-2026-07` @ `4b0a5b3`）
- VIP Admin 建 `gpt-image-2-vip`（可选，与本包无关）
- 勿改服务器 `.env`

---

## 2. 新迁移（必须跑到 head）

相对旧生产，本包至少包含：

| Revision | 内容 |
| --- | --- |
| `h9i0j1k2l3m4` | canvas_projects / canvas_templates |
| `i0j1k2l3m4n5` | conversations.context_summary* |
| `k2l3m4n5o6p7` | agent_skill_releases.system_prompt_template / chat_tool_allowlist |

目标：`alembic current` == **`k2l3m4n5o6p7`**（repo head）

---

## 3. 部署步骤（等用户指令后再做）

路径：`/www/wwwroot/qmdh-web`  
原则：`git` 用 **`admin`**；**不碰** `.env`；**不要** `docker compose down -v`

```bash
# 0) 记录现状
sudo -u admin git -C /www/wwwroot/qmdh-web rev-parse HEAD
docker compose -f /www/wwwroot/qmdh-web/docker-compose.yml ps
curl -sS https://cityusbdisk.cn/api/v1/health

# 1) 可选：逻辑备份（强烈建议）
# docker compose exec postgres pg_dump -U qmdh -d qmdh > /root/qmdh-backup-YYYYMMDD.sql

# 2) 拉代码
sudo -u admin git -C /www/wwwroot/qmdh-web fetch origin
sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main
sudo -u admin git -C /www/wwwroot/qmdh-web rev-parse HEAD
# 期望：234dd8b…（或更新的 main tip）

# 3) 先 build backend（新 migration 文件进镜像后再 upgrade）
cd /www/wwwroot/qmdh-web
docker compose build backend
# worker 与 backend 同镜像时一并 build：
docker compose build worker

# 4) 迁移
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend alembic current
# 期望：k2l3m4n5o6p7

# 5) 重建并启动（frontend + backend + worker×3）
docker compose up -d --build
docker compose ps
```

若 Docker Hub / pip 冷缓存导致 backend 构建过久，可按历史做法用本地 bundle / 热修兜底（见既有 deploy archive）；**优先完整 rebuild**。

---

## 4. 部署后验收

1. `https://cityusbdisk.cn/api/v1/health` → healthy  
2. Studio 登录正常；生图不回归（尤其 PRO 2K）  
3. `/studio/chat`：**普通模式**仍真流式 + 顶栏上下文 %  
4. `/studio/chat`：打开 **设计助手 / agent** → thinking → tool 卡片 → 回复  
5. `/studio/canvas` 或 rail 画布入口可开；Admin 画布模板页可进  
6. `docker compose logs --tail=100 backend` 无持续 500

---

## 5. Agent 现状一句话

| 层级 | 状态 |
| --- | --- |
| **B1（只读 tools）** | 已合入 GitHub `main`（PR #2）；**等部署**后生产才可见 |
| **gov / B2 / multi / crawl / ref** | 仍在 WIP 分支，**未**合 main，本次部署**不会**带上 |

---

## 6. 回滚提示

- 代码：`sudo -u admin git -C /www/wwwroot/qmdh-web checkout <旧SHA>` 后按需 rebuild  
- DB：迁移一般向前兼容；回滚 migration 需单独评估，**默认不 downgrade**  
- 切勿 `down -v`
