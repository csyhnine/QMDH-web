# Haodeya 图像模型配置与 1K/2K 路由（留档）

Last updated: `2026-07-01`  
生产基线：`main` @ `0090a2a` + **热补丁**（见下文）  
网关：`https://newapi.haodeya.xyz/v1`

> **换设备接手**：先读本文 → `docs/cpa-gemini-image-integration.md` → 代码 `backend/app/services/task_executor.py`（`_resolve_haodeya_upstream_model`、`_build_upstream_image_config`、`_should_use_chat_modalities_plan_for_2k`）。

---

## 1. 后台两条 Provider（产品真相）

设计师在 Studio **选哪条 Provider，就走哪条 Haodeya 渠道**，执行层**不得**把 PRO 偷偷改成 preview。

| 后台显示名 | Profile `model_name` | Haodeya 渠道 | 用途 |
| --- | --- | --- | --- |
| **Nano Banana PRO** | `gemini-3.1-flash-image` | **9** | 1K + 2K（2026-07 上游已支持渠道 9 真 2K） |
| **Nano Banana 2** | `google/gemini-3.1-flash-image-preview` | **3** | 备用 preview 线路 |

两条可并存；**不要**合并成一条 Profile 再靠代码换 model。

---

## 2. QMDH 执行层规则（当前代码）

### 2.1 上游 model 映射（`_resolve_haodeya_upstream_model`）

- **CPA / PRO**（`gemini-3.1-flash-image`）：1K 与 2K **同一**上游名 `gemini-3.1-flash-image`，**不**加 `-2k`，**不**改写成 `preview`。
- **Preview / Nano Banana 2**：保持 `google/gemini-3.1-flash-image-preview`。
- **GPT**（`openai/gpt-5.4-image-2`）：1K 用基名；**2K 必须** `openai/gpt-5.4-image-2-2k`，并带 `image_config.image_size: "2K"` + modalities（渠道 3，2026-07 上游说明）。
- 可选覆盖：Provider `adapter_config` 的 `upstream_model_1k` / `upstream_model_2k`。

### 2.2 请求体（`POST /v1/chat/completions`）

**PRO 1K**

```json
{
  "model": "gemini-3.1-flash-image",
  "messages": [{ "role": "user", "content": "…\n\nAspect ratio: 16:9." }],
  "max_tokens": 4096,
  "stream": false
}
```

**PRO 2K**（与 Haodeya 2026-07 渠道 9 规范一致）

```json
{
  "model": "gemini-3.1-flash-image",
  "messages": [{ "role": "user", "content": "生成一张 16:9 赛博朋克城市夜景" }],
  "modalities": ["text", "image"],
  "max_tokens": 8192,
  "image_config": {
    "aspect_ratio": "16:9",
    "image_size": "2K"
  },
  "stream": false
}
```

注意：

- Haodeya 上 `image_config` **仅 snake_case**（不要 `aspectRatio` / `imageSize`）。
- 2K 在 Haodeya 会切 `chat_modalities` 计划（内部 `request_strategy` 可能显示 `chat_modalities_image`）。

### 2.3 内部计价（可选）

Provider `adapter_config`：

```json
{
  "unit_price_1k": 0.64,
  "unit_price_2k": 0.98
}
```

`result.billing.resolution_tier` 反映 Studio 档位，与上游渠道无关。

---

## 3. 踩坑记录（实测）

| 尝试 | 结果 | 教训 |
| --- | --- | --- |
| 2K 发 `gemini-3.1-flash-image-2k` | 200 但 16:9 仍 **1376×768** | 不要靠 `-2k` 后缀 |
| 2K 发 `google/gemini-3.1-flash-image-preview-2k` | **400** invalid model | 租户未开通 |
| 2K 发 `openai/gpt-5.4-image-2` 且无 `-2k` | 可能空图 / 不计 2K 价 | **必须** `openai/gpt-5.4-image-2-2k` + `image_size:2K` |
| 2K 发 `gpt-image-2-vip-2k` | **503** ChannelCapability | VIP 用 `gpt-image-2-vip` + `resolution:2k` |
| PRO 1K/2K **强行**改发 `preview` | 渠道 **3**，与后台 PRO 配置冲突 | **尊重 Profile model** |
| PRO 2K 渠道 9 + 正确 `image_config`（任务 #947，18:34） | 当时 **1408×768** | 当时上游渠道 9 未就绪；**2026-07 上游称已支持** |
| PRO 2K 走 preview（任务 #943，18:15） | **2752×1536** | preview 线路一直能 2K，但不是 PRO 渠道 |

---

## 4. 验收清单

| 场景 | Haodeya 渠道 | 上游 model | 16:9 像素 |
| --- | --- | --- | --- |
| PRO 1K | 9 | `gemini-3.1-flash-image` | **1376×768** |
| PRO 2K | 9 | `gemini-3.1-flash-image` | **2752×1536** |
| Nano Banana 2 · 2K | 3 | `google/gemini-3.1-flash-image-preview` | **2752×1536** |

排查字段：`tasks.result.upstream_request`、`output_width` / `output_height`、`image_model_resolved`。

---

## 5. 生产部署记录（2026-07-01）

已对 `120.79.227.11` / `cityusbdisk.cn` 热补丁（**容器内**，Git 磁盘可能仍为 `0090a2a`）：

| 文件 | 内容 |
| --- | --- |
| `task_executor.py` | Haodeya 映射、2K `image_config`、分档计价 |
| `bigjpg_upscale.py` | CDN `octet-stream` 时按文件头存 png/jpg |
| `schemas.py` | 建号/重置密码最短 **4** 位 |

操作：`docker cp` → backend + worker → `docker compose restart backend worker`。

**注意**：容器 rebuild 后热补丁会丢，需 merge 进 Git 并 `docker compose build backend worker`。

---

## 6. 相关代码与测试

- `backend/app/services/task_executor.py`
- `backend/tests/test_task_executor_openai.py`（`-k haodeya`）
- `backend/tests/test_task_executor_bigjpg_upscale.py`
- `frontend/src/api.ts`（422 校验错误可读化，建号失败不再显示 `[object Object]`）

```bash
cd backend
python -m pytest tests/test_task_executor_openai.py -q -k haodeya
```

---

## 7. 与 Chat / 多 Agent / VIP 异步的边界

- **Gemini/GPT 同步线**：上文 §1–§6
- **GPT-Image-2-VIP 异步线**（`haodeya_async_image`）：见 **[`haodeya-gpt-image-vip-async-2026-07.md`](haodeya-gpt-image-vip-async-2026-07.md)**
- Chat B1、gov-001、multi-agent：见 `docs/handoff.md` 与 `docs/tasks.md`，**勿与 VIP 改动混提交**
