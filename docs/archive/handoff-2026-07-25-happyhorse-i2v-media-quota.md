# Handoff 2026-07-25 — HappyHorse i2v media 映射与配额

## Status

**UNBLOCKED / media OK** — 2026-07-26 14:42 UTC+8 生产固定样例复测 **completed**（第 1 次有效提交）。

- `task_id`: `task_2ngmWnoNnI5ASioE3folcgheW7yse92i`
- 终态：`status=completed`，`progress=100`，有 `metadata.url` 视频地址
- 下一步：commit/deploy 本地 `size: 1280*720`（须用户批准）→ Studio smoke

## Goal

确认 `POST /v1/videos` + `metadata.input.media`（`first_frame`）在上游新镜像下是否已通；通了再部署本地 `size: 1280*720` 适配改动。

## Upstream contract（已确认）

- 路径仍：`POST https://newapi.haodeya.xyz/v1/videos`
- 轮询：`GET /v1/videos/{task_id}`
- 入参：`/v1/videos` + `metadata.input.media`（本网关无可用 `/wan/api/...` 透传）
- 顶层 `size`：宽×高，如 `1280*720`（**不要**写 `720P`）
- 分辨率档：`metadata.parameters.resolution` = `720P`
- i2v：`media[].type = first_frame`，`url` 公网 HTTPS 或 Base64
- r2v：同机制，`type = reference_image`（最多 9）
- 上游称：旧镜像入站有 media、出站丢掉；已升级，需用**新 task_id** 验证

## 最小成功样例（重置后只用这一份，打 1～2 次）

```json
{
  "model": "happyhorse-1.1-i2v-5s",
  "prompt": "让女孩起舞，天空下起雨来；",
  "duration": 5,
  "size": "1280*720",
  "metadata": {
    "input": {
      "prompt": "让女孩起舞，天空下起雨来；",
      "media": [
        {
          "type": "first_frame",
          "url": "https://qmdh-media.oss-cn-shenzhen.aliyuncs.com/generated/wan2.7-image/20260725-115235-给女孩换件衣服-背景不变-7412.png"
        }
      ]
    },
    "parameters": {
      "resolution": "720P",
      "duration": 5
    }
  }
}
```

回传要求：`task_id` + completed/failed 原文。

## 已发生事实

### 生产失败（业务）

- 任务 `#2577`–`#2580`（provider `haodeya_happyhorse`，SKU `happyhorse-1.1-i2v-5s`）
- 终态错误：`Field required: input.media` / `InvalidParameter`
- 首帧 OSS URL `HEAD` → 200（公网可达）

### 生产 HEAD / 代码

- 生产 Git 曾至 **`d2a0c98`**：`metadata.input.media` + 当时顶层 `size: "720P"`（**不符合**现合同，待改）
- 本地未部署改动：顶层改为 `size: "1280*720"`（`haodeya_grok_video.py` + 单测），**等复测成功后再 commit/deploy**

### 探测结论（配额消耗前）

- 同 Key：**t2v 可 completed**；**i2v 多种 body 均异步报缺 `input.media`**（旧镜像时期）
- `size: "720P"` 时 t2v 创建即：`convert_to_ali_request_failed: invalid size: 720P, example: 1920*1080`
- `/wan/api/v1/.../video-synthesis` 在本网关不可用（HTML/404）
- 复测最小样例（`size: 1280*720`）时连续 **HTTP 429**：`当前分组上游负载已饱和` / 配额打满 — **未拿到新 task_id**
- 复测位置：生产机 `120.79.227.11` 容器内读 `haodeya_happyhorse` Key 直打网关（**非本机未接入**）

## 纪律（上游明确）

1. 重置前 **禁止** 再打 i2v
2. 重置后固定 body **1～2 次**，看清成败再改代码
3. **禁止**再扫变体把配额打空
4. 正式量：多 Key / 多档位，或试错与线网 Key 分离

## 复测结果（2026-07-26）

- 位置：生产机容器内，`haodeya_happyhorse` Key，`POST https://newapi.haodeya.xyz/v1/videos`
- 次数：固定 body **1 次**（另有 1 次 URL 误拼 `/v1/v1/videos` → 404，未进任务）
- `task_id`: `task_2ngmWnoNnI5ASioE3folcgheW7yse92i`
- 提交：`status=queued` → 轮询 → **`status=completed`**, `progress=100`
- 终态原文要点：`metadata.url` 指向 dashscope OSS 720p mp4

## Next steps

1. ~~固定样例复测~~ **DONE / completed**
2. 用户批准后：commit + deploy 本地 `size: 1280*720`
3. Studio 生产 smoke 一条 i2v（`hh-i2v-003`）

## Related code

- `backend/app/services/provider_adapters/haodeya_grok_video.py` — `_build_happyhorse_request_body`
- `backend/tests/test_task_executor_haodeya_grok_video.py` — `HappyHorseVideoBodyTests`
- Studio payload：`frontend/src/features/studio/happyHorseVideoUtils.ts`
