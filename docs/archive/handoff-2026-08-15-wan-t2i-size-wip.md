# Handoff — wan2.7 文生图 size 丢失比例（WIP，未部署）

**日期：** 2026-08-15  
**状态：** 本地有未提交改动；生产仍 buggy；**下一对话须先复查再 commit/部署**

---

## 背景（对话已变乱，以此为准）

本线程先后讨论了：

1. Haodeya 图生图「遵循原图 / 匹配比例」文案与提示（部分已上生产 `f98fae1`）
2. 同批测试里 wan2.7 出图 1024×1024，而其他模型 16:9 正常

**曾出现的错误结论（勿再重复）：**

- ❌ 误以为测试用的是图生图 +「遵循原图」
- ❌ 把 wan 方图 solely 归因于 tier_only / 参考图逻辑

**经生产库核实后的正确事实：**

- 测试为 **文生图**（`workflow.key = image-generate`）
- 用户手动选择 **16:9 + 标准 1K**，不是「遵循原图」或「匹配比例」
- payload 里 `aspect_ratio=16:9`、`resolution=1k` **已正确入库**
- 问题在 **组装 Haodeya 上游请求** 时 wan 线路 **未把 16:9 写进 `size`**

---

## 生产证据（2026-08-15 00:13 同批，PostgreSQL `tasks`）

| id   | requested_provider       | workflow       | aspect_ratio | resolution | output (WxH) |
|------|--------------------------|----------------|--------------|------------|--------------|
| 3939 | doubao-seedream-5.0-lite | image-generate | 16:9         | 1k         | 2560×1440    |
| 3940 | gemini-3.1-flash-image   | image-generate | 16:9         | 1k         | 1376×768     |
| 3941 | gpt-image-2-count        | image-generate | 16:9         | 1k         | 1536×1024    |
| 3942 | wan2.7-image             | image-generate | 16:9         | 1k         | **1024×1024** |
| 3943 | wan2.7-image-pro         | image-generate | 16:9         | 1k         | **1024×1024** |

复查 SQL（生产 docker postgres）：

```sql
SELECT t.id, t.requested_provider,
       t.payload->>'aspect_ratio', t.payload->>'resolution',
       t.result->>'output_width', t.result->>'output_height',
       w.key
FROM tasks t
JOIN workflows w ON w.id = t.workflow_id
WHERE t.id BETWEEN 3939 AND 3943;
```

生产容器内 `_wan_image_size`（2026-08-15 实测）仅返回字面量 `1K/2K/4K`，**忽略 `aspect_ratio`**。

---

## 根因

| 提交 | 变化 |
|------|------|
| `4edaaec` | 引入 `_wan_pixel_size_for_aspect`：文生图具体比例 → WxH（如 16:9+1K → `1024x576`） |
| `d547a12` | wan 改走 multipart `/images/edits` 时 **误删** 上述逻辑，改为只发 `1K/2K/4K` |

Haodeya wan **无独立 `aspect_ratio` 字段**，比例必须体现在 `size`（字面量 tier 或 `WxH` 像素）。

同批其他模型对比：

- count：`size` = `1536x1024`（来自 aspect）
- seedream：`size` = `2560x1440`
- wan（bug）：`size` = `"1K"` → 上游出 1024×1024 方图

---

## 本地未提交改动（`git status` @ HEAD `f98fae1`）

### A. wan 修复（**应优先复查/部署**）

**文件：** `backend/app/services/task_executor.py`

- 恢复 `_WAN_TIER_LONG_EDGE`、`_wan_pixel_size_for_aspect`、扩展 `_wan_image_size`
- 文生图选 **具体比例**（21:9、16:9、3:2、4:3、1:1、3:4、2:3、9:16）→ 按档位算 WxH，**非仅 16:9**
- 「匹配比例 / 遵循原图」→ 仍发字面量 `1K/2K/4K`

**测试：** `backend/tests/test_task_executor_wan_image_size.py`（本地 7 passed）

### B. UI 文案「智能 → 匹配比例」（**与 wan bug 无关，可拆分 commit**）

**文件（frontend + 少量 backend 摘要）：**

- `studioConstants.ts` — `MATCH_ASPECT_RATIO_LABEL`
- `studioPayloadUtils.ts`, `seedanceVideoUtils.ts`, `happyHorseVideoUtils.ts`
- `StudioComposerDisplayMenuPanel.tsx`, `studioCanvasLinkage.ts`
- `usage_ledger.py`, `test_usage_logs.py`, `test_image_aspect_ratio.py`, `image_aspect_ratio.py`

**已上生产（`f98fae1`）：** `studioFollowSourceHint.ts` — 图生图按 provider 一行提示

---

## 生产 / Git 基线

| 项 | 值 |
|----|-----|
| GitHub / 本地 HEAD（已 push 部分） | **`f98fae1`** — per-provider follow-source hint |
| 更早生产热补 | `9ce7dc9` / `dd84fe4` 等（count/VIP follow-source） |
| **wan size 修复** | ❌ 未 commit、未部署 |
| **匹配比例改名** | ❌ 未 commit、未部署 |

---

## 下一对话 — 必做复查清单

### 1. 确认问题仍存在于生产

```bash
# 生产 backend 容器
python -c "import inspect; from app.services.task_executor import _wan_image_size; print(inspect.getsource(_wan_image_size))"
# 期望 bug：仅 return {"1k":"1K",...}
```

或查最近 wan + image-generate + aspect_ratio=16:9 任务的 `output_width×output_height`。

### 2. 确认本地修复

```bash
cd backend
python -m pytest tests/test_task_executor_wan_image_size.py -q
python -m pytest tests/test_image_aspect_ratio.py tests/test_usage_logs.py -q
```

手动 spot-check：

```python
_wan_image_size(profile, {"aspect_ratio": "9:16", "resolution": "1k"})  # → 576x1024
_wan_image_size(profile, {"aspect_ratio": "16:9", "resolution": "1k"}) # → 1024x576
_wan_image_size(profile, {"aspect_ratio": "匹配比例", "resolution": "1k"}) # → 1K
```

### 3. 拆分 commit（建议）

- **Commit 1（fix）：** 仅 `task_executor.py` + `test_task_executor_wan_image_size.py` — wan 文生图 size
- **Commit 2（ui）：** 匹配比例改名 + usage 摘要（可选，与 bug 无关）

### 4. 部署（复查通过后）

```bash
# 生产 /www/wwwroot/qmdh-web
./scripts/deploy-production-hotpatch.sh   # 含 task_executor.py
```

**不必**为 wan fix 单独 rebuild frontend。

### 5. 部署后验收

文生图 + wan2.7-image + **16:9 / 1K**（及其他比例 spot-check）：

- 任务 result：`output_width×output_height` 非 1024×1024（16:9 预期约 1024×576）
- 可选：查 provider_call / 上游 body 中 `size` 为 `1024x576` 而非 `1K`

---

## 仍开放的产品问题（非本 fix 范围）

- 图生图里 wan/seedream 标「遵循原图」但行为是 tier_only — UI 提示 `studioFollowSourceHint.ts` 有部分说明，画布侧无提示
- 「匹配比例」改名未部署，与 wan size bug 独立

---

## Safe to hand off

**No** — 生产 wan 文生图比例 bug 仍在；本地 fix 未 commit。下一 agent 按上表复查后再动 git / 部署。
