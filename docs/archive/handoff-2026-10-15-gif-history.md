# 2026-10-15 GIF 持久历史与资产库

- 用户发现压缩结果仅临时存在、资产库无记录。核对代码：旧接口仅写 UUID 媒体文件，页面状态仅 React state；未入 DB，确属遗漏。
- 新表 gif_compression_records：user_id FK、原始文件名、原件/结果相对路径、compression/parameters JSON、创建时间；迁移 f7g8h9i0j1k2 接 e6f7g8h9i0j1，bootstrap 表存在检查，旧业务表不变。
- POST /assets/gif-compress 现在要求真实 user_id，保存文件后提交记录再返回成功；未达标或原件满足目标也登记。响应含 record_id/created_at/parameters，参数不含 data_url，源媒体不复制入 DB。
- GET /assets/gif-history 支持 before_id/limit；详情同样按 user_id 限定，他人记录返回 404、无身份 401、admin 不越权。新资产库分类 gif 与 all 汇总，继承现有库每类最近 400 条限制、关键词/日期/分页；当时记录回链 /studio/gif?record_id=id。
- 工具页展示最近 20 条历史，刷新/重新登录从服务端加载、当前结果即刻加入；点击历史使用服务器原件/结果，不依赖浏览器 File/object URL；资产库新增 GIF 压缩分类，保留旧图片/视频/CAD 行为。
- 旧 UUID 文件缺少文件名/账号/参数记录，不把未知媒体猜测分给某人。本次没有自动恢复旧记录或删除旧媒体。
- 测试覆盖：新 DB session 持久回读、记录参数与原件、列表游标/库分类/搜索与回链、他人/admin 拒绝、未达标登记、迁移重复执行/旧用户保留、历史无本地文件也可预览/下载、库入口。
- 分支 codex/gif-persistent-history，基于 aebc521；原 styles.css 13 行/比较文档/_tmp_*，生产四文件差异和 CAD/key/卷/18010 保护继续。

- 本地后端全量 155 passed/1 skipped/16 subtests；前端 27 项、23 既有类型错误/0 新增、构建通过。

## 发布与验证

- 功能 9b89b5368a1f341ff0fd03d0be2ebbd610d7c36f 已推送 main，生产运行合并 e6d98efa；正式迁移 f7g8h9i0j1k2。后续文档同步不重建镜像。
- CI https://github.com/csyhnine/QMDH-web/actions/runs/38712934145 成功：Linux 156 passed/16 subtests，前端 27 项、23 既有类型错误/0 新增与构建通过。
- 配对备份：服务器 /www/backup/qmdh-release-20261015-gif-history；本机 E:/backups/QMDH-web/release-20261015-gif-history。数据库 SHA256 06d1f37dfaa7b63ee94c936ce1ff39109aa0fb0dcef15d1933485a1a17ccd179；媒体增量 bbb1a6c0a860b772c4b79e4dc3db64fab60704f5e1b3556bcc9fd8af6a09e736；配置前后均 9ee1cc783bbc975ab76106a43fe194af37e915cd832cf36cee277b5e6bd2a22e；下载后与服务器清单逐项一致，权限受限。
- 媒体快照 5754 文件，相比 gif-batch 新增 9 文件/54623520 字节，增量完整读取并匹配清单；旧链本机硬链接保留。恢复顺序为先前完整媒体链 → media-delta-gif-history.tar.gz，再配对本次数据库/配置。未删除媒体。
- 完整恢复 PostgreSQL 到 qmdh_verify_gif_history 后迁移，users/tasks/assets/cad_extracts/prompt_templates 行数分别 70/8202/2286/1/21，迁移后原样保留。隔离库中真实 GIF 手动请求 1597553→453484 字节，登记后新 session/客户端可回读，库 GIF 分类可见、回链正确、其他账号（含 admin）列表为空/详情 404；临时媒体目录回收，隔离库验收后已删除。没有向正式库写测试用户/记录。
- 正式迁移后新记录表 0 行，正式业务从真实后续请求开始积累。旧文件无归属记录，不自动补录；用户需重新压缩才进入新历史。
- backend 镜像 sha256:a30b5a73dc6a0d4cbb2694bcd212f5134361238029ca8ee6707708fe23539306；worker sha256:c0cfe56ce05bbff5cf67115a4b7f9d175a9caaaf594435583fd42f5a4bfed551；frontend sha256:6eae6c36f8d337b98539cf20a204357f4048e02198446631219d226683602ee3。后端 healthy、三个 worker/前端运行，nginx -t 通过，启动日志四类错误均 0。
- 公网健康、/studio/gif、/studio/library、/studio/cad 均 200；匿名 GET 历史/详情/库 GIF 均 401。实际 index-C6NdGGYB.js、GifCompressPage-B1HIKK7Z.js、AssetLibraryPage-DGsMnIYB.js 含历史、保存提示、record_id、库链接与 GIF 分类。未宣称登录浏览器视觉或点击验收。
- 旧镜像标签 qmdh-release-backup-{backend,worker,frontend}:20261015-gif-history 保留；代码回退沿用新表，不为回退删除业务记录或降级。发布前活动生成任务为 0；原四文件生产差异与 CAD 组件保持，原样式 13 行/比较文档/_tmp_* 未提交。
- migration.log 与 verify-isolated.log 两端备份保留。

Safe to hand off: Yes。
