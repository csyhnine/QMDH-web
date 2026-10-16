# 从最近交接归档的原摘要

### [2026-10-16] 公司管理层项目台账与甘特图 — 已部署

- 后续明确授权：用户要求管理员使用自己的账号管理，已为现有 admin（id=1）单独开通二分院项目管理权限，职务标记“项目管理管理员”，未冒充公司领导；其余账号不变，其他网站管理员/ops 仍不自动获得权限。auth/me 与三条只读管理路由 200 验证，审计及前后配置保存在服务器 /www/backup/qmdh-management-admin-20261016 与本地 E:/backups/QMDH-web/management-admin-20261016，SHA256 一致；配置即时生效，无代码部署。
- db376ec / 生产运行合并 3ba7989d；/management/projects，年度台账全字段、人员名册、阶段/里程碑/进度/分配比例、按项目/人员甘特及日历日超额提示、CSV、归档恢复、版本冲突保护/修订快照。无真实项目明细，不填假项目。
- 独立 users.company_management/unit/position，当前个人 Bearer＋实时单位隔离；网站 admin/ops 不自动获得财务权限。用户确认的新二分院五位管理层唯一匹配现有账号后授权，角色/旧二四分院分组不改。名册目前仅五位确认人员，可自行补员工，不赋予名册成员网站权限。授权已记审计，私有脚本不入 Git。
- 迁移 a16c9e74b821（三列四表）。生产恢复副本保留 45 原业务表计数、70 账号姓名/角色/分组；真实会话、五人访问、普通管理员拒绝、保存/归档/冲突/修订/撤权通过。空库直接旧链缺 chat_messages 已单列 TODO；现有建表流程后新迁移通过，未改旧迁移。
- 本地后端 196 passed/1 skipped/16 subtests，CI 38865978617 成功：Linux 197 passed/16 subtests、前端 39 项/23 既有/0 新增类型错误/构建。组件事件覆盖新增阶段、保存、冲突保留输入；浏览器 kernel assets 路径故障，未宣称真实登录点击验收。
- 配对备份 release-20261016-management-projects（/www/backup/qmdh-release-20261016-management-projects 与 E:/backups/QMDH-web/release-20261016-management-projects）发布前后数据库/config/5773 媒体零增量、23 份文件 SHA256 校验；restore-media-chain.json 引用旧完整链，旧镜像标签保留，env/key 不变。隔离验证库已删除，正式业务不删。
- backend healthy/三 worker/新前端已运行；SQL READ ONLY 正式数据验证五人权限/台账/名册、无假项目、网站管理员/ops 拒绝。公网管理接口未登录 401、前端入口/health 200，ManagementProjectsPage-C61G32Jb.js；六条 CAD 代理检查通过，FFmpeg/Xvfb/ODA 输入、Nano Banana 生产历史差异、媒体卷/18010、原 styles 13 行等均保护。详情 archive/handoff-2026-10-16-management-projects.md。
- Safe to hand off: Yes。
