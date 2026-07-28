# 生产部署记录 — 2026-07-28 画布 / 公告 / AI 工具导航

Date: **2026-07-28**  
Production: `https://cityusbdisk.cn`  
最终 Git：**`33652d5`**（功能 `63f2e0a` + 部署清单）  
Alembic：**`r9s0t1u2v3w4`**（`site_announcements` + `ai_tools`）

## 一句话

画布撤销/悬停断线、站点公告、AI 工具导航、提示词分类树已上生产。

## 执行结果

| 检查 | 结果 |
|------|------|
| Git HEAD | `33652d50`（含 `63f2e0a`） |
| Alembic | 表已由新 backend 启动创建；`upgrade` 遇 DuplicateTable 后 `stamp r9s0t1u2v3w4`；`current` = head |
| `/api/v1/health` | healthy（db + redis） |
| compose | backend healthy；frontend started |
| 新 API | `/announcements/active`、`/ai-tools` 需登录（未带 token 返回 401，路由已挂载） |

## 相关

- 功能 commit：`63f2e0a`
- 就绪清单：`docs/archive/deploy-ready-2026-07-28-canvas-announcements-ai-tools.md`
