# 反馈安全发布 — 2026-10-10

状态：用户明确授权提交、推送并部署，发布已完成。GitHub 功能 55216abb3523b675ec7b77cfdf2084ce2e4378a3；生产发布合并 30dfe266d0cd823ec8c55ed81659d6613ea9be93。随后文档提交/合并不重建运行镜像。

## 运行版本

- 迁移由 b3c4d5e6f7g8 升到 c4d5e6f7g8h9，PostgreSQL 事务迁移正常。
- backend 镜像 sha256:717a898a905572a59a4ef53cfff0c290c575e1c00d28804d5edd0dad827e066e。
- worker 镜像 sha256:c089a6fb3d8356084c38f834e2e01cf1058f72ee6494de88cdad72c7fba8d00c；3 副本运行。
- frontend 镜像 sha256:f404df6944a6f5087aabf27f681268410928c5532d414f4656a8fe4cf6e61e7c。
- backend/DB/Redis 健康，frontend 与 worker 正常；根分区 64%，约 17GB 可用。
- .env SHA256 与备份一致，未改加密 key、生产配置、卷或媒体；没有 ODA 接入、CAD 修改、清理或 18010 操作。

## 备份与恢复

- 服务器配置/数据库：/www/backup/qmdh-release-20261010-151347，目录 700/.env 600。pg_restore --list 通过；配置和数据库与本机配对副本哈希一致。
- 本机：E:/backups/QMDH-web/release-20261010-151347，Admin/SYSTEM ACL；配置、database.dump、media.tar.gz、media-delta.tar.gz、manifest.json、RESTORE-NOTES.txt。
- 整包媒体 14,600,059,674 字节，5769 tar 条目，完整 gzip CRC/每个文件读检通过。
- 流式归档命令非零退出，未直接忽略；比较发现备份期间 3 个新上传，原有文件在 tar 时间精度下大小/mtime 一致。补 15,809,184 字节增量，CRC/逐项读检通过。整包+增量覆盖当前全部 5740 文件，文件名/大小/mtime 再比对一致。原退出 stderr 未保留，因此不推断其他确切退出原因；完整性依据上述读检和补全。
- 恢复媒体先解整包，再覆盖增量；不要只还原整包而遗漏新增文件。完整 SHA256 和恢复顺序见私有 manifest，服务器也保存该 manifest。未在服务器复制 14GB 媒体，避免占满根分区。
- 旧镜像标签 qmdh-release-backup-{backend,worker,frontend}:20261010-security 保留。新凭证/事件存在时拒绝降级，应用回退保留新增表/列，不自动 downgrade，不 down -v。

## 发布与保护

admin pull --no-rebase，带一次性 Git 身份；生产历史非快进合并，不能强制覆盖成 GitHub 树。server 原有 Nano Banana 四文件与发布前 92fbe2e 完全一致，backend/frontend 仅这四文件不同于 GitHub 55216ab；此前相关 5 项回归已通过。

依次构建 backend/worker/frontend、新镜像迁移、compose up -d --no-build --scale worker=3。原 styles.css 的 13 行、比较文档和 _tmp_* 保留未提交，.env/app.db/storage/临时脚本未提交。

## 验证

- GitHub CI https://github.com/csyhnine/QMDH-web/actions/runs/38033776960 成功：Linux 后端 103 passed、16 subtests；前端 15 回归、23 既有/0 新增 TS 错误与构建通过。本地 102 passed/1 Windows 链接权限跳过。
- 从发布备份还原隔离 PostgreSQL DB qmdh_feedback_release_20261010_151347。新迁移、专用凭证不能调用 Agent 接口、正常去重、pending 不改状态、核实后聚合/重开、驳回和撤销通过。
- PostgreSQL 20 独立会话争抢 5 次配额，恰好 5 成功/15 个 429，计数一致。测试仅写隔离副本；结束 dropdb，后续检查该 DB 数量 0。
- 新 nginx -t 通过；隔离无端口映射前端实测 70KB 请求 413，45 次匿名请求触发 13 次 nginx 429；临时容器已移除，未提交认证事件。
- 公网 https://cityusbdisk.cn：health/CAD/反馈页面 200；未认证、旧 Agent header、伪造反馈 token 均 401；超大请求 413；管理 summary/issues/events/credentials 未登录 401。
- 部署的新反馈 JS bundle 包含待核实视图和凭证管理。生产 read-only 事务下真实新 schema 的 summary/issues/events/credentials、旧人工反馈及导航计数查询 200（进程内权限替身，不等同真实浏览器登录）。生产凭证数 0，没有合成测试数据写入业务库。
- 最近 backend/worker 日志 Traceback/UndefinedColumn/UndefinedTable/ImportError 均为 0；当前无 pending/running 任务。

## 剩余工作

管理员发按用户/设备限定的反馈凭证，再制作并联调 WorkBuddy/Codex 采集 skill；不把共享密钥写入 skill。真实浏览器交互仍待验收，不能把页面 HTTP 200 说成端到端操作已验收。

构建 npm ci 报告现有依赖审计 15 项（5 high），本轮未更改锁文件或自动 audit fix；需另行分类核实影响，未把该报告当作已修复。原 TS 23 项基线保持。

CAD 仍生产先收 DXF；等待用户官方 Linux ODA 包，不自行下载/安装。媒体引用审计/清理未执行。本次反馈是静态不可信数据，不会自动执行、改写或发布 skill。
