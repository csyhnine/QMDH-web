# 2026-10-10 稳定化与 Skill 反馈发布

已提交、推送并部署。功能提交 **08a288434f2aff1367a4dc0b684221db81448a91**；生产发布合并 **861a49ac73d681cc51499f7bc06e36498b9c9546**。运行 backend/worker/frontend 由该合并构建，后续文档合并不改变镜像。原生产 git fe3adb5、镜像来源 1783bec。

## 范围与备份

Studio 历史分页/较老运行任务终态跟踪、隐藏暂停/低频配置刷新、文档对齐、质量检查/CI、媒体只读工具、Skill 自动采集与改进后台。生产 PostgreSQL 迁移 **z1a2b3c4d5e6 → b3c4d5e6f7g8**，表、列及版本已核对。

配置/数据库服务器备份：`/www/backup/qmdh-release-20261010-140657`（目录 700、配置 600，pg_restore --list 验证）。配对本机备份：`E:/backups/QMDH-web/release-20261010-140657`（Admin/SYSTEM 权限，包含配置/数据库/媒体/manifest，不入仓库）。媒体流式备份 **14,600,059,674 bytes**，完整读检 **5769 条目**，SHA-256 `6fa219d65b48e2d035bc798eab20e79d4d25b10875e9e95e83394ce8a6c9a105`。避免在仅余 18GB 的服务器重复存储 14GB 媒体。

`.env` 前后 SHA 校验一致，加密 key 未变；数据库/Redis/媒体卷保留，未清理文件或镜像。老镜像回退标签为 `qmdh-release-backup-backend:20261010`、`qmdh-release-backup-worker:20261010`、`qmdh-release-backup-frontend:20261010`。应用回退可保留新增表/列，不能自动 downgrade 删除新反馈历史。

## 服务器差异与操作

以 admin 身份 fetch/merge（非快进）。admin 无提交身份，用本次功能提交作者的一次性 git -c 身份完成合并，没有改全局配置。构建新 backend/worker/frontend 后，用新 backend 镜像执行迁移，再 `up -d --no-build --scale worker=3 backend worker frontend`。不使用现有含 --ff-only、迁移早于 build 的重建脚本。

生产历史另有 4 个 main 未包含的 Nano Banana 文件（backend 下）：app/services/image_aspect_ratio.py、app/services/task_executor.py、tests/test_image_aspect_ratio.py、tests/test_task_executor_openai.py。与原 fe3adb5 完全一致，合并保留；其余 backend/frontend 与 08a2884 一致。在独立临时目录组合生产文件与发布源码，相关回归 **5 passed**。未反向改本地文件或将这批服务器历史补丁推到 main。

## 验证与限制

- 本地后端 **94 passed、16 subtests、1 skipped**；前端 13 回归、类型基线/build 通过。
- GitHub Linux [Quality checks](https://github.com/csyhnine/QMDH-web/actions/runs/38029891739) 全绿：后端 **95 passed、16 subtests**，包括 Windows 跳过的链接隔离；23 项已有类型错误、0 新增。
- 公网 `/api/v1/health`、`/studio/cad`、`/admin/feedback` 200；完整 health 的 PostgreSQL/Redis healthy。
- 公网 Skill 管理接口未登录 401。新镜像用只读事务连接生产 DB，summary/issues/events、原反馈列表及计数全部 200；不写模拟任务/反馈/账户。检查用隔离路由与已有管理员配置，不声称浏览器真实登录验收。
- 运行容器匹配新镜像，backend healthy、3 个 worker running；近期日志无 Traceback/UndefinedColumn/UndefinedTable/ImportError。
- 根分区 **63%，约 18GB 可用**（本次复测）。CAD ODA 仍缺，先收 DXF，既有需转 DXF 图不重转，旧图保护保持。

原访客样式、比较文档、临时脚本、.env、app.db、storage 未提交。媒体工具已发布但未执行生产清理/引用审计。反馈采集 skill 尚未创建/安装、未注册真实采集凭证/接收数据/发外部消息。后续仍需平台联调与浏览器交互验收，TypeScript 修复、容量/缩略图/历史视频复核。Safe to hand off: Yes。
