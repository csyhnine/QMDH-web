# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-08] CAD 图纸提取上生产 — **DONE（已部署）**

- **代码：** GitHub `main` 功能提交 `872dc3f`。生产 git 合并为 `1783bec`（服务器上原有的 merge 历史不能快进）。运行中的 backend / worker / frontend 由这次合并重建。
- **迁移：** 上线前 `y0z1a2b3c4d5`，升级后 **`z1a2b3c4d5e6`（head）**。shapely **2.2.0** 在新镜像里。
- **健康：** `https://cityusbdisk.cn/api/v1/health` 为 healthy（database、redis）。`/studio/cad` 返回 **200**，前端包内有 `CadExtractPage`。
- **DWG：** 生产未配置 `QMDH_CAD_DWG_CONVERTER_CMD`，也没有 Linux 版 ODA。上传 DWG 会 `needs_conversion`，需改传 DXF。不要把本机 Windows 的 `ODAFileConverter.exe` 写入仓库或 `.env`。
- **数据：** 生产 CAD 表是空的。本地 `ce_94778ce26c6e` 不会上去，不要在生产重跑这条，也不要解析 `ce_d2955df6f9b9` 或改旧图 `ce_b121e1b892de`。不要改布置算法。
- **磁盘：** 同日按 9 月 21 日约定，删除 30 天前的 `generated/` 图片和视频 **6974** 个（约 12.7GB）。灵感库仍引用的 1 条留下。媒体卷约 **13.7GB**，根分区约 **60%**、可用约 **19GB**。
- **详档：** `docs/archive/handoff-2026-10-08-cad-geometry-fitout-wip.md`
- Safe to hand off: **Yes**

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

（2026-09-16 Studio 滚动/运维、2026-09-04 等更早条目见 `docs/archive/`；灵感库搁置见 `docs/tasks.md`）
