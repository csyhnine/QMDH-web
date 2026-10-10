# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-08] Studio 历史分页、任务跟踪与刷新优化 — **DONE（本地，未提交/部署）**

- **分支：** `feature/studio-perf-003-history-pagination`，基于 `65c47a0`。
- **完成：** 修复 API 忽略 limit；历史每页 120 条、加载更多与关联资产；轮询最近 40 条 + 全部运行任务，按 ID 补查终态；已加载历史保留；资产权限/收藏过滤在 limit 前。
- **追加完成：** `studio-perf-005` 页面隐藏暂停轮询，返回立即同步（正在请求时排队一次）；配置按 5 分钟刷新，失败保留原值，不阻断任务状态。切账号/卸载清理监听器并忽略旧响应。
- **验证：** 后端列表回归 33 passed，前端 hook 回归累计 10 passed，build 通过。扩大回归 45 passed/2 个基线失败；tsc 23 个已有错误，无新增。
- **边界：** 无迁移、无新依赖、未操作生产。筛选作用于已加载记录，独立资产库分页未做。原访客样式、比较文档、临时脚本未触碰。
- **下一步：** 审阅/交互验收后，用户明确要求才提交与部署，前后端需一起更新。CAD 仍等待官方 Linux ODA 安装包。
- **详档：** `docs/archive/handoff-2026-10-08-studio-history-pagination.md`
- Safe to hand off: **Yes**

### [2026-10-08] CAD 图纸提取上生产 — **DONE（已部署）**

- **代码：** GitHub `main` `65c47a0`（功能提交 `872dc3f`）。按用户冷启动补充，生产 git 最新为文档合并 `fe3adb5`，运行中的 backend / worker / frontend 仍由包含功能的 `1783bec` 重建。服务器原有 merge 历史不能快进，pull 必须 `sudo -u admin`。
- **迁移：** 上线前 `y0z1a2b3c4d5`，升级后 **`z1a2b3c4d5e6`（head）**。shapely **2.2.0** 在新镜像里。
- **健康：** `https://cityusbdisk.cn/api/v1/health` 为 healthy（database、redis）。`/studio/cad` 返回 **200**，前端包内有 `CadExtractPage`。
- **DWG：** 生产未配置 `QMDH_CAD_DWG_CONVERTER_CMD`，也没有 Linux 版 ODA。维持生产只收 DXF；用户提供官方 Linux 安装包前，不自行下载/安装。Linux 转换器需放入镜像，以带 `{input}` / `{output_dir}` 的命令或包装脚本接入，再重建 backend/worker；Windows exe 不能搬到生产或入库。
- **数据：** 上线时 CAD 表为空；按用户冷启动补充，现已上传 `五期云锦居委会办公室0922-x.dwg`，记录 `ce_0abae8a9402f` 为 `needs_conversion`，不会自动重转。本地 `ce_94778ce26c6e` 不会上去，不要在生产重跑这条，也不要解析 `ce_d2955df6f9b9` 或改旧图 `ce_b121e1b892de`。不要改布置算法。本轮未连接生产复核。
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

（2026-09-18 润色交接详见 `docs/archive/handoff-2026-09-18-prompt-polish-optimization-deploy.md`；更早条目见 `docs/archive/`；灵感库搁置见 `docs/tasks.md`）
