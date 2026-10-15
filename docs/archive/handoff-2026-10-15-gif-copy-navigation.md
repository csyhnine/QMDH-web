# 2026-10-15 其他导航一致性与 GIF 复制到压缩区

- 根因：AppShell 已将图纸改其他，但生成页独立 StudioGlobalRailNav 仍使用 Unicode 转义的旧图纸标签与 /studio/cad 链接，之前简单中文检索遗漏。现在两者共用 studioNavigation.ts 的 OTHER_TOOLS_NAV，名称与入口一处维护。图纸解析页签/功能保留。
- 结果详情（当前批次或持久历史/资产库回跳）增加复制到压缩区：从 original_storage_path 读取原始 GIF 为 File，恢复文件名、目标 KB、最长边、fps、颜色、两个适应选项，正确保留 0 与 false。清理 record_id 查询并滚动回表单，提示原记录保留；用户改参后手动提交。
- 没有从已压缩结果二次压缩；新提交沿用原单件接口/新 UUID/新历史记录。读取不到原件/空文件/超 20MiB/非 GIF 显示错误，不破坏当前结果；加载期间禁用输入和冲突操作，卸载后忽略响应。
- 前端完整 30 tests、23 既有类型错误/0 新增、构建通过。新增实际渲染两套侧栏并触发导航验证统一入口；原件读取/文件名/坏文件拒绝与参数 0/false 恢复测试，原结果按钮回归。
- 仅前端，不改 backend/迁移/旧记录/存储。分支 codex/gif-copy-and-navigation，基于 a1c90f3；原 styles.css 13 行/比较文档/_tmp_*、生产四文件差异与 CAD/key/卷/18010 保护继续。

## 发布与验证

- 功能 f18b5d6fb3af8e956442d15097586c326c4ccd77 已推送 main，生产代码合并 ce56c34d95841ddf8d696c8060d10fa660aa7822；仅 frontend 构建/重启，镜像 sha256:7d1d12ce066afcc4cd0b6ba9dc88695f7601eb2d0508a7f51edd622948760d80。后续文档合并不重建镜像。
- backend 仍 sha256:a30b5a73dc6a0d4cbb2694bcd212f5134361238029ca8ee6707708fe23539306，worker 仍 sha256:c0cfe56ce05bbff5cf67115a4b7f9d175a9caaaf594435583fd42f5a4bfed551；未重启后端/worker/数据服务，alembic current 为 f7g8h9i0j1k2 (head)。
- 备份服务器 /www/backup/qmdh-release-20261015-gif-copy，本机 E:/backups/QMDH-web/release-20261015-gif-copy；production.env/database.dump/媒体增量 SHA256 两端一致，权限受限，pg_restore --list 通过。本次数据库 SHA256 e025f6666f473b14d3398d11dd1c586ff28a72a92c06095b86ca40b02d5d991a；媒体增量 eeaa3ba8a265c0dc590faa7209061becbd69e02588af56df712f79391f97784e。
- 当前媒体 5762 文件，比 gif-history 增加 8 文件/43288187 字节；增量完整读取匹配清单。旧链本机硬链接保留，恢复顺序沿用 gif-history 链，再覆盖 media-delta-gif-copy.tar.gz，并配对本次数据库/配置。未修改/删除媒体，未向正式库写验收数据。
- 旧前端镜像 qmdh-release-backup-frontend:20261015-gif-copy 保留；生产 .env 前后同 SHA256 9ee1cc783bbc975ab76106a43fe194af37e915cd832cf36cee277b5e6bd2a22e。全部 backend 与 CAD 组件相对 5a9c988f 无差异，原四文件历史差异保留；本地原 styles.css 13 行/比较文档/_tmp_* 未提交。
- 公网 /api/v1/health、/studio/generate、/studio/gif、/studio/other、/studio/cad 均 200，nginx -t 通过。实际 index-CofxsX3c.js、GifCompressPage-B0ORky9-.js、GeneratePage-C0QkjD1x.js 核对共用其他入口/无旧侧栏图纸标签、复制按钮、original_storage_path、原记录保留提示。未宣称登录浏览器视觉或点击验收。
- CI https://github.com/csyhnine/QMDH-web/actions/runs/38714949288：前端检查成功（30 tests、23 既有/0 新增类型错误、构建通过）；后端未改代码的例行回归亦成功，156 passed/16 subtests。

Safe to hand off: Yes。
