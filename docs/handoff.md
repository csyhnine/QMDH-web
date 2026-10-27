# Handoff

## 当前接手入口

先读[新对话开发交接：项目管理（2026-10-27）](handoff-management-2026-10-27.md)。当前明确功能请求已提交、推送、上线；最新一轮为交付物选填、项目计划按周与统一自定义日历。后续按用户新需求继续，不恢复已删除的入口/字段。

保留`bugfix/migration-bootstrap-001`，草稿PR #5不合并；72待验收/25冻结/R98状态保持。`docs/checks.md`、`docs/plan.md`、`docs/review.md`是既有未提交文档，不覆盖或顺带提交。完整工作区保护、线上基线、备份链、CI已知失败、代码导航和验证方式均在新交接文件。

## Latest Handoffs（仅保留最新3条）

1. **2026-10-27 统一日历与项目周计划已上线**：前端源码a9becdf、镜像967cdf8608fa；交付物选填，项目支持自然周，所有管理日期使用同款顶层自定义月历。20前端定向/13目标strict零新增/7新+10回归浏览器场景、52文件/10资源/9路由通过。当前第三Compose为`/opt/qmdh-frp/releases/calendar-week-20261027/compose.release.yml`；26文件配对备份SHA一致，DB/媒体继承pillars基线。见[记录](calendar-week-2026-10-27.md)。
2. **2026-10-27 快捷调整和交付节点已上线**：前端源码daf2fcb、镜像7e8ddd868f73；去掉自动保存冗余提示，人员/甘特工作条就地暂停/恢复/支援，甘特空白日期格和项目行插入单日交付节点。20前端定向/13目标strict零新增/10完整浏览器场景，52文件/10资源/9路由通过。当前第三Compose为`/opt/qmdh-frp/releases/quick-actions-20261027/compose.release.yml`；26文件配对备份SHA一致，DB/媒体继承pillars基线，无新数据快照。见[记录](quick-actions-2026-10-27.md)。 前端已由最新一轮替换。
3. **2026-10-27 确认框居中已上线**：前端源码51bf2de、镜像24aec6613906，页面内关闭/删除/切换/覆盖统一站内HTML dialog，浏览器beforeunload保留。19前端定向/12目标strict零新增/7完整浏览器场景；52文件、10资源、9路由已核验。当前第三Compose：`/opt/qmdh-frp/releases/center-confirm-20261027/compose.release.yml`。纯前端配对备份25文件，DB/媒体继承pillars基线，无新数据快照。见[记录](center-confirm-2026-10-27.md)。 前端已由最新一轮替换。

## 使用规则

只保留最新三个交接入口；旧完整记录已逐字节移到[历史handoff](archive/handoff-before-2026-10-27-management.md)，其中相对链接按原docs目录解析。写给冷启动代理，WIP和未验收必须明确，不把旧版本号或定向通过当整套通过。后续只调整交接文档时不重复部署。
