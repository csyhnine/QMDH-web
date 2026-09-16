# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-09-16] Studio 滚动/创作区 + 生产运维清理 — **DONE（已部署 + 运维完成）**

- **Studio（已上生产）：** 创作区收纳抽动修复；进入项目自动滚历史**最下方**；右侧灰色圆形悬浮 ↑↓ 钮（`StudioHistoryScrollFab`）
- **GitHub main：** `be7daa1`（`9d862bc` + `be7daa1`）
- **生产 HEAD：** `4c1ca8ae`（merge origin + Banana 热补丁）
- **运维已做：** 僵尸 task #8/#9 关闭；worker 重建；31 条 Chat 对话迁 claude；Docker 安全清理（~0.9GB，**未动 media**）
- **磁盘：** 82% 使用，~8.5GB 可用；媒体卷 **~23GB**（8141 assets）；约 **+7~8GB/月** 增长 → 需规划升盘或 OSS
- **详档：** `docs/archive/handoff-2026-09-16-studio-ops-storage.md`
- **deploy 前端：** merge → `docker compose build frontend` → `up -d --no-deps frontend`
- Safe to hand off: **Yes**

### [2026-09-16] Chat 模型切换 + 上下文统计（阶段 1）— **DONE（已部署生产）**

- **功能：** 会话内 PATCH 切换模型；context 快照 + `GET …/context-stats`
- **GitHub main：** 已含于 `be7daa1` 历史（功能 commit `b6edfd2`）
- **Migration：** `a8b9c0d1e2f3`
- **详档：** `docs/archive/handoff-2026-09-16-chat-model-switch-context-stats.md`
- Safe to hand off: **Yes**

### [2026-09-04] 符号主题链 + 豆包检索 + Grok/润色 hotfix — **DONE（本地 main；生产未 deploy 符号主题）**

- **符号主题 WIP** 在 stash；生产 **未 deploy**
- **详档：** `docs/archive/handoff-2026-09-03-session-end-cold-start.md`
- Safe to hand off: **Yes**（勿误 deploy 符号主题）

（Haodeya/Grok 2026-09-04 条目已归档至 `docs/archive/`；灵感库搁置见 `docs/tasks.md`）
