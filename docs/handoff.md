# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-09-22] Chat UX 修复 + 埋点 P0–P3 — **DONE（已部署）**

- **动机：** 生产用户许潇上传大 PDF 后 Chat 无回复（pack 耗时 + SSE 中断 + 无错误提示）；需可量化漏斗与告警
- **已上线：**
  - **UX：** 分步 SSE status、防重复发送、失败/中断 assistant 错误落库
  - **P0：** `chat_turn_telemetry` 表 + 后端漏斗 + `POST /chat/telemetry`
  - **P1：** 前端 send/upload/error/status/switch 事件 + correlation 缓冲关联
  - **P2：** Admin **Chat 体验** 看板（`/admin/chat-experience`）
  - **P3：** `chat_telemetry_alerts` + 每小时评估 + Admin 告警展示
- **测试：** chat 相关 pytest **19 passed**
- **GitHub main：** `f127791` · **生产 HEAD：** `7afd4969`（merge）· **Migration：** `y0z1a2b3c4d5`
- **部署备注：** 生产库中 telemetry 表已预先存在，alembic 在 rebuild 后 `stamp head` + 补跑 `w4x5y6z7a8b9`
- **详档：** `docs/archive/handoff-2026-09-22-chat-telemetry-ux-wip.md`
- Safe to hand off: **Yes**

### [2026-09-18] 润色分模式优化 — **DONE（已部署 + 生产 prompt 已写入）**

- **动机：** 生成分析 30 天窗口润色后采纳率 **25.5%** 低于整体；图生图易被扩写偏离参考图
- **上线：** 文生图/图生图/视频三套 system prompt + 润色历史 + 参考图 warning；画布取消双击备注、禁止节点内拖图误建上传节点；日志刷新修复
- **GitHub main：** `3dca3ca` · **生产 HEAD：** `9392c447` · **Migration：** `v3w4x5y6z7a8`
- **生产润色模型：** Provider **51** `gemini-3.7-flash-high`；三列 prompt 已覆盖旧通用文案，legacy 字段已清空
- **观察期：** 2–4 周后对比 Admin **生成分析** 的 `polish_settle_rate` vs 基线 25.5%
- **详档：** `docs/archive/handoff-2026-09-18-prompt-polish-optimization-deploy.md`
- Safe to hand off: **Yes**

### [2026-09-16] Studio 滚动/创作区 + 生产运维清理 — **DONE（已部署 + 运维完成）**

- **Studio（已上生产）：** 创作区收纳抽动修复；进入项目自动滚历史**最下方**；右侧灰色圆形悬浮 ↑↓ 钮（`StudioHistoryScrollFab`）
- **GitHub main：** `be7daa1`（`9d862bc` + `be7daa1`）
- **生产 HEAD：** `4c1ca8ae`（merge origin + Banana 热补丁）
- **运维已做：** 僵尸 task #8/#9 关闭；worker 重建；31 条 Chat 对话迁 claude；Docker 安全清理（~0.9GB，**未动 media**）
- **磁盘：** 82% 使用，~8.5GB 可用；媒体卷 **~23GB**（8141 assets）；约 **+7~8GB/月** 增长 → 需规划升盘或 OSS
- **详档：** `docs/archive/handoff-2026-09-16-studio-ops-storage.md`
- **deploy 前端：** merge → `docker compose build frontend` → `up -d --no-deps frontend`
- Safe to hand off: **Yes**

（2026-09-04 符号主题 / Grok hotfix 等更早条目见 `docs/archive/`；灵感库搁置见 `docs/tasks.md`）
