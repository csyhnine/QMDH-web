# 生产部署记录 — 2026-07-25（用量日志单行与摘要）

Date: **2026-07-25**  
Production: `https://cityusbdisk.cn`  
最终 Git：**`8809239`**  
前一生产 HEAD（本轮用量日志前）：约 `f057dff`（Studio↔Canvas 联动已在线）  
Alembic：**`o6p7q8r9s0t1` (head)** — 本轮无迁移

---

## 一句话

管理端 `/admin/usage-logs` 默认按任务单行展示，并补齐能力、输入参数与产出张数/段数；frontend + backend + worker 同步重建。

---

## 上线提交

| Commit | 说明 |
| --- | --- |
| `abf2e19` | 默认「按任务汇总」列表与计费口径对齐，去掉 provider_call 双行 |
| `8809239` | 汇总行能力/模型/输入摘要/输出摘要；历史空字段读时回填 |

同期已在生产、本归档顺带对齐的近期能力（非本轮专属）：

- `f057dff` Studio ↔ Canvas linkage
- `aff7bda` 图生图「遵循原图」
- `377bd7e` / `3e83811` / `eff67a3` 对比预览、画布复制运行、滑杆贴边

---

## 执行步骤（已完成）

```bash
# 本机：commit + push origin main 后再拉（勿并行 push/pull）
sudo -u admin git -C /www/wwwroot/qmdh-web fetch origin main
sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main
cd /www/wwwroot/qmdh-web
docker compose build frontend backend
docker compose up -d frontend backend
# usage_ledger 写入路径在 worker → 须重建
docker compose build worker
docker compose up -d --no-deps worker
```

未改 `.env`；未跑 alembic。

---

## 验收

| 检查 | 结果 |
| --- | --- |
| Git HEAD | `8809239` |
| Alembic | `o6p7q8r9s0t1 (head)` |
| `/api/v1/health` | healthy |
| compose | backend healthy；frontend；worker-1/2/3 |

人工建议：打开 `/admin/usage-logs`，确认默认「按任务汇总」下一任务一行，能力非「—」，输入有比例/分辨率，输出有「N 张」类文案。

---

## 相关文档

- 交接：`docs/handoff.md` → `[2026-07-25] 用量日志单行 + 能力/参数展示`
- 连续性：`docs/continuity.md`
