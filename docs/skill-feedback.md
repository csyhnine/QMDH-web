# Skill 采集与改进后台

2026-10-10：安全改造 `55216ab` 已提交、推送并部署，生产发布合并 `30dfe26`，迁移 `c4d5e6f7g8h9`。已启用专用反馈凭证、硬限额与待核实机制，通用 Agent Token 不再用于反馈采集。生产凭证数量为 0；平台反馈 skill 尚未制作或安装，下一步按用户/设备发放独立凭证并联调。发布详档见 archive/handoff-2026-10-10-feedback-security-release.md。

## 安全边界

- 采集使用独立的 `X-QMDH-Feedback-Token`，不再接受通用 Agent Token。密钥只供提交事件，没有读取其他事件、核实反馈、生成图片、写项目资料或发布 skill 的权限。
- 管理员按用户与设备创建凭证，明确允许的 skill 名称和版本。默认 30 天过期，最多 90 天；可撤销，关联用户停用也拒绝下一次请求。
- 密钥随机生成，仅创建响应返回一次，响应 `Cache-Control: no-store`；数据库只保存哈希，列表与审计不返回原密钥。客户端在平台私有配置中保存密钥，不能写入 skill 文件、共享安装包或仓库。
- 每个凭证默认每分钟 30 次、UTC 每日 500 次请求；创建时硬上限分别为 60、2000。每个用户最多 5 个有效凭证，分配的每日额度总和不超过 2000。已通过认证的尝试（含去重重试、越界或后续校验失败）计入额度；429 返回 Retry-After。非法 JSON/结构校验在框架解析时失败的请求不保证计入凭证额度，由入口 IP 限流补充保护。
- 配额用数据库单条条件 UPDATE 原子扣减，跨 worker 共用，重启不清零；不依赖通用限流开关或 Redis，数据库不可用不会放行。
- nginx 对采集路径（含尾斜杠）限制 64 KiB、每连接来源 IP 10 请求/秒、突发 30、超额 429。反向代理下可能按代理地址聚合，部署时检查真实 IP 配置，不盲信客户端 X-Forwarded-For。这不替代公网入口对大规模流量攻击的防护。
- 后端 ASGI 在 JSON 解析前限制原始请求体 64 KiB，包含无 Content-Length 的分块请求；规范化 JSON 也不能超过 64 KiB。证据最多 20 条、深度最多 8、单对象最多 50 个键、键最长 150、数组最多 100 项、单段证据文本最多 8000 字符。
- 外部内容只作为数据保存展示，不执行命令、不读取或抓取证据 URL、不自动改写或发布 skill。后续接 AI 分析也必须隔离不可信输入与工具执行，并由人工审阅修改和固定复测。

## 数据、核实与收件箱

- credentials 保存归属、版本范围、有效期和配额；身份与 Agent 客户端分开。runs 按凭证和任务关联 ID 唯一，平台/skill 名/版本不可中途改写。轮换凭证后建立新任务关联范围。
- events 保存执行、评测、交付、纠正、问题和复测原始内容。同一凭证、同一 event_id、同一规范化内容去重；内容改变返回 409。
- 非 execution 事件携带 problem_code 时进入 pending 待核实，**不立即创建改进问题，也不重开/修改已解决问题或导航收件箱计数**。正常事件为 not_required，只保存和统计。
- admin/ops 填核实说明才能 accepted 或 rejected；记录核实人、时间、审计。确认后按 skill 名/版本/problem_code 聚合，必要时重开；驳回保留原始证据，不进改进收件箱。已处理事件不能反复核实，409 提醒刷新。
- source 的 human/system/ai_inference 均是客户端声明，不是真实性认证；后台标“声明为人工/系统”。user_correction 只允许 source=human，仍须核实。评分、正常完成也是自报统计，不能当作独立验证结果。
- 问题显示证据次数及已核实独立提交用户数；同一用户多个事件/设备只算一个人，防止刷量成为“多人共识”。旧关联证据保留为 legacy，标为历史、未经核实，不计入已核实用户数。
- 沟通仍是待回复/已回复；改进仍是待分析/待修改/待验证/已解决。核实状态属于事件，不与这两种状态混用。复测通过不自动解决，管理员填复测结果后确认。
- 原人工反馈线程兼容；回复记录不自动发往平台。没有新增自动删除或保留期限任务。

## 自动接收契约

`POST /api/v1/feedback/skills/events`，请求头 `X-QMDH-Feedback-Token: <独立凭证>`。

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
  "evaluation": {"score": 2, "scale": 5, "rubric_version": "r1"},
  "occurred_at": "2026-10-10T10:00:00+08:00"
}
```

- platform: workbuddy/codex/other；event_type: execution/evaluation/delivery/user_correction/problem/retest。problem/user_correction 必须有稳定 problem_code。
- 每任务固定 correlation_id、每事件固定 event_id。返回该提交的 event_id/run_id/duplicate，不返回他人的数据。
- 建议代码 missing_original_citation、images_insufficient。正常完成不要带问题代码。occurred_at 含时区，summary 最多 4000 字符，未知顶层字段拒绝。
- 只提交获得用户授权且与改进有关的最小证据，不发送平台令牌、密钥、整段聊天或任意附件。

## 管理接口

凭证管理仅 admin（兼容 owner），不向 ops 开放：

- GET /feedback/skills/admin/credentials：默认 50/最多 100，before_id 分页，无原密钥及哈希。
- POST /feedback/skills/admin/credentials：owner_id、device_name、allowed_skills（最多 20 个明确名称/版本组合）、expires_in_days、可选 per_minute/per_day。创建返回 token 一次。
- POST /feedback/skills/admin/credentials/{id}/revoke：撤销并审计，不删除历史。

admin/ops 内容运营权限：

- summary/issues/events 查询及 issues/{id} PATCH 保留。
- events 支持 review_status、issue_id、run_id、before_id，默认 50/最多 100。
- PATCH /feedback/skills/admin/events/{id}/review：review_status=accepted/rejected，必填 review_note。
- 原人工改进状态入口 /feedback/admin/{id}/improvement 保留。

后台有待核实问题、改进收件箱、原始事件三个入口；普通工具事件不产生收件箱消息。

## 迁移、验证与发布

新 head `c4d5e6f7g8h9`，父 `b3c4d5e6f7g8`。旧 Agent 历史及问题链接保留，新记录用 credential_id。创建凭证或产生新历史后，降级会拒绝，避免丢失归属；发布优先保留新增表/列，不自动降级。

按 server-operations Daily Update 备份、构建新镜像、迁移，再更新 backend/worker/frontend；生产配置、加密 key、媒体卷不变。旧采集端需改用专用凭证，禁止继续把通用 Agent Token 放到反馈 skill。

本地后端关键集 102 passed、16 subtests、1 skipped；反馈/安全专项 24 passed，覆盖跨会话并发扣减、越权、撤销/过期、拒绝伪造核实、待核实隔离、重试、分块超限及迁移保留历史。前端新增实际组件渲染测试验证恶意 HTML 转义及核实操作条件；统一检查 15 项回归、23 既有/0 新增类型错误和构建通过。GitHub Linux 103 passed + 16 subtests，前端 15 项通过。服务器隔离 PostgreSQL 副本验证迁移/并发配额/核实，nginx -t 与实际 413/429 通过；公网页面/认证/体积限制及生产管理只读查询通过。真实浏览器操作和平台联调仍待做；生产未创建任何测试凭证/反馈。

2.0 兼容：凭证、原始事件、核实、改进历史分层保存，保留来源/证据关联；不引入编排引擎，不把反馈变成可执行指令，不改 CAD/生成/媒体模型。
