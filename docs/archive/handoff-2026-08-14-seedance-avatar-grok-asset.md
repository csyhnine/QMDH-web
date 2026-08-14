# Handoff — 2026-08-14 Seedance 入库双通道 + Grok `asset://` 隔离

Date: **2026-08-14**  
Branch: **`main`**  
Local / GitHub tip: **`e005414`**  
Production: **`https://cityusbdisk.cn`** — **`e005414`**（frontend `--no-cache` 重建；backend/worker 热补丁 `haodeya_grok_video.py`）  
Alembic: **`r9s0t1u2v3w4`**（本波次无新迁移）  
Safe to hand off: **Yes**（无代码 WIP；可换新对话）

## 一句话

Seedance 参考图改为手动「入库」（虚拟人 / 真人双通道）；Grok/HappyHorse 不得再把 Seedance `asset://` 当 OSS 路径提交——已修并上生产。

## 本波次已交付（已上生产）

| Commit | 内容 |
|--------|------|
| `5b33724` | Seedance 入库用真实 `provider_name`；单图预览不挤 |
| `6727c39` | Seedance 参考图最多 4 张 |
| `d679124` | 有图后仍显示「+」加图格 |
| `844f240` | 停自动入库；手动「入库」；提交允许 HTTPS |
| `37145dc` | 虚拟人入库 + 真人入库（认证弹窗 + API） |
| `834e60f` | 认证进行中隐藏入库菜单 |
| `e005414` | Grok/HappyHorse 剥离 `asset://`，优先 `mediaPath` |

### Seedance 入库

- **产品**：上传不再自动 register；缩略图底部「入库」→「虚拟人入库 / 真人入库」
- **真人**：H5 认证弹窗 →「认证完成，继续入库」
- **后端**：
  - `backend/app/routers/seedance_avatar.py`（prefix `/seedance`）
  - private：`/private-avatar/register`、`/assets/{id}`
  - real：`/real-avatar/verify-tasks`、`/callback`、`/register`、`/assets/{id}`
  - `backend/app/services/seedance_real_avatar.py`、`seedance_private_avatar.py`
- **前端**：`StudioReferenceDropzone.tsx`、`useStudioReferenceUploads.ts`、`seedancePrivateAvatar.ts`、`api.ts`

### Grok 失败根因与修复（任务 3851）

- **现象**：`OSS media not found: asset://pa_...`（`task_execution_error`）
- **根因**：Seedance 入库后 `storagePath`=`asset://pa_...`；切到 Grok 仍当参考图 → `resolve_public_media_url` 查 OSS 失败。`asset://` 仅 Seedance 账户内有效。
- **前端**：`referenceUploadStoragePaths` / `resolveReferencePathsForProvider` 优先非 asset 的 `mediaPath`；`buildVideoPayload(..., referenceUploads)` 仅 Seedance 允许 asset
- **后端**：`_reject_seedance_asset_protocol`（Grok / HappyHorse）明确拒绝

## 关键文件

| 区域 | 路径 |
|------|------|
| 参考路径 | `frontend/src/features/studio/studioReferenceUtils.ts` |
| 视频 payload | `frontend/src/features/studio/studioPayloadUtils.ts` |
| 提交 | `studioTaskSubmissionActions.ts`、`useStudioTaskSubmission.ts` |
| Seedance/HH utils | `seedanceVideoUtils.ts`、`happyHorseVideoUtils.ts` |
| Grok adapter | `backend/app/services/provider_adapters/haodeya_grok_video.py` |
| 入库 API | `backend/app/routers/seedance_avatar.py` |

## 生产配置备注

- Seedance 模型：`provider_name`=`seedance-2`，显示名「Seedance 2 Video」（DB id 约 41）；提交必须传 **provider_name** 不是显示名
- 遗留 SKU 42/43/44 已停用
- 生产路径：`/www/wwwroot/qmdh-web`；git 用户 **`admin`**；部署常用 **paramiko root SSH**
- pull 偶发脏文件：`frontend/src/styles.css` → `git checkout -- frontend/src/styles.css` 后再 pull
- 全量 `docker compose build backend` 很慢；本波次 backend 用 **docker cp 热补**；frontend 需 **`--no-cache`**（否则易命中旧层）

## 部署记录（`e005414`）

1. `git push origin main`
2. 服务器：`sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main`
3. `docker cp .../haodeya_grok_video.py` → backend + worker-1/2/3；`docker compose restart backend worker`
4. `docker compose build --no-cache frontend && docker compose up -d frontend`
5. 校验：HEAD `e005414`；`/api/v1/health` healthy；bundle 含 `allowAssetProtocol`

## 验收建议（新对话可复测）

1. Seedance：上传 ≤4 张；「+」可继续加；点「入库」虚拟人 → 路径变 `asset://`；生成成功
2. 真人入库：认证流程走通后 register
3. **入库后切 Grok**：硬刷新 → 应走 HTTPS/`mediaPath`，不再 `OSS media not found: asset://`
4. 若旧会话仍带 `asset://` 缩略图：删图重传（可不入库）再跑 Grok

## 已知风险 / 后续可选

- Backend/worker 仍是热补丁；择机全量 `docker compose build backend` 固化镜像
- 根密码曾出现在对话中；建议改密钥登录并轮换
- 勿提交：`assets/`、`tmp/`、`.env`、`storage/`
- 可选：补单测「Grok payload 拒绝 asset://」；真人入库生产端到端再验一轮

## 新对话建议起点

```text
先读 docs/handoff.md + docs/continuity.md + docs/archive/handoff-2026-08-14-seedance-avatar-grok-asset.md。
当前 main/生产 = e005414。继续开发前先 git status / log -5，不要重复修已上线的 asset:// 隔离。
```

## 相关

- 前序图像运营部署：`docs/archive/deploy-2026-08-12-haodeya-image-ops.md`
- 上一份交接指针曾停在 2026-07-30 画布/对比（仍有效，与本波次无关）
