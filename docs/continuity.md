# Development Continuity

最新生产事实（2026-10-10 已连接复核）：功能 `08a2884` 已在 main，发布合并 `861a49a` 的镜像已运行，迁移 `b3c4d5e6f7g8`；后续文档合并不改变镜像。生产仍保留 4 个 main 未包含的 Nano Banana 文件，不可覆盖；备份与验证见 `archive/handoff-2026-10-10-production-release.md`。下面“本地未提交/旧生产快照”为发布前记录；CAD、加密 key/数据卷保护保持。

Last aligned: `2026-10-10`。旧版本完整保存在 `archive/document-baseline-before-2026-10-08-alignment/continuity.md`，其中版本号、stash 序号和排期均为历史。

## Cold Start

依次读 `protocol.md`、`tasks.md`、`handoff.md`、`roadmap-2.0-prep.md` 与当前任务相关的架构/决策。涉及生产再读 `server-operations.md` 的 Daily Update 与 `data-governance.md`。先核对 Git 和代码，后开发。

## Current Baseline

- GitHub main / 本地任务分支基线：`65c47a0`，CAD 功能提交 `872dc3f`。
- 当前任务分支：`feature/studio-perf-003-history-pagination`；`studio-perf-003` / `studio-perf-005` 本地完成、未提交/部署；另有文档对齐与 quality-gate-001（10-10 本地完成，未提交/未在 GitHub 运行）。
- 原有工作区改动：`frontend/src/styles.css`、`docs/compare-qmdh-openclaw-codex.md` 和 `scripts/_tmp_*`，不属于本轮任务，不要混入提交。
- 当前 stash 必须现场执行 `git stash list` 再识别。本轮只读看到 `stash@{0}` 为 `wip-before-chat-deploy`，符号主题另有记录；禁止按旧文档直接 pop。

## Production Snapshot

以下来自用户 2026-10-08 冷启动补充与部署交接，**本轮未连接服务器复核**。

- URL：`https://cityusbdisk.cn`；服务器 `120.79.227.11`；目录 `/www/wwwroot/qmdh-web`。
- 生产 git 最新文档合并 `fe3adb5`；运行 backend/worker/frontend 镜像仍来自含 CAD 功能的 `1783bec`。不同哈希不代表缺少功能。
- Alembic `z1a2b3c4d5e6`；镜像 shapely 2.2.0；health 正常、`/studio/cad` 200。
- 无 `QMDH_CAD_DWG_CONVERTER_CMD` 与 Linux ODA。`ce_0abae8a9402f` 上传 DWG 后为需转 DXF，不自动重转。
- 清理 generated 媒体 6974 个、约 12.7GB；灵感库仍引用的 1 条留下。当时媒体卷约 13.7GB，根分区约 60%、可用约 19GB；这些不是实时容量。
- 数据在 PostgreSQL/Redis/媒体卷与生产配置中，不随 Git 重置。模型、价格、工具目录条目以数据库为准。

## Product And Code Reality

- 有效角色 `admin`、`ops`、`designer`；`owner` 输入归一为 admin。ops 有部分内容后台权限，不等于全局管理员。以 `core/auth.py` 和 `features/access/roleAccess.ts` 的具体检查为准。
- Studio 历史、任务及有来源任务的资产按账号授权；共享项目不自动共享历史。无来源任务资产仍走项目权限，不能笼统宣称所有资产都是用户私有。
- 项目是任务容器，`/admin/projects` 不在当前前端入口。共享和私有模板并存。
- 图像/视频/普通 Chat/画布/CAD 已有实现。助手生产 UI 按交接保持关闭，不擅自打开。
- nginx `/media` 直出共享只读卷、部分图片 lazy-load 已在代码中；不要按旧 TODO 重做。缩略图派生仍可另行规划。
- 后端已有测试、Alembic、日志、CORS、限流和会话清理；功能存在不代表生产配置已启用。启动兼容建表/补列仍存在，不能替代迁移核对。
- 本地 Studio：每页 120 条，最近 40 条 + 全部运行任务轮询与终态补查；隐藏暂停、返回同步，配置 5 分钟刷新。尚未部署，详见本轮交接。

## Local Verification

- 前端：在 frontend 执行 `npm run check`（13 项回归、类型基线、build）；完整严格检查仍用 `npm run typecheck`。
- 后端：在 backend 用 `.venv/Scripts/python.exe scripts/check.py` 执行离线关键回归；其他专项仍用 pytest。运行边界见 `checks.md`。
- 当前证据：前端统一检查 13 passed + build，后端离线关键回归 66 passed + 16 subtests；完整 tsc 23 项已有错误，无本轮新增。旧 Meilisearch 连接失败由离线检查显式关闭搜索解决；旧 dashboard 夹具已改为 admin 核对并断言 ops 403。全后端和真实外部集成未承诺通过。
- `package.json` 没有 `smoke:studio` / `smoke:chat` 脚本，不再推荐不存在的 npm 命令。独立脚本先阅读所需运行条件。
- CAD 本地后端使用 18011；前端 18080 需显式代理到 18011。不得占用或停止别人的 18010。本轮没有启动本地服务。

## Next Actions And Red Lines

- 排期以 `tasks.md` 为准，不恢复旧 June 合并顺序或旧待部署事项。
- 提交/push/部署须有用户明确要求；本轮继续开发不表示授权部署。
- 部署按 Daily Update 做 .env、数据库和媒体备份；git 必须 `sudo -u admin`。服务器 main 有历史合并，不能用 `--ff-only` 假定可快进；合并冲突按协议处理。
- 新迁移必须确保执行容器包含新迁移文件，再核对 Alembic current/head；不要机械照抄旧镜像命令。
- 禁止更换加密 key 或删除数据卷，禁止提交 `.env`、`backend/app.db`、`backend/storage/**`、`scripts/_tmp_*`。
- CAD：用户提供官方 Linux 安装包前不下载/安装；之后放进容器，用 `{input}` / `{output_dir}` 命令或脚本接入并重建 backend/worker，再用新 DWG 验证。Windows exe 不能搬到服务器或写入仓库。
- 不在生产重跑 `ce_94778ce26c6e`，不解析 `ce_d2955df6f9b9`，不改 `ce_b121e1b892de`；不改布置算法、不拆卫生间、不做线稿或生图。
