# Skill 采集与改进后台

2026-10-10 自助临时会话**已提交、推送、部署**：功能 514de69，生产运行镜像来自合并 7b310f9，迁移 d5e6f7g8h9i0。管理员登记固定 skill_id 后，外部 skill 无需公司账号即可申请单次任务凭证；当前生产登记/凭证均为 0。开发者契约见 skill-feedback-integration.md，发布/备份与实际验证见 archive/handoff-2026-10-10-feedback-public-release.md；下方旧 release 描述仅作历史。

## 外部 skill 自助申请

1. 管理员在反馈页「反馈接入与凭证」填写 skill 名称，点击「登记 Skill 并生成固定 ID」，复制公开 ID 交给开发者。默认没有登记的 skill；同名允许、ID 唯一，改名/升级保持不变，无需按版本开放。开放是采集许可，不代表认可客户端的身份或内容。只有 admin 能设置，ops 保留核实权限。
2. Skill 为一次任务生成固定 correlation_id，在获得用户同意提交最小反馈后申请。无需登录，也不需要安装包中包含共享密钥：

```http
POST https://cityusbdisk.cn/api/v1/feedback/skills/sessions
Content-Type: application/json
```

```json
{
  "skill_id": "qsk_00000000000000000000000000000000",
  "skill_name": "local-project-research",
  "skill_version": "1.2.0",
  "correlation_id": "task-uuid-1",
  "platform": "codex",
  "device_name": "Codex feedback session"
}
```

201 返回 token、expires_at、skill_id、correlation_id、platform、skill_name、skill_version、max_events=10、per_minute=5、identity=anonymous_session，并设置 no-store。服务端决定额度与有效期，不接受 owner_id、权限或额度等额外字段。未知/停用 ID 403；超限 429 + Retry-After；结构错误 422；原始申请体超过 4 KiB 为 413。

3. 用响应 token 作为下文 events 的 X-QMDH-Feedback-Token，所有事件沿用同一 skill_id、关联 ID、平台、名称和版本。凭证有效一小时，最多十次通过认证的提交尝试（包括重试/后续校验失败），每分钟最多五次。即使跨 UTC 日期也不能超过十次。token 仅暂存本次任务的私有上下文，不写 skill/仓库/日志；到期或网络来源变化需重新申请，并仍受共享限额约束。
4. 正常事件只统计；问题和纠正仍先 pending，人工核实后才影响改进问题。匿名会话不计入独立公司账号数量；后台分别显示公司账号数和匿名会话数，后者不等于人数。来源声明仍不是真实性认证。

管理员停用 ID 会同时撤销该 ID 已有临时凭证，重新开放只允许新申请；也可单独撤销某个临时凭证。公司用户长期凭证仍按原机制发放，表单可直接展开，用户通过下拉选择。

### 自助接口的配额与网络边界

- 数据库全局 + 来源的原子持久配额，跨进程共享。申请：全局每 UTC 小时 50/每日 200，单来源每小时 5/每日 20；提交：全局每小时 500/每日 2000，单来源每小时 50/每日 100。各名称/版本/凭证/任务 ID 共用，不通过轮换凭证重置。额度同事务扣减，任一层超限不产生会话/事件，也不消耗另一层额度。
- 配额桶仅保留最近三个 UTC 日期的限流元数据；不删除凭证、任务或原始证据。已接受来源数量受全局配额约束，数据库不支持或不可用时不放行。
- 来源默认使用后端实际连接 peer；IPv6 按 /64 聚合。**生产经过 frontend 与宝塔反向代理，默认会把代理后的用户合并为一组额度**，并不是每人五次。为了安全，不自动信任客户端的 X-Forwarded-For。
- 可配置 QMDH_FEEDBACK_TRUSTED_PROXY_CIDRS 为明确的可信 frontend 代理 IP/CIDR；仅该 peer 提供的单个合法 X-Real-IP 生效，其他来源/非法头忽略。必须先确认代理链、Uvicorn 没有用全网信任的代理头重写 peer，并确保可信代理覆盖而非透传 X-Real-IP，再启用；禁止配置 0.0.0.0/0 或 ::/0。当前 nginx 已覆盖 X-Real-IP 为它的 remote_addr，宝塔后真实来源仍需按实际拓扑验证。未配置时安全共享额度，不能声称已经按终端用户限流。
- nginx 对 /sessions（含尾斜杠）增加 4 KiB、每连接 IP 1 请求/秒 + 突发 5、超额 429；应用解析前再检查体积。events 仍为 64 KiB。匿名接口可以被恶意使用者耗尽有限公共额度；这不是身份认证或抗大规模攻击系统，严重滥用时停用对应 ID。

生产已由 c4 升级到 d5e6f7g8h9i0，保留所有旧归属和证据。新增 run/issue 的 skill_id，历史 aggregation_key 以 legacy:名称保留，新问题按 skill_id/版本/问题代码聚合。登记 ID 或产生匿名会话后禁止 downgrade；应用回退保留新增结构。服务器隔离 PostgreSQL 恢复/迁移/身份/并发限额、nginx 实测、公网与管理只读检查已通过；GitHub Linux 123 passed + 16 subtests，前端 16 项。真实浏览器登录后的操作和平台联调仍未进行。发布采用 Daily Update 备份、新镜像迁移与重建三个服务，未改 .env/key/卷。

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

新匿名临时会话必须带返回的 skill_id；下例的零值仅示意，须替换成正式登记 ID。旧公司名称/版本凭证兼容原契约，提交时不带 skill_id，归属标为历史名称，不自动映射到某个同名 ID。

```json
{
  "event_id": "event-uuid-2",
  "correlation_id": "task-uuid-1",
  "platform": "codex",
  "skill_id": "qsk_00000000000000000000000000000000",
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

- GET /feedback/skills/admin/public-grants：登记表，默认 50/最多 100，before_id 分页，返回公开 skill_id 与显示名/启用状态。
- POST /feedback/skills/admin/public-grants：仅 skill_name、is_active（默认 true）；服务端生成固定公开 ID，不允许客户端指定 ID，允许同名登记。
- PATCH /feedback/skills/admin/public-grants/{skill_id}：skill_name、is_active；改名保留 ID，停用撤销该 ID 临时凭证，重新启用不恢复旧 token。

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
