# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-25] Haodeya 新模型分流（chat / wan2.7 / HappyHorse）— **待部署后核对 HEAD**
- 目标：不同能力走不同路径，禁止全部打成 chat
- 代码：
  - wan2.7：`/images/generations`，字面 `size=1K/2K/4K`；禁止 2K 误切 chat
  - HappyHorse：`POST /videos`，SKU 必须带 `-5s/-10s`，body `duration` 与 SKU 匹配；`ratio` + `720P`
  - 前端：HappyHorse 不进 Grok 档位菜单；wan-pro 可选 4K
- 生产 DB（已配，不依赖本 commit）：
  - Chat：仅启用 `qwen3.8-max-preview`（其余 qwen 档位已停用）；另有 `glm-5.2` / `deepseek-v4-pro`
  - wan2.7-image / wan2.7-image-pro：`strategies.image.generate=openai_images`
  - HappyHorse：6 个 SKU profile 已启用
- 网关：`https://newapi.haodeya.xyz/v1`；`qwen3.8-max-preview` 探测 200
- 部署需重建：**frontend + backend + worker**（无新 Alembic）
- 关键文件：`task_executor.py`、`provider_strategy.py`、`haodeya_grok_video.py`、`happyHorseVideoUtils.ts` 等
- Safe to hand off: **部署完成后 Yes**

### [2026-07-25] 用量日志单行 + 能力/参数展示 — **已上生产**
- Git：**`8809239`**（产品代码）；文档基线曾至 `1a92599`
- Alembic：**`o6p7q8r9s0t1` (head)**
- 归档：`docs/archive/deploy-2026-07-25-usage-logs-summary.md`
- Safe to hand off: **Yes**

### [2026-07-24] Studio ↔ Canvas 联动 + 图生图「遵循原图」— **已上生产**
- Git 含：`f057dff`（`studioCanvasLinkage.ts`）、`aff7bda`（编辑模式默认遵循原图 / 上游省略 `aspect_ratio`）
- 约定：改比例选项/默认值/workflow 映射只改 `frontend/src/features/studio/studioCanvasLinkage.ts`
- 画布 `img2img` ↔ 生成页「图像编辑」；`upscale` / `upload` / `annotate` 为画布侧专用
- Safe to hand off: **Yes**

<!-- 更早条目见 docs/archive/handoff-2026-07-21-stale-entries.md；deploy-2026-07-20 -->
