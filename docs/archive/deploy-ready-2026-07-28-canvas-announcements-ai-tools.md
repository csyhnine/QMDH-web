# 部署就绪 — 2026-07-28 画布 / 公告 / AI 工具导航

Date: **2026-07-28**  
GitHub `main`：**`63f2e0a`**  
本机：**已 commit + push**；本工作站 **无 SSH 密钥**，无法直连 `120.79.227.11`，需在服务器执行下方命令。

## 上线内容（勿遗漏）

| 模块 | 说明 |
|------|------|
| 画布 | Ctrl+Z 撤销/重做；悬停连线中点断开；模板发布支持新建/覆盖已有 |
| 提示词模板 Admin | 分类/子分类树 + 搜索 |
| 站点公告 | `site_announcements` + Studio 登录后弹窗 + Admin `/admin/announcements` |
| AI 工具导航 | `ai_tools` + Studio `/studio/nav` + Admin `/admin/ai-tools` |

## Alembic（必须）

链式迁移：

1. `q8r9s0t1u2v3` — `site_announcements`
2. `r9s0t1u2v3w4` — `ai_tools`（head）

未跑迁移则公告/工具 API 会因缺表失败。

## 服务器执行

```bash
# 可选：先备份
cp /www/wwwroot/qmdh-web/.env /root/qmdh-env-backup-$(date +%Y%m%d%H%M).env
cd /www/wwwroot/qmdh-web
docker compose exec -T postgres pg_dump -U qmdh qmdh | gzip > /root/qmdh-pg-$(date +%Y%m%d%H%M).sql.gz

# 拉代码（必须用 admin）
sudo -u admin git -C /www/wwwroot/qmdh-web fetch origin main
sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main
sudo -u admin git -C /www/wwwroot/qmdh-web rev-parse --short HEAD
# 期望：63f2e0a

cd /www/wwwroot/qmdh-web
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend alembic current
# 期望：r9s0t1u2v3w4 (head)

docker compose build frontend backend
docker compose up -d frontend backend
# 本轮无 worker 逻辑变更；若需一并刷新：docker compose up -d --build

curl -sS https://cityusbdisk.cn/api/v1/health
curl -sS -o /dev/null -w "%{http_code}\n" https://cityusbdisk.cn/api/v1/announcements/active
curl -sS -o /dev/null -w "%{http_code}\n" https://cityusbdisk.cn/api/v1/ai-tools
```

## 验收

1. Git HEAD 与本机 push 的 short SHA 一致  
2. Alembic `current` = `r9s0t1u2v3w4`  
3. `/api/v1/health` healthy  
4. 画布：悬停连线可断开；Ctrl+Z 可恢复  
5. Admin：公告、工具导航、提示词分类树可用  
6. Studio：`/studio/nav` 可打开；有生效公告时登录进生成页弹窗  
