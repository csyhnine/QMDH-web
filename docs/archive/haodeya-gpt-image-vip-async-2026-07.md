# Haodeya GPT-Image-2-VIP 异步生图对接（留档）

Last updated: `2026-07-16`  
网关（我们唯一对接的上游）：`https://newapi.haodeya.xyz/v1`  
状态：**代码已在生产镜像（`186b127`）；Admin Provider 未建 → 可立即配置接入；Studio 真实联调待做**

> **换设备接手**：先读本文 → [`haodeya-image-model-routing-2026-07.md`](haodeya-image-model-routing-2026-07.md)（Gemini/GPT 同步线路）→ 代码 `backend/app/services/task_executor.py`（`haodeya_async_image` 相关函数）。  
> **2026-07-16**：异步默认判定已收紧，仅 `gpt-image-*-vip` / 显式 async 走 VIP；**可以接 GPT-VIP Provider，不会再误路由 Gemini。**

---

## 1. 产品边界

| 项 | 说明 |
| --- | --- |
| **我们对接谁** | 仅 **Haodeya API**（`newapi.haodeya.xyz`） |
| **ToAPI** | Haodeya 的上游供应商；**我们不直连、不配置 `toapis.com`**，后期可能更换 |
| **Studio 分辨率** | 当前仅 **1K / 2K**；4K 代码预留，UI 未开 |
| **计费（我们日志/看板）** | 与现有 GPT 合同价对齐：**1K ¥1.62 / 2K ¥2.67**（不是 Haodeya default 组低价） |

---

## 2. Admin Provider 配置

| 字段 | 建议值 |
| --- | --- |
| `provider_name` | 自定，如 `haodeya_gpt_image_vip` |
| `model_name` | `gpt-image-2-vip`（1K 基准名；执行层按分辨率解析实际上游 model） |
| `base_url` | **`https://newapi.haodeya.xyz/v1`**（只到 `/v1`，不要带 `/images/generations`） |
| `capabilities` | `image.generate`, `image.edit` |
| `quality` | `high` |
| `timeout_seconds` | `600`（VIP 单次约 90–150s，留轮询余量） |
| `reference_mode` | `disabled`（有参考图走 `image_urls`，不要 caption 拼 prompt） |
| `strategies` | 可不填；检测到 VIP 模型或 Haodeya 网关后自动用 `haodeya_async_image` |

可选 `adapter_config`：

```json
{
  "provider_flavor": "haodeya_async_image",
  "unit_price_1k": 1.62,
  "unit_price_2k": 2.67,
  "upstream_model_1k": "gpt-image-2-vip",
  "upstream_model_2k": "gpt-image-2-vip",
  "upstream_model_4k": "gpt-image-2-vip-4k",
  "poll_path_template": "/images/generations/{task_id}"
}
```

---

## 3. 上游协议（Haodeya 2026-07-03 确认）

### 3.1 调用形态：异步

1. `POST {base_url}/images/generations` → 响应里拿 `id`（task_id）
2. `GET {base_url}/images/generations/{task_id}` → 轮询至 `status: completed`
3. 取图：**`result.data[0].url`**

**轮询完整 URL（我们代码拼法）：**

```
GET https://newapi.haodeya.xyz/v1/images/generations/{task_id}
```

`task_id` 来自 POST 响应字段 `id`（也兼容 `task_id` / `job_id`）。  
若 POST 响应带 `polling_url`，优先用该 URL（须仍是 Haodeya 网关）。

**禁止**走 `/v1/tasks/{task_id}` 等其他路径（2026-07-03 上游明确要求；代码已去掉 404 回退）。

### 3.2 下载结果图（必做）

`result.data[0].url` 常指向 `https://files.toapis.com/...`。下载时必须带非空 UA：

```
User-Agent: Go-http-client/1.1
```

（`Mozilla/5.0` 亦可。）**禁止** Python-urllib 默认 UA / 空 UA，否则 Cloudflare **1010 → HTTP 403**，表现为「下载生成结果失败：上游拒绝了当前凭证或权限」。

注意：创建任务与轮询成功、余额已扣时，若仅下载 403，**改 UA 重下同一 url**，勿盲目重提任务重复扣费。结果链接有 `expires_at`，尽快下载。

代码：`task_executor._download_generated_image`（`_DOWNLOAD_USER_AGENT`）。

---

### 3.3 请求体

**1K 文生图：**

```json
{
  "model": "gpt-image-2-vip",
  "prompt": "...",
  "size": "16:9",
  "resolution": "1k",
  "quality": "high",
  "response_format": "url",
  "n": 1
}
```

**2K（临时，`-2k` SKU 网关还在修）：**

```json
{
  "model": "gpt-image-2-vip",
  "prompt": "...",
  "size": "16:9",
  "resolution": "2k",
  "quality": "high",
  "response_format": "url",
  "n": 1
}
```

> **注意**：2026-07-03 上游要求 2K **暂用** `gpt-image-2-vip` + `resolution: "2k"`，**不要**发 `gpt-image-2-vip-2k`。等 Haodeya 修好 `-2k` SKU 后，再改 `_resolve_haodeya_async_upstream_model` 切回分模型名。

**4K（未在 Studio 开放，代码预留）：**

```json
{
  "model": "gpt-image-2-vip-4k",
  "resolution": "4k"
}
```

**图生图参考图：**

```json
{
  "image_urls": ["https://cityusbdisk.cn/media/..."]
}
```

- 必须 **HTTPS 公网 URL**；不支持 base64
- 本地路径会通过 `resolve_public_media_url` 转成公网 URL（依赖 `public_media_base_url` 配置）

### 3.4 画幅 `size`

- 传 **比例字符串**（如 `16:9`、`1:1`），**不是**像素 `1024x1024`
- 来自 Studio `aspect_ratio`，经 `resolve_image_aspect_ratio` 解析

### 3.5 model 与 resolution 必须一致

| Studio 档位 | 当前实际上游 `model` | body `resolution` |
| --- | --- | --- |
| 1K | `gpt-image-2-vip` | `1k` |
| 2K | `gpt-image-2-vip`（临时） | `2k` |
| 4K | `gpt-image-2-vip-4k`（未开放） | `4k` |

Haodeya 网关按 **model 名** 扣费；我们日志按 `unit_price_1k/2k` 分档计价。

---

## 4. QMDH 执行层（代码）

### 4.1 策略名

- **`haodeya_async_image`**（`provider_strategy.py`）
- 内部 `adapter_mode`: `haodeya_async_image`
- 自动识别条件：`newapi.haodeya.xyz` in base_url **或** model 含 `gpt-image-2-vip`

### 4.2 关键函数（`task_executor.py`）

| 函数 | 作用 |
| --- | --- |
| `_uses_haodeya_async_image_gateway` | 判断是否走 VIP 异步线路 |
| `_build_haodeya_async_image_plan` | 组 POST body（size/resolution/model/image_urls） |
| `_resolve_haodeya_async_upstream_model` | 1K/2K → 同一 model；4K → `-4k` 后缀 |
| `_haodeya_async_poll_url` | 拼轮询 URL |
| `_poll_haodeya_async_image_result` | 轮询 + 解析 `result.data[0].url` |
| `_reference_image_to_public_url` | 参考图转 HTTPS 公网 URL |

### 4.3 与现有 Haodeya 线路的区别

| | Gemini / GPT 同步线（Haodeya） | VIP 异步线 |
| --- | --- | --- |
| 策略 | `chat_completions_image` / `chat_modalities_image` | `haodeya_async_image` |
| 端点 | `POST /chat/completions` | `POST /images/generations` + GET 轮询 |
| 1K/2K 区分 | 同一 model + `image_config.image_size` | **resolution 字段**；2K 暂不换 model 名 |
| 参考图 | caption / chat 多模态 / native edits | **`image_urls`** |

有参考图的 `image.generate` **不会**自动切到 `image.edit` / `images/edits`（与 OpenAI native edit 行为不同）。

### 4.4 日志与 ProviderCall

- `ProviderCall.model_name` 记录 **实际上游 model**（如 `gpt-image-2-vip`）
- 任务失败时看 `tasks.result.request_diagnostics.request_url`（POST URL）及错误里的 **完整 poll URL**

---

## 5. 踩坑记录

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 轮询 404 `Invalid URL (GET /v1/images/generations/...)` | 早期代码 404 时会回退 `/v1/tasks/{id}`；或 Admin `base_url` 不是 `newapi.haodeya.xyz` | 已去掉 tasks 回退；确认 base_url |
| 配置了 `toapis.com` | 我们不对接 ToAPI 直连 | 改为 `newapi.haodeya.xyz` |
| 2K 发 `gpt-image-2-vip-2k` | Haodeya `-2k` SKU 未就绪 | 已改为 base model + `resolution: 2k` |
| 参考图失败 | 用了 base64 或非 HTTPS | 必须公网 HTTPS URL |

---

## 6. 测试

```bash
cd backend
python -m pytest tests/test_task_executor_toapis_image.py -q
```

覆盖：1K 提交与轮询、2K model 临时规则、`result.data[0].url` 解析、参考图 `image_urls`、仅走 `/images/generations/{id}` 轮询。

文件名仍含 `toapis` 为历史命名；测的是 **Haodeya VIP 异步** 行为。

---

## 7. 本地验证清单（部署前必做）

1. `start-dev.cmd` → 后端 `18010` / 前端 `18080`
2. Admin 建 Provider（见 §2），填入有效 Haodeya Key
3. Studio 选 VIP 渠道：**1K、2K 各一张**；有参考图时再测 `image_urls`
4. 验收：`tasks.status=completed`、有图、`billing.resolution_tier` 正确、日志 model 为 `gpt-image-2-vip`

---

## 8. 部署说明

- **代码已随 2026-07-16 部署进生产**（Git `186b127`，含 VIP 异步 + 误路由热修）
- **无新 migration**；开通方式 = Admin 新建 Provider，无需再发版（除非改协议）
- 开通后 smoke：1K VIP 生图 + 看板成本 1.62；再测 2K；确认 Gemini / 普通 gpt-image-2 仍非异步

---

## 9. 待办（接班人）

- [ ] Admin 建 Provider（见 §2）+ 有效 Key
- [ ] Studio 真实联调：1K + 2K（有参考图再测 `image_urls`）
- [ ] 确认 Gemini / 普通 gpt-image-2 路由未回归
- [ ] Haodeya 通知 `-2k` SKU 修好后：恢复 2K → `gpt-image-2-vip-2k` + `resolution: 2k`（见正文注意）
- [ ] 4K：上游价确认 + Studio UI 档位 + `unit_price_4k`

---

## 10. 相关文件

| 路径 | 说明 |
| --- | --- |
| `backend/app/services/task_executor.py` | 执行与轮询 |
| `backend/app/services/provider_strategy.py` | `haodeya_async_image` 策略 |
| `backend/app/routers/providers.py` | Provider 探活请求体 |
| `backend/app/services/haodeya_pricing.py` | `gpt-image-2-vip` 合同价同步项 |
| `backend/tests/test_task_executor_toapis_image.py` | 单元测试 |
| `frontend/src/features/studio/studioConstants.ts` | Studio 仅 1K/2K 选项 |

---

## 11. 与其他轨道的边界

- **Agent multi-chat WIP**：分支 `wip/agent-multi-chat-2026-07`，与 VIP 生图**分开** commit/部署
- **Gemini/GPT 同步 Haodeya 线**：见 [`haodeya-image-model-routing-2026-07.md`](haodeya-image-model-routing-2026-07.md)
- **usage_ledgers 双层日志**（task.finalized + provider_call）：设计行为，见 `usage_ledger.py`；汇总成本默认只计 task 层
