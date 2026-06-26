# Archive: Studio 布局 + Gemini CPA 部署 + 创作区 UX（2026-06-22）

本文件归档 2026-06-22 前后对话中的主要改动、部署记录与未提交本地工作。

## 里程碑概览

| 范围 | 状态 | 说明 |
|------|------|------|
| Gemini CPA `gemini-3.1-flash-image` | ✅ 已提交 + **生产已上线** | commit `51aba1b` |
| Studio 历史卡片 1–4 张统一布局 | ⏳ 仅本地 | 未 commit |
| 滚动条贴右 | ⏳ 仅本地 | 未 commit |
| 使用日志 KPI / 双重计费修复 | ⏳ 仅本地 | 未 commit |
| 创作区无效标签移除 | ⏳ 仅本地 | 未 commit |
| 参考图移除按钮 + 文件名列表清理 | ⏳ 仅本地 | 未 commit |

---

## 1. Gemini CPA 适配（已部署生产）

### 问题

模型名 `gemini-3.1-flash-image` 误走 OpenAI `/v1/images/generations`，CPA 网关返回 400。

### 方案

- 新策略：`chat_completions_image` / `chat_completions_image_edit`
- 自动识别无 `google/` 前缀的 gemini flash image 模型
- 请求 `POST /v1/chat/completions`，解析 `message.images[]`
- 与 OpenRouter 的 `google/gemini-3.1-flash-image-preview` **分开 Provider**

### Commit

```
51aba1b fix(providers): CPA gemini-3.1-flash-image 走 chat/completions 策略
```

**包含文件：**

- `backend/app/services/provider_strategy.py`
- `backend/app/services/task_executor.py`
- `backend/app/routers/providers.py`
- `backend/tests/test_task_executor_openai.py`
- `docs/cpa-gemini-image-integration.md`

### 后台配置（生产需人工确认）

| 项 | 值 |
|----|-----|
| Base URL | `https://newapi.haodeya.xyz/v1` |
| Model | `gemini-3.1-flash-image`（无 `google/` 前缀） |
| Capabilities | `image.generate`（编辑再勾 `image.edit`） |
| Strategies（可选） | `{"image.generate":"chat_completions_image"}` |

详细说明：`docs/cpa-gemini-image-integration.md`

---

## 2. 生产部署记录（2026-06-22）

### 目标

**局部更新**：仅 Gemini 后端，跳过 migration、不改 `.env`、不重建 frontend。

### Git

```text
GitHub origin/main: 51aba1b
Server git HEAD:    51aba1b5  (sudo -u admin git pull 成功)
```

### Docker 构建

`docker compose up -d --build backend worker` **失败** — Docker Hub 拉取 `python:3.12-slim` 元数据不稳定（`could not fetch content descriptor … not found`）。

### 实际生效方式：热更新（hotpatch）

通过 `docker cp` 将 3 个 Python 文件写入运行中容器后 `docker compose restart backend worker`：

| 宿主机路径 | 容器路径 |
|-----------|----------|
| `backend/app/services/provider_strategy.py` | `/app/app/services/provider_strategy.py` |
| `backend/app/services/task_executor.py` | `/app/app/services/task_executor.py` |
| `backend/app/routers/providers.py` | `/app/app/routers/providers.py` |

辅助脚本（不提交）：`tmp/hotpatch_gemini_prod.py`、`tmp/verify_gemini_prod.py`

### 部署后验证（2026-06-22）

```text
curl http://127.0.0.1:8080/api/v1/health          → healthy
curl https://cityusbdisk.cn/api/v1/health         → healthy
backend/worker                                    → Up (healthy)
CHAT_COMPLETIONS_IMAGE_STRATEGY                   → chat_completions_image
profile_prefers_chat_completions_image(gemini…)   → True
_build_chat_completions_image_plan (worker)       → present
```

### 部署脚本增强（本地 tmp，未 commit）

`tmp/deploy_prod.py` 新增环境变量：

- `DEPLOY_SKIP_MIGRATIONS=1` — 跳过 alembic
- `DEPLOY_SKIP_ENV_TOUCH=1` — 不修改 `.env`
- `DEPLOY_SERVICES=backend worker` — 仅重建指定服务

### 后续风险

容器 **重建**（`docker compose up -d --build` 且镜像未含新代码）会丢失 hotpatch。建议在 Docker Hub 恢复后执行：

```bash
cd /www/wwwroot/qmdh-web
sudo -u admin git pull origin main
docker compose up -d --build backend worker
```

---

## 3. Studio 历史卡片布局（仅本地，未 commit）

### 需求演进

1. 居中内容列 `--studio-content-max: 920px`
2. 3 张图：上文案 / 下图横向 flex 平铺 / 底操作栏
3. **统一 1、2、3、4 张**为同一逻辑（移除旧「左文右图」侧栏）
4. 滚动条应贴主栏最右（去掉 `.canvas-studio-layout` 水平 padding）

### 关键 CSS 变量

```css
--studio-feed-gallery-max-h: min(340px, calc((100vh - var(--studio-dock-reserved) - 24px) / 2 - 120px));
```

### 关键文件

- `frontend/src/styles.css` — `.canvas-area.canvas-studio-layout` 段
- `frontend/src/features/studio/useStudioFeedCardState.ts`
- `frontend/src/features/studio/StudioFeedCardFooter.tsx`
- `frontend/src/features/studio/StudioHistoryCanvas.tsx`

---

## 4. 使用日志修复（仅本地，未 commit）

### 问题

- KPI 卡片数值挤进图标列
- 含任务汇总时花费 **双重计费**

### 修复

- `.admin-kpi-card` grid 明确行列
- `backend/app/routers/dashboard.py` — `_usage_log_billable_entry_types`
- `backend/tests/test_usage_logs.py`（新文件，未 track）

**未部署生产。**

---

## 5. 创作区 UX（仅本地，未 commit）

### 移除无效信息

- 顶部状态栏：工作流名「图像生成」
- 底部：`现代竞赛` 风格标签、`服务在线/服务异常`

**文件：** `StudioComposerLeading.tsx`、`StudioComposerSubmitActions.tsx` 及 props 链

### 参考图移除按钮

- 原「移除」在底部 54px 文件名列表，难点
- 改为预览图 **右上角圆形 ×**
- 有预览时 dropzone 改为 `div`，避免 button 嵌套
- **删除** `StudioReferenceUploadList.tsx` 及底部文件名残留
- 左侧栏 grid：`auto minmax(0, 1fr)` 两行（模式 + 预览）

**文件：** `StudioReferenceDropzone.tsx`、`StudioComposerBody.tsx`、`styles.css`

---

## 6. 当前 Git 状态（归档时点）

### 已 push

```text
51aba1b fix(providers): CPA gemini-3.1-flash-image 走 chat/completions 策略
4a29c11 fix: prevent upscale panel clipping in history gallery
```

### 本地未提交（节选）

```text
M  backend/app/routers/dashboard.py
M  frontend/src/styles.css
M  frontend/src/features/studio/StudioReferenceDropzone.tsx
M  frontend/src/features/studio/StudioComposerBody.tsx
D  frontend/src/features/studio/StudioReferenceUploadList.tsx
M  frontend/src/features/studio/StudioComposerLeading.tsx
M  frontend/src/features/studio/StudioComposerSubmitActions.tsx
…（Studio 历史卡片、使用日志页等）
?? backend/tests/test_usage_logs.py
```

### 版本对照

| 环境 | HEAD / 运行时 |
|------|----------------|
| GitHub `origin/main` | `51aba1b` |
| 生产 server git | `51aba1b5` |
| 生产 backend/worker **运行代码** | Gemini hotpatch 已生效（与 `51aba1b` 一致） |
| 生产 frontend | **未更新**（仍为旧构建，无 Studio/创作区本地改动） |

---

## 7. 新对话建议下一步

1. **若要上线 Studio/创作区改动**：单独 commit frontend CSS + studio 组件，再 `docker compose up -d --build frontend`（或全量 build）
2. **若要上线使用日志修复**：commit `dashboard.py` + test，部署 backend
3. **Gemini 生产**：在 Studio 实测 CPA Provider；失败时查 worker 日志与 `request_strategy`
4. **补做 Docker 镜像 rebuild**：消除 hotpatch 与镜像不一致
5. **不要**擅自 commit/deploy `tmp/`、`.env`、`storage/`

---

## 8. 相关对话

Agent transcript: `agent-transcripts/5c99ebb3-2d19-478d-92de-c84a3b9eed57/`
