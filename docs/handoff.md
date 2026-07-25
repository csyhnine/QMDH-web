# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-25] HappyHorse 对齐 Grok「单模型 + 档位菜单」— **待部署**
- 问题：HappyHorse 6 个 SKU 曾作为独立模型出现在列表里
- 修复：统一 `haodeya_happyhorse` 入口 + Studio 档位菜单（文生/图生/参考 × 5s/10s），散装 SKU profile 停用
- Safe to hand off: **部署后 Yes**

### [2026-07-25] Haodeya 新模型分流（chat / wan2.7 / HappyHorse）— **已上生产**
- Git：**`47890dc`**（产品）；文档基线至 `d73966b`
- Alembic：**`o6p7q8r9s0t1` (head)**
- Chat：仅启用 `qwen3.8-max-preview`
- wan2.7：字面 size；HappyHorse：`/videos` + duration 匹配 SKU
- Safe to hand off: **Yes**

### [2026-07-25] 用量日志单行 + 能力/参数展示 — **已上生产**
- Git：**`8809239`**；归档：`docs/archive/deploy-2026-07-25-usage-logs-summary.md`
- Safe to hand off: **Yes**

<!-- 更早条目见 docs/archive -->
