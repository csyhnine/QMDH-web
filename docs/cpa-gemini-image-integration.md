# CPA 链路 · gemini-3.1-flash-image（QMDH 对接说明）

Last updated: `2026-06-22`

本文说明 QMDH 如何对接 **CPA / Antigravity** 链路上的 `gemini-3.1-flash-image`，以及与 **OpenRouter（qmdh）** 链路的区别。

## 两条链路不要混用

| 项 | CPA / Antigravity | OpenRouter（qmdh） |
| --- | --- | --- |
| 模型 ID | `gemini-3.1-flash-image` | `google/gemini-3.1-flash-image-preview` |
| 网关 Base URL | `https://newapi.haodeya.xyz/v1` | OpenRouter / 自有 qmdh 渠道 |
| QMDH 请求策略 | `chat_completions_image` | `chat_modalities_image` |
| 生图接口 | `POST /v1/chat/completions` | 同上（带 `modalities` + `image_config`） |
| 图片位置 | `choices[0].message.images[]` | 同上或 `content[]` |
| 计费 | 按 Token（上游 New API 倍率） | 可按张（平台配置） |

在 QMDH 后台应 **单独建 Provider**，不要与 OpenRouter 模型共用同一条配置。

## QMDH 后台配置示例（CPA）

1. **Provider 名称**：例如 `cpa_gemini_3_1_flash_image`（任意，仅内部标识）
2. **Base URL**：`https://newapi.haodeya.xyz/v1`（不要带 `/chat/completions`）
3. **Model Name**：`gemini-3.1-flash-image`（无 `google/` 前缀，无 `-preview`）
4. **Capabilities**：勾选 `image.generate`（如需参考图编辑再勾 `image.edit`）
5. **API Key**：CPA 渠道下发的下游 Key
6. **Strategies**（可选，留空时 QMDH 会自动识别）：
   ```json
   {
     "image.generate": "chat_completions_image",
     "image.edit": "chat_completions_image_edit"
   }
   ```
7. **计费**：CPA 为 Token 扣费，勿按「每张固定价」理解；可在 Provider 上按实际合同配置 `pricing_unit` / 单价，或结合 `usage` 字段人工核对。

## QMDH 执行层行为

- 自动走 `POST {base_url}/chat/completions`
- 请求体含 `model`、`messages`、`max_tokens: 4096`，**不带** `modalities` / `image_config`
- 宽高比通过 prompt 追加 `Aspect ratio: 16:9.` 等文本提示
- 响应优先解析 `message.images[].image_url.url`（支持 `data:image/...;base64,...`）
- **不会**调用 `/v1/images/generations`（CPA 上会 400）

## 探测（Probe）

模型管理里点「探测」时，QMDH 会对 CPA 模型发最小 `chat/completions` 请求，而不是 images API。

## 常见错误

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 400 + not supported on `/v1/images/generations` | 策略误为 `openai_images` | 确认 model 为 `gemini-3.1-flash-image`，或显式设 `chat_completions_image` |
| 200 但任务失败「no image data」 | 只解析了 `content` | 上游应返回 `message.images`；QMDH 已支持 |
| 用了 `google/gemini-...-preview` | 走错 OpenRouter 策略 | CPA 必须用无 `google/` 的模型名 |

## 相关代码

- 策略：`backend/app/services/provider_strategy.py` → `chat_completions_image`
- 请求构建：`backend/app/services/task_executor.py` → `_build_chat_completions_image_plan`
- 响应解析：`backend/app/services/task_executor.py` → `_extract_image_data`
