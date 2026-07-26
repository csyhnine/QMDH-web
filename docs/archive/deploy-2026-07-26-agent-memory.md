# 生产部署记录 — 2026-07-26 agent-memory-002

Date: **2026-07-26**  
Production: `https://cityusbdisk.cn`  
最终 Git：**`ab5ac6e`**（功能 `56e9d64` + 部署文档）  
Alembic：无新迁移

## 一句话

记忆写入筛选 / 会话摘要压缩 / 项目经验 `experience` 已上生产；存量 turn summary 已 scrub。

## 执行结果

| 检查 | 结果 |
|------|------|
| Git HEAD | `ab5ac6e` |
| `/api/v1/health` | healthy（db + redis） |
| compose | backend healthy；frontend started |
| scrub dry-run → apply | scanned=12；deleted_turn_summaries=8；compacted_sessions=4 |

## 相关

- 功能 commit：`56e9d64`
- 就绪清单（已执行）：`docs/archive/deploy-ready-2026-07-26-agent-memory.md`
