# Deploy ready — chat-agent max_tokens 402 hotfix

Date: **2026-08-06**  
Git tip to deploy: **`e50d4ab`**（已 push `origin/main`）  
Alembic: **无新迁移**（仍 `r9s0t1u2v3w4`）  
本机：无 SSH 密钥，无法直连 `120.79.227.11` — **请在服务器执行下方块**

## 原因

设计助手未设 `max_tokens`，上游按模型天花顶（如 65536）预扣 → HTTP 402 `openrouter_credits`，新开对话寒暄也会失败。

## 热修内容

- `STUDIO_AGENT_MAX_TOKENS = 4096`（PydanticAI `ModelSettings`）
- 402 错误文案说明为预扣问题，而非必然欠费

## 服务器执行（root 登录后）

```bash
sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main
cd /www/wwwroot/qmdh-web
git rev-parse HEAD   # 期望 e50d4ab
docker compose build backend
docker compose up -d backend
docker compose ps
curl -sS https://cityusbdisk.cn/api/v1/health
```

无需 `alembic upgrade`。worker 可不重建（助手跑在 backend）。

## 验收

1. Chat 打开「设计助手」，新对话发「你好」
2. 应正常回复，不再出现 `65536` / `openrouter_credits` / HTTP 402
3. 可选：Admin 用量或日志确认请求带较小 max_tokens

## 未纳入本热修（本地仍 WIP）

- harness 切片 A（关 hints / 精简 models_note）与审计文档 — 未 commit
