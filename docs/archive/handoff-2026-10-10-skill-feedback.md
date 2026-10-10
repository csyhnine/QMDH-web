# Skill 反馈改造 — 2026-10-10

状态：本地实现/回归完成，未提交/push/部署。原分支 feature/studio-perf-003-history-pagination，基线 65c47a0。前序 Studio、质量检查、媒体审计与文档工作均仍未提交。用户要求发布后又明确“等一下，先调整反馈”，发布保持暂停。

实现：SkillFeedbackRun/Event/Issue、UserFeedback.improvement_status，迁移 b3c4d5e6f7g8（父 z1a2b3c4d5e6）。POST /api/v1/feedback/skills/events 复用 Agent 鉴权、任务关联/来源/skill版本/幂等；原始事件独立保存，不逐条进收件箱，同问题代码和版本聚合。管理面板可查证据/评分与同任务全过程，保存根因/建议/复测/回复记录，沟通与改进状态分开。旧人工反馈继续使用原接口与回复线程，并能独立保存改进状态。

验证：完整隔离检查 93 passed + 16 subtests、1 skipped；最后反馈专项 23 passed。SQLite 迁移升降级保留原反馈/回复状态，前端统一检查通过（23 既有类型错误/0 新增）。Windows 媒体链接测试仍跳过；PostgreSQL 实际迁移、跨进程并发、平台联调、浏览器交互未验收。

契约/限制：docs/skill-feedback.md。采集端生成 UUID/稳定事件 ID 与问题代码；是确定性代码聚合，不是语义分类器。source 是授权采集客户端声明，AI 推断单独显示，不验证原话真实性。未创建或安装反馈 skill、未注册真实凭证、未采集真实用户数据、未发外部消息。

下一步：审阅并验收采集端与后台；恢复发布需明确指令，发布前备份并执行新迁移。生产当前版本/加密 key/数据卷/旧图保护不变，不自行取得 ODA。原访客 styles.css、比较文档与临时脚本仍排除。

Safe to hand off: Yes。

迁移链收尾：发现最初拟定编号与早期迁移重复，已改为 b3c4d5e6f7g8；新增全仓库迁移链测试确认单一 head 和父链。最终反馈/迁移专项 23 passed。未修改任何已存在的旧迁移。
