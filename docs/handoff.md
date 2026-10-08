# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-08] CAD 几何布置收口 — **WIP（未 commit，下一任务是部署准备）**

- **目标：** 五段已在本地做完（多边形、可摆区域、组团、评分、咖啡厅吧台/操作台）。下一轮只准备部署，用户明确说提交并部署之前不要 push、不要上生产。
- **当前图：** `ce_94778ce26c6e`（09/28 15:02）。刷新会选中 `ce_d2955df6f9b9`（17:56），不要生成那条。一层网格 **4.74**，组团分 0，家具 121 件，分隔墙 20 段。二层没有在这三段之后重布。
- **测试：** `tests/test_cad_extract.py -k fitout` **16 passed**（评分和家具库之后未跑整文件）
- **本地：** 2026-10-08 留档时 18010 / 18011 / 18080 都没在听。要看页面再拉 18080，接口用 18011。不要占掉或杀掉已有的 18010。
- **Git：** main @ `1c68f52`，CAD **未 commit**。Migration `z1a2b3c4d5e6`（父版本 `y0z1a2b3c4d5`）未跑生产。依赖新增 `shapely`，上线必须 rebuild，不能热补。
- **Next：** 做部署准备清单（提交范围、排除 `_tmp` / `app.db` / `storage`、迁移、Linux 上的 DWG 转换器、备份后 rebuild）。不要改布置算法。
- **详档：** `docs/archive/handoff-2026-10-08-cad-geometry-fitout-wip.md`
- Safe to hand off: **Yes（WIP）**

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
