# Handoff 2026-07-26 — HappyHorse 通线 + Admin UX + Studio 默认

## Status

**CLOSED / Safe to hand off** — 工作区干净；GitHub / 生产对齐 **`9fff78f`**。

## 本会话交付（按时间）

1. **HappyHorse i2v 复测**（配额恢复后）
   - 生产容器内固定最小 body 直打上游 **1 次有效** → **completed**
   - `task_id`: `task_2ngmWnoNnI5ASioE3folcgheW7yse92i`
   - 详情：`docs/archive/handoff-2026-07-25-happyhorse-i2v-media-quota.md`

2. **部署 `size: 1280*720`** — commit **`6dedbf2`**（backend/worker）

3. **Admin Models UX** — commit **`4c32d90`**（frontend + `providers.py` 视频导入默认）

4. **Studio 默认** — commit **`9fff78f`**
   - 图像分辨率默认 **1K**（冷启动套模板不覆盖分辨率）
   - 视频模式 / 画布视频节点默认优先 **HappyHorse**
   - 新建提示词模板后端默认 resolution `1k`

## 生产合同（HappyHorse，仍有效）

- `POST /v1/videos`；轮询 `GET /v1/videos/{task_id}`
- 顶层 `size` = `1280*720`（**不要**写 `720P`）
- `720P` 只放 `metadata.parameters.resolution`
- i2v：`metadata.input.media[].type = first_frame`
- r2v：`type = reference_image`（最多 9）
- 适配器：`backend/app/services/provider_adapters/haodeya_grok_video.py`
- **禁止**再扫请求体变体把配额打空

## 运维备忘

- 生产：`https://cityusbdisk.cn`；服务器 `120.79.227.11`；路径 `/www/wwwroot/qmdh-web`
- Deploy：`git pull`（admin）+ `docker compose up -d --build …`
- Hard rule：未经用户明确同意禁止 push / 生产部署

## 可选后续（非阻塞）

- `hh-i2v-004`：试错 Key 与线网 Key 分离
- Admin：探测列表里 HappyHorse/Grok SKU 变体标「勿导入，用单入口」
- 模板分类治理（若继续做竞品对齐，先产品枚举，勿盲目全量刮取）
