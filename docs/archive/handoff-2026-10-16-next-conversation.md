# 2026-10-16 新对话冷启动交接

## 本次交接目标

用户要求先留档交接，再由新对话继续开发。本轮只整理文档、核对 Git 和只读生产状态，不新增功能、不重建镜像、不写生产业务数据。代码优先于文档。10-13 的 next-conversation 是历史反馈任务快照，不能覆盖本档描述的已上线功能与授权。

## 当前代码、部署与保护文件

- 本地 E:/projects/QMDH-web，分支 codex/management-workbench。留档前 HEAD/origin/main 同为 9420bf2852879550f8704bc245185a3dc1ced955，左右差异 0/0。本次留档会再产生文档提交，以 Git 为准。
- 功能提交：db376ec（管理台账后端/第一版前端）、514a8cb（四视图工作台）、ce31075（窄屏时间轴）；管理员授权留痕 c04f008；最新发布记录 9420bf2。
- 留档时生产 Git 5cc038b9（合并发布文档），实际前端镜像来自功能合并 787d2370，sha256:85b3652ed57b8ce9548d81940da1944d08fa7b538a795659f9b0fdede13ee7eb。不要把后续纯文档 Git 合并误当成新镜像发布。
- 留档时 backend healthy、frontend running、3 worker running，postgres/redis/meilisearch healthy，生产工作区干净。数据库迁移头 a16c9e74b821。上一轮仅替换 frontend，backend/worker/postgres/redis 的 ID、启动时间和镜像前后完全相同。
- 唯一已跟踪未提交文件仍是 frontend/src/styles.css 原访客样式 +13/-0；另有 docs/compare-qmdh-openclaw-codex.md、scripts/_tmp_* 等原未跟踪文件，全部保留，不混入提交，不盲跑旧脚本或按旧 stash 序号恢复。
- 本轮没有待提交的功能 WIP。frontend/.management-preview 临时本地夹具、5179 Vite 服务均已清理；真实样例截图和复测脚本在私有备份，不在 Git 或生产数据中。

## 用户业务意图与已经确认的授权

- 项目管理供领导给员工安排项目和甘特图，覆盖年度项目台账、六类项目成员、下周工作/用人、阶段节点、等级紧急程度、投资/设计费/合同/回款/已开票请款、模式/来源/类型/阶段/备注。
- 用户明确：原二分院和四分院合并为新的二分院。公司职务独立于网站 admin/ops/designer，不把 ops 自动视作公司领导；原账号分组和个人生成项目历史不搬迁。
- 用户给定管理架构：执行院长袁伟铭；副院长王海洋、许潇、郑国梁；总监林昱。五个现有活跃账号已唯一对应并授权，真实名单/配置脚本保存在私有发布备份，不需重复询问授权名单。
- 后续用户明确要求自己使用管理员，不登录领导的私人账号。已为 admin（id=1）独立开通二分院项目管理权限，company_position 标记“项目管理管理员”，不冒充公司领导；其他网站管理员没有自动获得权限，ops 仍无自动权限。
- 留档时授权 ID：[1,16,28,33,48,53]。以实时 users.company_management/company_unit/company_position 与个人会话决定接口权限，停用/撤销立即生效。前端仅按 auth/me 显示入口，后端始终重新检查。
- 留档只读快照：management_projects=0，management_staff=5，年度台账初始化为用户给定编制人与 2026-10-12 资料日期。其余员工和真实项目还未录入；新对话必须重新读取最新数据，不把快照当永久断言，不批量授权或填假项目。名册不是网站授权，允许无网站账号的员工。

## 已上线能力与代码入口

入口 https://cityusbdisk.cn/management/projects。用户已认可参考 Worklenz 界面、OpenProject 组织层级和成熟甘特组件，但没有要求换整套平台。

- 管理总览：所选年度/当前筛选的在册数、本周未完成节点、延期阶段、已开票请款金额、人员负荷与项目进展。金额 Decimal 字符串→精确整数分汇总，未知与确认 0 区分。
- 项目台账：默认关键列、列显隐、阶段/统筹/紧急程度分组、列排序、CSV 全字段导出。右侧详情分区编辑，人员搜索勾选；全部初版字段保持。
- 项目计划：DHTMLX Gantt Community 10.0.3 精确锁定，MIT 原文保留 frontend/public/licenses/dhtmlx-gantt-MIT.txt；仅视图进入懒加载、实例销毁重建。稳定阶段 ID、包含结束日↔组件排他结束日转换，项目树、里程碑、拖动日期/拉伸工期/调整进度。
- 变更先在内存预览，展示前后日期/进度，显式保存或撤销。按原项目版本顺序提交，成功项从待办移除，失败/未尝试项保留。跨项目不是原子事务，不假装全量成功；提示标明单个已保存项目。冲突后可复制变更，再撤销刷新后重新应用。
- 人员排期：7/14 日，每人分配比例、阶段工作条、超额日与未安排提示；按日历日包含周末，不等于考勤、工时或绩效。不使用商业 PRO 资源管理/自动排程功能，没有依赖编辑或自动串改工期。
- 归档计划只读预览，可通过台账恢复。任务/人员 HTML 转义。页内切换/筛选/刷新和侧栏离开提示未保存内容，刷新关闭 beforeunload；浏览器前进后退尚无全面拦截保证。
- 移动端仅 management-shell 局部适配，侧栏横向滚动，图内横向滚动不撑宽整页。原全局 styles 未动。

关键文件：

- frontend/src/pages/management/ManagementProjectsPage.tsx：加载/筛选、四视图、详情抽屉、原台账完整编辑表单、人员/台账信息维护。
- 同目录 ManagementOverview.tsx / ProjectLedger.tsx / ProjectPlan.tsx / PeopleSchedule.tsx：各视图；ganttBridge.ts 是组件事件与渲染适配，planning.ts 为日期/金额/负荷/CSV/变更保存函数，management.css 是模块样式。
- frontend/src/components/shared/AppShell.tsx 与 features/studio/StudioGlobalRail*：两套入口，按独立公司权限显示。
- backend/app/routers/management.py：单位隔离、严格字段/金额/人员/日期验证、版本原子更新、修订快照；不复用 Studio projects。
- backend/app/models.py / schemas.py / routers/auth.py / routers/users.py：独立 User 公司授权与四张管理业务表。
- backend/migrations/versions/a16c9e74b821_company_planning.py：追加三列四表；不能误用已存在的历史 g8h9i0j1k2l3 ID。
- frontend/scripts/test-management.mjs、backend/tests/test_management.py；业务说明 docs/management-projects.md。

## 验收事实与尚未完成的部分

- 最近功能 CI 38873245073：Linux 后端 197 passed +16 subtests；前端 43 项、23 个既有 TS 错误/0 新增、构建成功。发布文档 CI 38873869117 也成功。本轮留档不重复运行无变化的功能测试。
- 本地独立 headless Chrome 实际渲染 DHTMLX 与真实 AppShell：四视图、拖动预览、取消离开、失败保留/撤销/再保存、抽屉、窄屏导航/筛选/时间轴，浏览器错误 0。数据与 transport 是本地 mock，不等于真实领导账号的公网业务验收。
- 新后端的生产数据库恢复副本曾验证 45 张原表计数和 70 账号基础信息不变、真实会话权限/撤权、持久化/归档/并发冲突/修订；正式库只读验证六人权限及 admin 启用。
- 公网已核对入口/health 200、管理未登录 401、新 ManagementProjectsPage-DELNWkYr.js、dhtmlxgantt.es-DPXjonIM.js、MIT 文件可访问，六条 CAD 代理检查保持。
- cua_repl 仍报 failed to write kernel assets: 系统找不到指定的路径。可以进行独立 headless 本地应用验收，不能声称操控了用户已登录浏览器或已完成正式账号 UI 验收。
- 未实现：真实项目/员工批量导入、阶段依赖和自动排程、工作日/假期日历、完整版本对比界面、全面前进后退离开拦截；这些是边界，不是已授权的新排期任务。
- migration-bootstrap-001：直接对纯空库运行全部历史 Alembic 链在旧 chat_messages attachments 缺表失败。生产版本副本升级、新建表流程后新迁移已通过；旧链尚未修复，不为交接擅自修改。

## 备份、连接与运行红线

- 最新发布备份配对：/www/backup/qmdh-release-20261016-management-workbench 与 E:/backups/QMDH-web/release-20261016-management-workbench。5799 媒体、26 增量 122595063 字节，完整读取校验；30 份发布证据 SHA256 一致，私有 local-browser-preview 有六截图及复测脚本。restore-media-chain.json 引用前一次管理发布的完整恢复链，不要只拷贝最新增量当完整备份。
- 上一后端/授权备份：release-20261016-management-projects；额外 admin 授权备份 /www/backup/qmdh-management-admin-20261016 与 E:/backups/QMDH-web/management-admin-20261016。Windows ACL 仅 Admin/SYSTEM OI/CI。
- 旧前端镜像标签 qmdh-release-backup-frontend:20261016-management-workbench 可回退程序；不能通过 downgrade 删除真实台账。数据库/config/媒体不得重置或写假 seed。
- SSH 项目路径 /www/wwwroot/qmdh-web，生产 Git 使用 sudo -u admin，允许保留历史的正常 merge pull，禁止 force/reset/盲用 ff-only。临时辅助 C:/Users/Admin/AppData/Local/Temp/qmdh-release-remote.py 可消失，不应成为长期依赖；连接配置/秘密只从既有受保护来源或私有备份获取，不打印或提交、不盲跑 _tmp_*。
- QMDH_ENCRYPTION_KEY 不换；env SHA256 cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f 保持。禁止 down -v、清理媒体/数据卷、占用或杀他人 18010。
- 保留生产 Nano Banana 历史四文件差异，backend image_aspect_ratio.py/task_executor.py 与对应测试不能被本地旧版强行覆盖。
- Linux ODA 27.9/Xvfb/FFmpeg 已部署，不再说转换器缺失。ODA 官方包是 Git 外私有构建输入，重建 backend/worker 时保留 vendor/oda 包名/SHA build args 与转换命令；本次只改前端不需重建它们。
- 宝塔 /api/v1/cad/extracts 前缀 300 秒、内部去尾斜杠 rewrite 必须保留；不重新引入缓存 301/HTTP 跳转。脚本 scripts/check-cad-proxy.sh 验证六条列表/详情只读路由。
- CAD 不自动重跑旧图：ce_94778ce26c6e 不重跑、ce_d2955df6f9b9 不生成、ce_b121e1b892de 不修改、ce_0abae8a9402f 不自动重转。系统通路仍有 partial/不可达情况，不宣称已完成疏散/连通审查。详见 CAD 三份归档。

## 新对话建议顺序

1. 按 docs/protocol.md 冷启动，核对 Git/未提交文件，读 docs/tasks.md、docs/handoff.md、本档、roadmap-2.0-prep 和相关 architecture/decisions，代码优先。
2. 先看用户本次新需求；没有具体新需求时，先只读核验当前部署/授权和实际数据、安排管理员真实页面验收，不重复开发已上线四视图或索要已给出的管理层名单。
3. 后续真实员工/项目导入需以用户提供的表格或核实数据为依据，不因本地样例存在就把样例写生产；不扩账号授权、不改旧分组归属。
4. 原 skill-feedback-004 仍 IN_PROGRESS，暂未取得真实平台完整产物。run_id=2 已核实并聚合 issue_id=1，不要回退 10-13 旧档而重复核实；继续时先只读查服务器最新反馈、正式 ID 与外部 skill 版本，详见 handoff-2026-10-13-feedback-live-verification.md。不要把匿名采集、元数据自评当真人纠正或平台完整验收。
5. 后续每个明确修改同步 tasks/handoff/架构，按变化运行有意义检查；发布前保全真实数据库/config/媒体恢复链与旧镜像。没有新授权的需求不要擅自展开其他 TODO。

Safe to hand off: Yes。已上线能力无待提交功能改动；用户要求在新对话继续，本轮只留档。
