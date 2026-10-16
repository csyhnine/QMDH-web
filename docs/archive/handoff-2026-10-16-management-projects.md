# 公司管理层项目管理发布 — 2026-10-16

## 实现与边界

功能提交 db376ec7d25482c24f002d568f1cd90e697a4900，生产运行合并 3ba7989d。/management/projects 使用独立实时公司授权；网站角色不改变，原二四分院分组/Studio 生成历史不搬迁。管理层名单按用户明确公司架构匹配并以私有脚本授权，五个账号分别记录公司职务与二分院归属，均为既有 designer。人员名册不绑定网站登录授权，当前初始五位已确认人员，其他员工由管理层维护；正式项目 0 条，不造示例。台账初始化为用户给定 2026 年、编制人及 2026-10-12 资料日期。

四张管理业务表和 User 三字段独立迁移 a16c9e74b821。JSON 文档 Pydantic 严格校验；金额 Decimal→字符串、空值与 0 区分；阶段稳定 ID，日期、进度、分配与人员归属校验。项目/台账/人员乐观版本拒绝覆盖，每次项目保存留快照，归档/人员停用保留引用与历史。GET revisions 最近 50 版，尚无图形版本对比。台账 CSV 仅输出当前筛选并防公式执行。

甘特按年度项目读取其跨年度阶段，14/30/90 日、项目/人员分组，按日历日累加每人分配，超过 100% 显示红底；不是考勤/绩效或自动资源优化。通过点击条目编辑日期、人员、比例、进度和里程碑，未实现拖拽。没有项目导入文件，当前为录入/CSV 导出。

## 验证

- 本地 196 后端通过、1 跳过、16 subtests；CI 38865978617 Linux 197 通过/16 subtests，前端 39 项/23 既有 TS 错误/0 新增/构建通过。新增 15 后端专项、5 前端专项；前端事件覆盖新建、加阶段、保存、冲突保留内容。
- 生产备份恢复到命名隔离 PostgreSQL，新镜像 migration 从 f7 升级通过；45 原业务表计数、70 原账号基础资料保持，默认无任何管理授权。仅副本授五人并建立实际会话，管理层访问/普通管理员拒绝/项目金额和排期保存/多人读取/归档/冲突/修订/撤权通过。
- 纯空库执行历史完整链在旧 chat_messages attachments 缺表处失败；属于既有链缺口，未为本需求改历史迁移。按现有 Base.metadata 建表流程初始化，标记前一版后新迁移通过；绝不能把这次说成完整空库迁移链已通过。migration-bootstrap-001 TODO 跟进。
- 正式发布迁移后私有最小授权与审计写入成功，既有角色/分组不变；SQL READ ONLY 读取并调用本地隔离 FastAPI 路由确认当前授权五人、网站 admin/ops 无权、名册 5、台账 1、项目 0。正式只读 API 测试采用可信依赖 profile，不冒充真实公网登录；真实会话鉴权在恢复副本覆盖。
- 公网管理四读接口未登录 401，/management/projects 和 health 200，新 bundle ManagementProjectsPage-C61G32Jb.js 包含三视图；六 CAD extracts 代理检查保持。浏览器工具 kernel assets 系统找不到路径，因此未验收真实管理账号浏览器点击。

## 备份与部署

两端私有 release-20261016-management-projects（服务器 /www/backup/qmdh-release-20261016-management-projects，本地 E:/backups/QMDH-web/release-20261016-management-projects）含发布前后数据库与 restore list、原 production.env、媒体清单/零增量、旧新镜像与 Git、构建和测试日志、最小授权脚本。5773 媒体未变化，restore-media-chain.json 指向上次完整备份链；23 份文件 SHA256 通过。Windows ACL Admin/SYSTEM OI/CI 继承保护。隔离测试数据库已删除。

迁移/授权前确认 active tasks=0，Docker 新镜像后台构建，先升级 schema、授予五人权限，再更新 backend/三 worker，健康后更新 frontend，nginx -t 通过。旧镜像 qmdh-release-backup-{backend,worker,frontend}:20261016-management-projects 可回退程序，不能 downgrade 删台账。环境 SHA256 cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f 保持。

运行镜像：backend 71b4bef91c3ad5bb1a4746014c953a261b7b2020ac9218a1b3cbcc29c1c1b596，worker 008054e54827a80c78133abc682c7c420af9c3c206ffe9c1da070c5e2923c72a，frontend c3eebef0025521da0cf88e16cfb86e8677331e52b4dea2d56b6bff27e2156cf9。Nano Banana 生产四文件前后 hash 一致，ODA 构建输入保持、FFmpeg/Xvfb 存在。原 styles.css 13 行、比较文档、临时脚本不提交；无清理媒体/重跑 CAD/操作 18010。
