# 给 Skill 开发者的反馈接入契约

2026-10-10：**已部署**（功能 514de69，生产镜像来自合并 7b310f9，迁移 d5e6f7g8h9i0）。下述接口已上线；管理员尚未登记真实 skill_id，正式联调先从反馈后台取得 ID。服务器隔离副本和公网/只读查询已验证，真实平台/浏览器操作仍需联调。

## 一次登记，持续使用

管理员在 QMDH 反馈后台填写名称，点击「登记 Skill 并生成固定 ID」，复制形如 `qsk_` + 32 位十六进制的唯一 ID 交给开发者。服务端生成 ID，客户端不能选择。名称可以重复，ID 不重复；改名、更新版本都保持原 ID，只有独立的新 skill 才登记新 ID。

将公开 skill_id 写入 skill 元数据或配置，允许随安装包分发；它不是密钥，不能证明提交者是真实用户。无需公司账号即可申请匿名临时会话。名称、版本、来源、评分都是客户端声明，问题由平台核实，不自动执行反馈中的命令。

## 每次任务申请一次临时会话

用户同意提交最小必要反馈后，为任务生成固定 correlation_id。申请无需认证：

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

这里的零值 ID 只是格式示例，必须替换为管理员提供的正式 ID。所有字段必填；platform 为 workbuddy/codex/other；不允许额外指定权限、账号或额度。新版本自动使用同一 ID 申请，管理员不需要逐版本放行。

201 返回 token、expires_at、skill_id、skill_name、skill_version、correlation_id、platform、max_events=10、per_minute=5、identity=anonymous_session。响应 no-store；token 仅在创建时返回，平台仅存哈希。

凭证有效一小时，仅用于这次任务和提交网络来源，最多十次通过认证的提交尝试、每分钟五次。名字/版本在一次会话内固定；升级后为新任务申请新会话即可。不要为每条事件重新申请，也不要把凭证写进 skill、文件、仓库或日志。

## 提交事件

```http
POST https://cityusbdisk.cn/api/v1/feedback/skills/events
Content-Type: application/json
X-QMDH-Feedback-Token: <本次会话返回的 token>
```

```json
{
  "skill_id": "qsk_00000000000000000000000000000000",
  "skill_name": "local-project-research",
  "skill_version": "1.2.0",
  "correlation_id": "task-uuid-1",
  "event_id": "event-uuid-1",
  "platform": "codex",
  "source": "human",
  "event_type": "user_correction",
  "problem_code": "images_insufficient",
  "summary": "用户要求补充现场图片",
  "evidence": [{"quote": "图片不足，请补充现场图片", "stage": "after_delivery"}],
  "evaluation": {"score": 2, "scale": 5, "rubric_version": "r1"},
  "occurred_at": "2026-10-10T10:00:00+08:00"
}
```

- 会话内 skill_id、名称、版本、关联 ID 和平台必须一致。每条事件有独立 event_id；重试沿用相同 ID **和完整内容（包括原时间）**，不能每次重试更新 occurred_at。完全相同的重试返回 duplicate=true，内容变更返回 409。
- source 为 human/system/ai_inference，不把 AI 推断标为人的纠正。event_type 为 execution/evaluation/delivery/user_correction/problem/retest；问题与用户纠正必须提供稳定 problem_code，纠正必须 source=human。
- 正常完成建议只提交一个 delivery，problem_code 留空，evaluation.outcome=completed；只作自报统计。问题、明确纠正和必要的评测证据进入待核实，确认后才聚合到改进问题。不要把每个工具事件做成收件箱消息。
- 一次任务关联执行、评测、交付和纠正；同 ID 的不同版本分别分析，不同 ID 的同名 skill 不合并。同 ID 同版本的改名不拆开同类问题。
- 凭证只能提交反馈，不能读取后台、取得其他任务信息、调用图片/项目业务或发布 skill。
- 最多 64 KiB/事件，summary 4000 字符，evidence 最多 20 项；不要上传聊天全文、密钥、平台令牌、账号资料或任意附件。只提交用户授权的必要摘录；证据 URL 只当文本保存，平台不自动抓取或执行。

## 失败不能影响 Skill 的主要任务

| 响应 | 客户端处理 |
|---|---|
| 401 | token 到期、已撤销或来源改变。停止使用旧凭证；如用户仍同意，最多尝试一次申请，失败则将反馈留待以后。换凭证会建立新的凭证任务范围，平台不把匿名会话认作同一人 |
| 403 | ID 未登记/停用，或会话范围不符。检查 ID、版本和任务字段；不循环申请 |
| 409 | 同 event_id 内容冲突，或并发冲突。若 ID 冲突则修正事件设计；明确并发冲突时可用原内容有限重试 |
| 413/422 | 体积或结构错误。减少必要证据/修正结构，不换 token 规避 |
| 429 | 按 Retry-After 等待；无该头时退避。不通过更换 ID、任务或凭证绕过 |
| 网络错误/5xx | 有限次数退避重试；提交事件保持原 ID 和完整内容。申请响应丢失可能已创建会话并消耗申请额度，不无限重试 |

申请/提交还受来源和全局共享硬限额，跨 skill、版本和凭证共享；代理后的用户默认共用预算。限额、管理员接口与代理配置见 skill-feedback.md。客户端可以取消反馈或稍后手工反馈，不能因回传失败中断主要交付。
