# 2026-10-13 反馈时间展示发布

- 用户明确要求提交并部署。功能提交 b619413 已推送 GitHub main，生产合并 b04ffb53c5023946ccbf248f50aba9c40c8c93a5。
- 聚合问题列表/详情显示创建和更新时间，事件显示发生和接收时间，年月日时分秒统一北京时间；缺值显示未记录。使用已有接口字段，无后端改动/迁移。
- 本地 npm run check：16 项通过、23 既有 TypeScript 错误、0 新增，Vite 构建通过。生产 frontend 构建并以 --no-deps --no-build 仅重建前端容器。
- 运行前端镜像 sha256:c994f59a4f49c2f563d75cea675647b8d94ddbc7863867381cb94c7af18bae79；后端仍 sha256:240ec7bf054818acacb2115f3365e3abd1e7be57708219f695df97151a802c96；迁移仍 d5e6f7g8h9i0。
- nginx -t 通过；公网 /admin/feedback、/studio/cad、/api/v1/health 均 200，health 的数据库/Redis healthy。公网 FeedbackOpsPage-BH9HyZBo.js 已核对创建/更新/发生/接收/北京时间及 received_at。未宣称完成登录后的浏览器视觉验收。
- 配置前后 SHA256 一致。服务器备份 /www/backup/qmdh-release-20261013-feedback-time，本机 E:/backups/QMDH-web/release-20261013-feedback-time；配置/数据库已配对下载，数据库 pg_restore --list 成功。新数据库 SHA256 d900b55763423de3d1dea86bec963a2e231be7736643f830a195b7c3d2c5e135。
- 媒体保留 10-10 的完整包与增量包，本机硬链接复用，新增 2 文件共 4381098 字节打成 media-delta-20261013.tar.gz；新包完整读取通过、SHA256 两端一致 75a2897c3d1335cf541f013a387c4361bb71a2fd56562290452ca0cfffa0b37b。当前 5742 文件与旧快照+新增包元数据覆盖核对通过。恢复顺序：media.tar.gz → media-delta.tar.gz → media-delta-20261013.tar.gz，再配对数据库/配置；不删除线上媒体。
- 旧前端回退镜像 qmdh-release-backup-frontend:20261013-feedback-time 保留。未改环境、CAD、key、媒体数据、18010；本地 styles.css 原 13 行、比较文档、_tmp_* 保留且未提交。生产工作区发布前与合并后干净，原生产四个 Nano Banana 差异通过既有合并历史保留，未重建后端。
- 外部客户端/后台核实聚合仍 IN_PROGRESS，本次仅发布时间展示；测试事件 3/4 仍 pending，不自动核实成真实业务问题。

Safe to hand off: Yes。功能已发布，后续文档提交不重新构建镜像。
