# 生产部署记录 — 2026-09-18（润色分模式优化 + 画布 UX + 日志刷新）

Date: **2026-09-18**  
Production: `https://cityusbdisk.cn`  
GitHub `main`: **`3dca3ca`** — `feat: polish per-mode prompts, canvas UX fixes, usage logs refresh`  
生产 merge HEAD: **`9392c447`**（merge `origin/main`）  
Alembic: **`v3w4x5y6z7a8` (head)** — 新增 `prompt_polish_system_prompt_{generate,edit,video}`

---

## 一句话

针对 Admin 生成分析暴露的「润色后采纳率偏低（25.5%）」问题，上线**分创作模式润色策略**、**润色历史**、生产三套独立 system prompt，并顺带修复画布误触与日志刷新。后续需观察 **Settle / 任务成功率** 是否上升。

---

## 背景：优化前基线（30 天窗口，约 2026-08-28 埋点上线后）

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 润色次数 | 164 | 12 人；Studio 131 / Canvas 33 |
| 润色后提交率 | **4.5%** | 102 / 2272 次生成带 `prompt_polished`（相对全部生成，非相对润色点击） |
| 润色后采纳率（Settle） | **25.5%** | 润色后提交且出现收藏/放大/下载等正向 outcome 的比例 |
| 整体下载率 | 24.8% | 564 / 2272 |
| 静默采纳 | 75.6% | 已 settle 任务中仅下载、无其他交互 |

**诊断结论（当时）：**

- 图生图被当成「全文扩写」，易偏离参考图 → 采纳率低
- 润色点击 → 带标记提交约 62%（102/164），其余为试后放弃或改字丢标记
- Admin 仅一条 system prompt，迁移后三列相同，未真正分模式

---

## 上线内容

### 1. 润色质量（后端 + Admin）

| 模式 | system prompt 要点 | max_tokens |
| --- | --- | --- |
| 文生图 `generate` | 补全主体/光影/风格，80–150 字 | 500 |
| 图生图 `edit` | **只写修改点**，禁止重写构图，60–120 字，≤原文 1.5 倍 | 280 |
| 视频 `video` | 动作/镜头/节奏，80–160 字 | 420 |

- 迁移 `v3w4x5y6z7a8`：三列独立配置 + 旧 `prompt_polish_system_prompt` 迁移
- API 增加 `reference_images_used`、`reference_image_warning`
- 本地路径参考图 → data URL（与生成链路一致）

### 2. 润色体验（前端）

- **润色记录**：最近 5 条，Studio + Canvas 提示词框下方，可点击切换
- Admin：**三列**独立编辑 +「查看内置默认」
- 润色开启时显示空状态提示

### 3. 画布 UX（同日部署）

- 取消空白处双击创建备注（保留右键 → 备注文字）
- 禁止节点内 `<img>` 原生拖拽触发「上传图片」节点误创建

### 4. 使用日志

- 「刷新」：结束时间延至当前 + 防缓存 + 显示「刷新于 …」

---

## 生产配置（2026-09-18 部署后写入）

| 项 | 值 |
| --- | --- |
| `prompt_polish_enabled` | `true` |
| `prompt_polish_provider_id` | **51** — `gemini-3.7-flash-high`（支持 vision，图生图可读参考图） |
| `prompt_polish_system_prompt`（legacy） | **NULL**（已清空，避免覆盖三模式） |
| `prompt_polish_system_prompt_generate` | 210 字，首行含「文生图」 |
| `prompt_polish_system_prompt_edit` | 294 字，首行含「图生图/改图」 |
| `prompt_polish_system_prompt_video` | 242 字，首行含「视频生成」 |

**说明：** 迁移曾把旧通用 prompt（260 字×3）复制到三列；部署当天下午已用内置分模式文案**覆盖**并清空 legacy 字段。

---

## 执行步骤（已完成）

```bash
# 本机
git push origin main   # 3dca3ca

# 生产
cd /www/wwwroot/qmdh-web
sudo -u admin git fetch origin main
sudo -u admin git merge origin/main --no-edit
docker compose run --rm backend alembic upgrade head   # → v3w4x5y6z7a8
docker compose up -d --build backend worker frontend

# 生产 DB：写入分模式 prompt（脚本，未入库）
# scripts/_tmp_prod_update_polish_prompts.py
```

---

## 验收（已通过）

| 检查 | 结果 |
| --- | --- |
| Git 生产 HEAD | `9392c447` |
| Alembic | `v3w4x5y6z7a8 (head)` |
| `/api/v1/health` | healthy |
| compose | backend + worker×3 + frontend up |

---

## 观察计划（建议 2–4 周后，约 2026-10-02 ~ 2026-10-16）

### 主指标（Admin → **生成分析**，30 天窗口）

| 指标 | 优化前 | 目标方向 | 备注 |
| --- | --- | --- | --- |
| **润色后采纳率** `polish_settle_rate` | 25.5% | **↑ 接近或超过** `avg_settle_score` | 核心：润色是否提升「满意结果」 |
| 润色后提交率 `polish_adoption_rate` | 4.5% | 可略升 | 分母为全部生成；点击→提交约 62% 更贴近真实转化 |
| 润色次数 / 人数 | 164 / 12 | 稳定或略升 | 功能可用性 |
| 整体 Settle / 下载率 | — | 间接参考 | 全站是否同步改善 |

### 辅助验证

1. **Admin → 设置 → 提示词润色**：三列文案不同，均显示「已自定义」
2. **图生图 Studio**：润色后 prompt 应短、只描述修改点；有参考图时 audit 里 `reference_image_count > 0`
3. **抽样 audit**（`studio.prompt_polish`）：对比 `prompt_preview` vs `polished_preview`，重点 `creation_mode=edit`
4. **任务失败率**（可选 SQL）：润色后提交 vs 未润色，`tasks.status=failed` 比例

```sql
-- 润色后提交的任务成功率（近 30 天，需按环境调整时间）
SELECT
  COUNT(*) FILTER (WHERE (gi.context_json->'submission'->>'prompt_polished')::boolean IS TRUE) AS polished_intents,
  COUNT(*) FILTER (WHERE t.status = 'completed' AND (gi.context_json->'submission'->>'prompt_polished')::boolean IS TRUE) AS polished_completed,
  COUNT(*) FILTER (WHERE t.status = 'failed' AND (gi.context_json->'submission'->>'prompt_polished')::boolean IS TRUE) AS polished_failed
FROM generation_intents gi
LEFT JOIN tasks t ON t.id = gi.task_id
WHERE gi.submitted_at >= NOW() - INTERVAL '30 days';
```

### 未覆盖 / 后续可加

- 生成分析**尚未按** `creation_mode`（文生图/图生图/视频）拆分润色采纳率
- 无「强制重跑」：已有 completed + assetUrls 的节点批量运行仍跳过
- 润色历史仅会话内，不持久化到服务端

### 若采纳率仍低

1. 抽 20 条图生图润色 audit 人工评质量  
2. 考虑图生图进一步缩短字数上限或二次「压缩」调用  
3. 对比 Grok / 其他 vision 模型作润色 A/B  
4. 高 Settle 的 dominant prompt 沉淀进模板默认值  

---

## 相关 commit / 文件

| Commit | 说明 |
| --- | --- |
| `3dca3ca` | 分模式润色、历史、迁移、画布 UX、日志刷新 |
| `c3c9a0b` | （同周）Haodeya GPT 2.0 / 2.5 Sunburst（独立线） |

**核心路径：**

- `backend/app/services/prompt_polish_service.py`
- `backend/migrations/versions/v3w4x5y6z7a8_add_prompt_polish_mode_system_prompts.py`
- `frontend/src/lib/usePromptPolish.ts`
- `frontend/src/components/shared/PromptPolishHistoryPanel.tsx`
- `frontend/src/pages/admin/PromptPolishSettingsPanel.tsx`

**勿 commit：** `scripts/_tmp_prod_update_polish_prompts.py` 及各类 `_tmp_*`

---

## Safe to hand off

**Yes** — 已部署生产；观察期记录以上基线，下轮对比生成分析 KPI 即可。
