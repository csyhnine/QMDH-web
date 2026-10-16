# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-16] 新对话冷启动留档 — 可直接接手

- 用户要求先留档，下一对话继续。本轮仅 Git/生产只读核对与正式文档整理，不新增功能、不构建部署镜像、不写业务数据。冷启动主档：archive/handoff-2026-10-16-next-conversation.md，替代 10-13 旧 next-conversation 的“当前状态”，旧档保留作历史。
- 留档前本地 codex/management-workbench，HEAD/origin/main 9420bf2、0/0。生产文档合并 5cc038b9，前端功能运行合并 787d2370，镜像 85b3652ed57b8ce9548d81940da1944d08fa7b538a795659f9b0fdede13ee7eb；schema a16c9e74b821，后端 healthy/三 worker/其他依赖正常，生产工作区干净。
- 四视图工作台已部署，勿重复开发；六个授权账号含 admin 保持启用。只读快照项目 0、名册 5，后续须读实时数据。真实管理员公网登录 UI 验收、真实员工/项目录入仍待继续，不能用本地 mock 验收冒充；未承诺自动排程/导入/假期日历。
- 最近功能 CI 38873245073 与发布文档 CI 38873869117 成功。原 styles.css +13/-0、比较文档与 _tmp_* 保持，未纳入提交。备份链、秘密来源、ODA/代理配置、CAD 禁重跑记录和其他未完任务均在冷启动主档。
- 新对话先依 protocol 读 tasks/handoff/冷启动主档/相关代码，再按用户新需求推进；既有管理名单/管理员授权无需再问。Safe to hand off: Yes。

### [2026-10-16] 管理工作台与交互排期 — 已部署

- 514a8cb/ce31075，生产前端运行合并 787d2370；同一 /management/projects 分管理总览/项目台账/项目计划/人员排期，台账列显隐分组排序、右侧详情与搜索勾选人员。旧六人授权（含 admin）、API、记录、金额语义保持，无迁移。
- DHTMLX Community 10.0.3 MIT 精确依赖与许可文件，项目计划懒加载；拖动/拉伸/进度先预览、可查看前后变化、显式按版本逐项目保存，部分失败只移除成功项，失败/未尝试保留。归档只读，禁止父项目拖动/依赖写入与自动排程；人员负荷自行按日历日计算。HTML 转义、空值与精确金额汇总保留，未填假项目。
- 本地 Chrome headless 实际组件与真实页壳：四视图/拖动/撤销/确认保存/409 保留/页内离开取消/抽屉/390px 导航筛选及图内滚动均通过，浏览器错误 0。数据与 transport 为本地样例，未声称正式账号登录点击验收；cua 仍 kernel assets 路径错误。临时预览目录/服务已清理，样例/脚本/六截图存私有备份。
- CI 38873245073 成功：Linux 后端 197 passed/16 subtests，前端 43 项/23 既有 TS 错误/0 新增/构建成功。5799 媒体/26 文件增量 122595063 字节，两端 release-20261016-management-workbench 备份及媒体完整读取/30 文件 SHA256 通过，restore-media-chain.json 引用上次完整链。
- 只更新 frontend，新镜像 85b3652ed57b8ce9548d81940da1944d08fa7b538a795659f9b0fdede13ee7eb；backend/三 worker/postgres/redis 容器 ID、启动时间、镜像前后完全一致，未中断生成服务。公网入口/health 200，管理未登录 401，ManagementProjectsPage-DELNWkYr.js 和 dhtmlxgantt.es-DPXjonIM.js/许可证可访问；六条 CAD 代理检查通过。
- SQL READ ONLY 确认六人权限与 admin 仍启用，正式项目 0，schema a16c9e74b821；env/key 不变，styles 13 行/比较文档/原临时文件、媒体与数据卷保护。详见 archive/handoff-2026-10-16-management-workbench.md。Safe to hand off: Yes。

### [2026-10-16] 公司管理层项目台账与甘特图 — 已部署

- 后续明确授权：用户要求管理员使用自己的账号管理，已为现有 admin（id=1）单独开通二分院项目管理权限，职务标记“项目管理管理员”，未冒充公司领导；其余账号不变，其他网站管理员/ops 仍不自动获得权限。auth/me 与三条只读管理路由 200 验证，审计及前后配置保存在服务器 /www/backup/qmdh-management-admin-20261016 与本地 E:/backups/QMDH-web/management-admin-20261016，SHA256 一致；配置即时生效，无代码部署。
- db376ec / 生产运行合并 3ba7989d；/management/projects，年度台账全字段、人员名册、阶段/里程碑/进度/分配比例、按项目/人员甘特及日历日超额提示、CSV、归档恢复、版本冲突保护/修订快照。无真实项目明细，不填假项目。
- 独立 users.company_management/unit/position，当前个人 Bearer＋实时单位隔离；网站 admin/ops 不自动获得财务权限。用户确认的新二分院五位管理层唯一匹配现有账号后授权，角色/旧二四分院分组不改。名册目前仅五位确认人员，可自行补员工，不赋予名册成员网站权限。授权已记审计，私有脚本不入 Git。
- 迁移 a16c9e74b821（三列四表）。生产恢复副本保留 45 原业务表计数、70 账号姓名/角色/分组；真实会话、五人访问、普通管理员拒绝、保存/归档/冲突/修订/撤权通过。空库直接旧链缺 chat_messages 已单列 TODO；现有建表流程后新迁移通过，未改旧迁移。
- 本地后端 196 passed/1 skipped/16 subtests，CI 38865978617 成功：Linux 197 passed/16 subtests、前端 39 项/23 既有/0 新增类型错误/构建。组件事件覆盖新增阶段、保存、冲突保留输入；浏览器 kernel assets 路径故障，未宣称真实登录点击验收。
- 配对备份 release-20261016-management-projects（/www/backup/qmdh-release-20261016-management-projects 与 E:/backups/QMDH-web/release-20261016-management-projects）发布前后数据库/config/5773 媒体零增量、23 份文件 SHA256 校验；restore-media-chain.json 引用旧完整链，旧镜像标签保留，env/key 不变。隔离验证库已删除，正式业务不删。
- backend healthy/三 worker/新前端已运行；SQL READ ONLY 正式数据验证五人权限/台账/名册、无假项目、网站管理员/ops 拒绝。公网管理接口未登录 401、前端入口/health 200，ManagementProjectsPage-C61G32Jb.js；六条 CAD 代理检查通过，FFmpeg/Xvfb/ODA 输入、Nano Banana 生产历史差异、媒体卷/18010、原 styles 13 行等均保护。详情 archive/handoff-2026-10-16-management-projects.md。
- Safe to hand off: Yes。
