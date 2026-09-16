# Handoff: Studio 滚动/创作区修复 + 生产运维 — 2026-09-16

**状态：DONE（已部署生产 + 运维清理完成）**  
**Safe to hand off：Yes**

---

## 摘要

本会话完成 **Studio 生成页 UX 修复**（创作区收纳抽动、历史自动滚到底、右侧悬浮滚动钮）并 **多次 deploy 前端**；另完成 **生产运维**：僵尸任务清理、worker 对齐、Chat 禁用模型对话迁移、磁盘审计与安全 Docker 清理。

**未做：** 媒体文件删除、OSS 迁移、ECS 升盘、符号链/画布 stash 恢复。

---

## Git / 部署

| 项 | 值 |
|---|---|
| GitHub `main` | **`be7daa1`** |
| 相关 commits | `9d862bc` Studio 收纳+历史滚底；`be7daa1` 右侧灰色圆形 FAB |
| 生产 git HEAD | **`4c1ca8ae`**（merge origin + Banana 热补丁链） |
| Alembic | **`a8b9c0d1e2f3`**（无新 migration） |
| 生产 URL | https://cityusbdisk.cn |
| backend/worker 镜像 | 2026-09-16 重建对齐 |
| frontend 镜像 | 2026-09-16 多次 rebuild（末次 `--no-cache`） |

### 前端 deploy 标准命令（仅 frontend）

```bash
cd /www/wwwroot/qmdh-web
sudo -u admin git fetch origin main
sudo -u admin git -c user.name=admin -c user.email=admin@local merge origin/main --no-edit
docker compose build frontend   # 或 --no-cache frontend
docker compose up -d --no-deps frontend
curl -sf http://127.0.0.1:8080/api/v1/health
```

**纪律：** 生产 git **不能** `pull --ff-only`；未经用户同意禁止 force push / 误 deploy WIP。

---

## Studio 功能（已上生产）

### 1. 创作区收纳抽动修复

- **文件：** `frontend/src/features/studio/useStudioComposerCollapse.ts`
- **原因：** 收纳后 dock 高度变化 → `distanceFromBottom` 变小 → 旧逻辑立刻展开 → 反馈循环
- **修复：** 收纳后不再用 `distanceFromBottom` 触发自动展开；去掉 effect 对 `composerCollapsed` 的依赖

### 2. 进入项目自动滚到最新历史（列表最下方）

- **文件：** `useStudioViewEffects.ts`、`studioHistoryScrollUtils.ts`
- **行为：** 默认排序仍为 **「最早优先」**（最新在底部）；切换项目后 `useLayoutEffect` 滚到底，多帧重试等图片布局稳定
- **注意：** 勿改默认排序为「最近优先」（用户明确要求保持习惯）

### 3. 历史列表右侧悬浮滚动钮

- **文件：** `StudioHistoryScrollFab.tsx`、`StudioHistoryCanvas.tsx`、`styles.css`
- **样式：** 历史区右侧第 3 列 grid；**灰色描边圆钮** + 上下三角箭头；`position: sticky` 垂直居中偏上
- **交互：** 上钮 → 最上方；下钮 → 最下方（最新）

---

## 生产运维（本会话已执行）

### A. 数据修复（2026-09-16 上午）

| 项 | 操作 |
|---|---|
| 僵尸 task #8/#9 | `running` → `failed`（2026-05 遗留） |
| worker×3 | `docker compose build worker` + `up -d --no-deps worker` |
| Chat 对话 | 31 条从已禁用 provider 迁到 **`claude-opus-4-6-thinking`（id=50）** |

### B. 磁盘审计 + 安全清理（2026-09-16 下午）

**清理前：** 根分区 **83%**（39G/49G），可用 **8.2G**

**已执行（安全）：**

- `docker builder prune` → **551 MB**
- `docker volume prune` → 1 个 **0B 孤儿卷**
- `docker network prune` → 未使用的 `baota_net`
- **未动** `qmdh-web_backend_media`、Postgres、任何 asset 文件

**清理后：** **82%**，可用 **8.5G**；health OK；asset **8141** 条；媒体卷 **~23GB**

**增长预估：** ~2500 asset/月 × ~3MB ≈ **+7~8GB/月** → 若不升盘/OSS，约 **1 个月**后再紧张。

**勿做：** 无审计批量删 media；软删 task（1149 条）对应文件是否孤儿需专门脚本（只报告不删）。

---

## Chat 生产运营态（仍有效）

| 项 | 状态 |
|---|---|
| 设计助手 UI | **关** |
| 可用 Chat 模型 | claude-opus-4-6-thinking、gemini-3.7-flash-high |
| GPT Chat | 已禁用 |

---

## 本地仓库（交接时）

- **分支：** `main` @ `be7daa1`，与 `origin/main` 同步
- **工作区：** 干净（仅 `scripts/_tmp_*.py` 未跟踪，**勿 commit**）
- **stash：** `wip-before-chat-deploy` 等仍含符号链/画布 WIP — **勿误 deploy**

---

## 下一位 agent 建议第一步

1. 读 `docs/handoff.md` 本条目 + `docs/continuity.md`
2. `git status`；生产：`sudo -u admin git -C /www/wwwroot/qmdh-web rev-parse --short HEAD` + health
3. **可选运维：** 媒体孤儿审计（只统计）；规划 OSS（`prod-008`）或升盘
4. **可选功能：** Chat 上下文阶段 2、`chat-b2-001`、Studio perf（nginx `/media` 直出）
5. **禁止：** 未经用户同意 deploy / 删 media / force push

---

## 关键文件索引

| 用途 | 路径 |
|------|------|
| 创作区收纳 | `frontend/src/features/studio/useStudioComposerCollapse.ts` |
| 历史滚底 | `frontend/src/features/studio/useStudioViewEffects.ts` |
| 滚底工具 | `frontend/src/features/studio/studioHistoryScrollUtils.ts` |
| 悬浮钮 | `frontend/src/features/studio/StudioHistoryScrollFab.tsx` |
