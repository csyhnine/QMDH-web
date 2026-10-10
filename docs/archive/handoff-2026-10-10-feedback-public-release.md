# 固定 Skill ID 与自助临时凭证发布

2026-10-10：**已提交、推送、部署**，用户明确授权。

## 版本与行为

- GitHub 功能提交 514de6977ca966159f1f76936aea1dbfefe7cd35。
- 生产发布合并 7b310f9ecf144f1e84263bbd028e34ccc5cd8ce9；backend、worker、frontend 从其构建并重启。后续文档合并不重建镜像。
- 生产迁移 d5e6f7g8h9i0（父 c4d5e6f7g8h9）。此原未发布迁移已修订为固定 ID，不需要从曾用的一次性测试数据库升级。
- admin 登记公开 skill_id、复制、改名/停用；同名分配不同 ID，版本升级不重复登记。外部 skill 不需公司账号，用 ID 申请单任务一小时/十次反馈凭证；名称/版本仍是客户端声明。
- 原始数据、核实和改进继续分层；匿名会话不计作人数，同 ID 的改名不拆分同类问题，不同 ID/版本分开；旧公司凭证/历史归属与去重哈希兼容。ID 不是来源真实性证明，不自动执行反馈内容。

## 备份与保护

- 服务器配置/DB /www/backup/qmdh-release-20261010-171226，配对本机 E:/backups/QMDH-web/release-20261010-171226；目录限制权限，本机 Admin/SYSTEM，服务器目录 700、env 600。
- 新 DB dump 经 pg_restore --list、完整隔离恢复及迁移验证；配置和 DB 两端 SHA256 一致，生产 .env 前后校验一致。未改变加密 key、代理信任配置或其他生产环境变量。
- 媒体复用今日已完整读取/CRC 验证的 14,600,059,674 字节整包和 15,809,184 字节增量，通过 SHA256 确认未变化，在新备份目录建立硬链接。当前 5740 文件大小/整数 mtime 与两包合并元数据一致，无新文件需补包。manifest/RESTORE-NOTES 标明恢复顺序，服务器保留配对清单，本机保留实际媒体包；恢复须先 media.tar.gz 再 media-delta.tar.gz。不重新下载相同整包，不清理媒体。
- 发布前旧镜像标签 qmdh-release-backup-{backend,worker,frontend}:20261010-public 保留；回退镜像时保留新表/列，有登记或匿名会话后不降级。此前 security 标签与备份保留。
- server git 由 admin pull --no-rebase，保留 Nano Banana 四文件，与既有版本字节相同；其他 backend/frontend 与 514de69 一致。
- .env、backend/app.db、storage、_tmp_*、原 styles.css 13 行和比较文档未提交；CAD/ODA/布置算法/生成/18010/数据卷不动。未安装平台反馈 skill、登记真实 ID 或向生产提交测试证据。

## 验证

- 本地后端 122 passed + 16 subtests、1 skipped（Windows 链接权限）；前端 16 项、23 既有/0 新增 TS 错误与构建通过。
- GitHub 功能 CI 38040818927 success：Linux 后端 123 passed + 16 subtests、前端 16 项；https://github.com/csyhnine/QMDH-web/actions/runs/38040818927。
- PostgreSQL 发布前数据库隔离副本：完整恢复、新迁移、公司凭证权限/核实/重开/驳回/撤销；固定 ID、重名、升级沿用、改名聚合、匿名统计、停用后重开不恢复旧 token；公司额度与公开共享额度均在 20 并发争抢 5 次中仅 5 放行/15 拒绝，拒绝会回滚全局扣减。副本已移除，查 pg_database 数量为 0。
- nginx -t 通过；独立临时 frontend 实测 events 64 KiB、sessions 4 KiB 及两套限流，45 次事件请求中 13 个被 nginx 拒绝，sessions 也出现 429。临时容器已移除，不发布端口、不提交认证证据。
- 生产 backend healthy，3 个 worker/frontend 正常，DB/Redis healthy；公网 health、CAD、反馈页面 200。新 sessions 拒绝未登记 ID（403）和超大体（413）；events 未认证/错误业务令牌/错误反馈令牌 401；所有管理接口未认证 401。
- 生产新表/列、七类后台 GET 在只读事务内通过；登记 skill 与反馈凭证数量均为 0。公网实际 JS 包包含固定 ID 登记和核实入口；不宣称已做真实登录后的浏览器点击或 WorkBuddy/Codex 平台联调。
- 最近 backend/worker 日志 Traceback/UndefinedColumn/UndefinedTable/ImportError 均 0；当前 active tasks 0，根分区约 64%，可用 17GB。

运行镜像 ID：

- backend sha256:240ec7bf054818acacb2115f3365e3abd1e7be57708219f695df97151a802c96
- worker sha256:3ca82dc79209b5bfa16c4a5142d0ef4506317d64933ed3dbdf125d46bae46115
- frontend sha256:4d4f84fdd62e69e3a857aa7c236cd20299c69dbece8090dc2884f557be2dfc51

## 下一步与限制

管理员在反馈页登记实际 skill，复制公开 ID 交给开发 agent，再按 ../skill-feedback-integration.md 联调。生产仅收 DXF；官方 Linux ODA 继续等用户提供。

QMDH_FEEDBACK_TRUSTED_PROXY_CIDRS 保持默认空；Uvicorn 默认仅信 localhost，frontend 位于 172.20.0.0/16。实际代理后终端用户会共享来源预算，当前公开申请按该共享来源每小时 5/每天 20，提交每小时 50/每天 100；还有全局配额。若扩大使用，先核验宝塔到 frontend 的真实 IP 覆盖链路，再按精确可信代理配置，不信任全网或客户端 X-Forwarded-For。公开匿名预算仍可被恶意耗尽；停用对应 ID 可关闭接入。

2.0 兼容：固定身份、任务、证据和核实/改进关联保留；登记为配置，配额为运行态，业务历史不自动删，不引入编排与执行权限。

Safe to hand off: **Yes**。本轮发布已完成；平台/浏览器真实交互是下一步联调，未伪造为通过。
