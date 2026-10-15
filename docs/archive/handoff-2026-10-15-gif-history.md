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

发布结果待续。
