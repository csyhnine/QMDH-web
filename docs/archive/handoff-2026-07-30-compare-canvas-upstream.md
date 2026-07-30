# Handoff — 2026-07-30 对比多原图 / 画布导航 / 上游参考修复

Date: **2026-07-30**  
Branch: **`main`**  
Local / GitHub tip: **`79f4814`**  
Production: **`https://cityusbdisk.cn`** — **`79f4814`**（2026-07-29 晚已 pull + frontend `--no-cache` 重建）  
Alembic: **`r9s0t1u2v3w4`**（本波次无新迁移）  
Safe to hand off: **Yes**（无代码 WIP；简历/算力数据收集**已取消，勿继续**）

## 一句话

多原图对比可选与灯箱铺满修复、画布进场 fitView / 中键双击适应视图 / 缩略图拖拽跳转、图生图换上游后优先用当前上游参考，均已上生产。

## 本波次已交付（已上生产）

### 对比灯箱
- 多张输入原图时可选手动对比源：`MediaComparePanel` + `listStudioCompareOriginalUrls`
- 灯箱全局 `img { width:auto }` 曾盖掉滑杆铺满 → 对比图强制 `100%` + contain
- Studio 历史预览与画布媒体预览共用面板

### 画布导航 UX
- 进入项目/模板后 `onInit` → `fitView`（对齐左下角适应视图）
- 中键双击空白 → 同一 `fitView`
- MiniMap：`pannable` + 单击 `setCenter`；样式加强

### 图生图换上游
- 根因：节点本地 `referenceImages` 残留旧上游且合并时排在前面
- 修复：`resolveCanvasInputReferenceImages` — **有上游则只用当前上游**；对比原图优先用生成时快照

## 关键文件

| 区域 | 路径 |
|------|------|
| 对比面板 | `frontend/src/components/shared/MediaComparePanel.tsx`, `MediaCompareSlider.tsx` |
| 对比工具 | `frontend/src/features/studio/studioCompareUtils.ts` |
| Studio 灯箱 | `frontend/src/features/studio/StudioGalleryPreviewLightbox.tsx` |
| 画布板 | `frontend/src/features/canvas/CanvasBoard.tsx` |
| 上游参考 | `frontend/src/features/canvas/canvasGraphUtils.ts`, `useCanvasNodeGenerate.ts` |
| 对比入口 | `GenerateNode.tsx`, `CanvasNodeInspector.tsx`, `CanvasWorkspace.tsx` |
| 样式 | `frontend/src/styles.css`（compare + minimap） |

## 部署记录

1. Commit/push：`79f4814` → `origin/main`
2. 服务器：`sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main`
3. 纯前端：`docker compose build --no-cache frontend && docker compose up -d frontend`
4. 校验：HEAD `79f4814`；静态资源含「选择对比原图」；`/api/v1/health` healthy

## 明确取消 / 勿续做

- **算力费用、对外简历运营数据收集**：用户已要求忽略；一次性核对结论仅在本机 Cursor Canvas（勿当产品需求、勿写进对外材料除非业务另批）
- 勿提交：`assets/` 截图、`tmp/`、`.env`、`storage/`、旧 handoff 草稿

## 安全提醒

- 本波次曾用控制台重置 root 密码做 SSH 部署；**密码已出现在对话/截图，建议尽快改密钥登录并轮换密码**
- 服务器 `git pull` 必须用 `admin`

## 新对话建议起点

1. 读 `docs/handoff.md` + `docs/continuity.md`（本条）
2. `git status` / `git log -5`；生产 `rev-parse` 期望 **`79f4814`**
3. 产品下一批看 `docs/tasks.md`；**不要**继续简历指标专项

## 相关

- 上一波归档：`docs/archive/handoff-2026-07-29-canvas-announcements-nav.md`
- 部署摘要：`docs/archive/deploy-2026-07-29-compare-canvas-upstream.md`
