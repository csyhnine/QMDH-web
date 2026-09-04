# Handoff — 2026-09-04 Haodeya 文档核对 + Grok 多参考图 hotpatch 验收

Date: **2026-09-04**  
Branch: **`hotfix/grok-ref-download-001`**（基于 `origin/main`；**未 merge main / 未 push**）  
Production: **`https://cityusbdisk.cn`** — hotpatch 已 **docker cp** 到 backend + worker×3（2026-09-03）；服务器 git **未 pull**  
Safe to hand off: **Yes**

## 一句话

对照 Haodeya 文档 v2（2026-08-26）核对协议/body **无实质改动项**；Grok 多参考图 `image_download_interrupted` 已通过 inline data URL hotpatch 修复，生产任务 **5858** 验收成功。

## Haodeya 文档核对结论

文档：[https://newapi.haodeya.xyz/docs](https://newapi.haodeya.xyz/docs)（v2 · 2026-08-26）

| 区域 | 结论 |
|------|------|
| Seedance 2 六 SKU + `image_with_roles` + 入库 API | 与代码一致 |
| `gpt-image-2-vip` 异步 + 轮询 + `size` 必填 | 与代码一致；生产已 enable |
| Grok 图像/视频 body 格式 | 与代码一致 |
| VIP 4K | **不接**；无需改动 |
| Seedance Fast | Studio 已通过统一 `seedance-2` 暴露 `seedance-2-fast-720p-*` SKU；文档中 `doubao-seedance-2.0-fast`（Token 线）前端刻意隐藏，非日常 Fast |

**无需因文档更新改代码。**

## Grok 多参考图 hotpatch

### 根因（任务 5846）

- Provider：`x-ai/grok-imagine-image-2.0`
- xAI 拉 `cityusbdisk.cn/media/...` 参考图时 `image_download_interrupted`（URL 外部 curl 200，上游拉取不稳定）
- 非润色 500、非 payload 字段写错

### 修复

- 文件：`backend/app/services/task_executor.py`
- 本地可读参考图 → `image_urls` 写 **inline base64 data URL**（`reference_image_mode=haodeya_grok_image_inline`）
- 测试：`backend/tests/test_haodeya_grok_image.py`（10 passed）

### 生产验收（DB 2026-09-04 核对）

| 任务 | 时间 (UTC) | 状态 | reference_image_mode |
|------|------------|------|----------------------|
| 5846 | 2026-09-03 08:31 | failed | （hotpatch 前） |
| 5858 | 2026-09-03 08:58 | **completed** | `haodeya_grok_image_inline` |

全库近期：3 条 HTTPS 模式成功 + 1 条 inline 模式成功；hotpatch 后无新 Grok 生图失败。

### 部署方式

- SSH `120.79.227.11` → `docker cp task_executor.py` → backend + worker → `docker compose restart backend worker`
- **未** git pull / 全量 rebuild

### 后续可选（非阻塞）

- merge `hotfix/grok-ref-download-001` → main + 正式 deploy 固化镜像
- 长期：nginx `/media` 直出或 OSS CDN（文档推荐路径；也缓解 Seedance image-rewrite 502）

## 关键文件

| 区域 | 路径 |
|------|------|
| Grok 生图 body | `backend/app/services/task_executor.py` |
| Seedance/Grok 视频 | `backend/app/services/provider_adapters/haodeya_grok_video.py` |
| 入库 | `seedance_private_avatar.py` / `seedance_real_avatar.py` |
| 测试 | `backend/tests/test_haodeya_grok_image.py` |

## 纪律（续作前）

- 未经用户同意 **禁止 push/deploy**
- 符号主题 WIP 在 **`stash@{0}`**（分支 `wip/canvas-symbol-theme`，message `wip-symbol-theme-pause-for-grok-hotfix`）；续做前切回该分支并 `git stash pop`
- stash 涉及 ~23 文件（canvas 符号工作流、`symbol_workflow_service.py`、`CanvasWorkspace.tsx` 等）；**勿与 hotfix 分支改动混 commit**
- **勿动** 生产 `prompt_polish_service.py` / `prompt_polish.py` hotpatch

## 下一对话推荐路径

1. **默认**：`git checkout wip/canvas-symbol-theme` → `git stash pop` → 继续符号主题画布 WIP
2. **可选**：在 `hotfix/grok-ref-download-001` commit + merge Grok hotfix（生产已 hotpatch）
3. **可选**：`studio-perf-001~004`（卡顿/nginx/分页/lazy-load）

## 待办索引

见 `docs/tasks.md` → **Active Blockers / Near-term TODO（2026-09-04）**
