# Skill 采集与改进后台

2026-10-10 本地实现，未提交/部署。此前提交推送部署请求已被用户“等一下，先调整反馈”暂停；本轮未进行 Git 写操作或生产操作。

## 数据与收件箱

- `skill_feedback_runs`：接入客户端内唯一的任务关联 ID，固定平台、skill 名称和版本。
- `skill_feedback_events`：原始执行、评测、交付、纠正、问题、复测事件；不可通过本接口修改已有事件。保留事件时间、接收时间、来源、证据和评测。原始事件用于后台审计，不逐条进入收件箱。
- `skill_feedback_issues`：按 skill 名称 + 版本 + 稳定 problem_code 聚合；跨平台的同版本同类问题可聚合，每次证据保持独立并能回溯关联任务。此处是确定性分类聚合，不声称能自动判断任意文本的语义相似性。
- 原人工表单线程保留，来源标记为人工；新增改进状态，与沟通状态分别管理。旧关闭状态保留兼容，不等于问题已解决。

后台页面展示聚合问题、两类状态、根因、修改建议、复测结果、回复记录，以及各次评分/评测、证据和来源；可转到同一任务的全部事件。正常完成按交付事件 `evaluation.outcome=completed` 统计关联任务数，重复完成事件不重复计任务。原始事件和问题列表分页，不把工具日志写入对话线程。

沟通状态：`pending_reply` 待回复、`replied` 已回复。改进状态：`pending_analysis` 待分析、`pending_modification` 待修改、`pending_verification` 待验证、`resolved` 已解决。标记已回复须有回复记录；标记已解决须填写复测结果。保存根因/改进进度不会自动发出回复；后台回复记录不向 WorkBuddy/Codex 发送消息。

新的人工作出纠正会将已回复改为待回复，并重新打开已解决问题。其他新问题证据会重新打开已解决问题；通过的复测只追加证据，不自动关闭问题，管理员确认解决。管理员修改写入既有审计日志。

## 自动接收契约

`POST /api/v1/feedback/skills/events`，复用已注册 Agent 客户端凭证：`X-QMDH-Agent-Token`，可选 `X-QMDH-Agent-Key`。不要把凭证提交到 skill 仓库；凭证管理复用现有机制，本次不新增真实凭证。

```json
{
  "event_id": "event-uuid-2",
  "correlation_id": "task-uuid-1",
  "platform": "codex",
  "skill_name": "local-project-research",
  "skill_version": "1.2.0",
  "source": "human",
  "event_type": "user_correction",
  "problem_code": "images_insufficient",
  "summary": "用户要求补充现场图片",
  "evidence": [{"quote": "图片不足，请补充现场图片", "stage": "after_delivery"}],
  "evaluation": {"score": 2, "scale": 5, "rubric_version": "r1", "reason": "交付覆盖不足"},
  "occurred_at": "2026-10-10T10:00:00+08:00"
}
```

- 采集端每次任务生成 UUID 作为 correlation_id，执行/评测/交付/后续纠正始终复用；服务端自动建立 run_id。不同客户端的同名关联 ID 互不混用；同一客户端任务的 skill 名/版本/平台不能中途改写。新版本复测建立新任务，证据可保留旧问题编号。
- 每个事件生成固定 event_id。相同客户端重试同一 ID + 相同规范化内容返回 duplicate=true；ID 相同但内容改变返回 409。返回服务端 event_id/run_id，不向采集客户端开放聚合问题或其他人的事件。
- source 为 `human`、`system`、`ai_inference`；来源由采集端声明，服务器不把声明认证为“确实是用户原话”。AI 推断不能冒充 user_correction：后者只接受 source=human。后台显示声明来源，推断证据不等于已核验事实。
- event_type 为 execution/evaluation/delivery/user_correction/problem/retest。没有 problem_code 的正常数据仅用于统计；execution 即便带代码也不创建问题。problem/user_correction 必須有稳定 problem_code。evaluation/delivery/retest 提供 problem_code 时关联改进问题，因此正常完成不要携带问题代码。
- 建议代码：`missing_original_citation` 缺原文引用、`images_insufficient` 图片交付不足；其他纠正用具体稳定代码，不能所有纠正都用一个泛化标签。
- evaluation 可携带评分、量尺、评测标准版本、根因推断、建议、复测 outcome；证据最多 20 条，事件规范化 JSON 总量最多 64 KiB，summary 最多 4000 字符，occurred_at 必须含时区。
- 仅提交与改进有关且获用户授权的证据，不发送平台令牌、密钥、整段无关聊天。此轮没有创建反馈 skill、安装到平台或采集真实用户数据；采集端实际联调仍待做。

## 管理接口与发布

现有 admin/ops 内容运营权限保护：`GET /feedback/skills/admin/summary`、`GET /feedback/skills/admin/issues`、`GET /feedback/skills/admin/events`、`PATCH /feedback/skills/admin/issues/{id}`。问题/事件页最大 100、默认 50；before_id 分页；事件可按 issue_id 或 run_id 回溯。人工反馈独立改进入口：`PATCH /feedback/admin/{id}/improvement`。导航待处理数只统计人工待回复线程与需要关注的聚合问题，不统计所有事件。

新增 Alembic head `b3c4d5e6f7g8`，父 `z1a2b3c4d5e6`；生产仍为旧迁移快照。发布必须先备份并执行迁移，再同时更新前后端；不依赖应用启动 create_all/ensure_schema 代替迁移。数据库历史保留，原人工反馈初始改进状态为待分析，旧回复/关闭不自动推断解决。

验证：临时 SQLite API 回归覆盖正常事件静默、聚合/去重/版本隔离、关联任务、来源、真实 Agent 鉴权与管理员权限、独立状态、重开、旧反馈兼容；新增迁移升级/降级验证保留原反馈。前端类型基线未扩大。未做真实 PostgreSQL、跨进程并发压力、平台联调和浏览器交互验收。

2.0 兼容：采集记录属于长期业务历史，与 Task 执行模型解耦；来源与工件证据结构化，原始事件不可被聚合覆盖。没有新增编排引擎，不改变现有生成任务、CAD 或媒体存储行为。
