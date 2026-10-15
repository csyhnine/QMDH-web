# 2026-10-13 反馈客户端复核与授权测试核实

## 后续更新：run_id=2 核实与聚合已完成

以下结果覆盖本文稍早的 pending/等待登录状态，其余只读发现保持有效。

- 用户确认已登录，并要求直接访问服务器后台。沿用已授权 integration_test 范围，于北京时间 2026-10-13 14:17:33 经 SSH 管理通道完成核实。
- 调用生产现有 `review_event` 应用逻辑，在一个外层数据库事务内用 savepoint 容纳两次应用 commit；不改接口、不部署、不创建管理 token 或登录会话。
- 管理操作身份明确为 `codex-ssh-authorized-integration-test`，role=ops 的内存维护上下文，actor_id/reviewed_by=null；并非网页用户登录，不冒用任何真实用户 ID。审计表留两条 `skill_feedback.evidence_reviewed`，备注明确用户授权的合成测试及 SSH 操作方式。
- 写前锁定 run_id=2 三事件，并断言 correlation_id、skill_id、版本、事件类型、来源、pending 状态及 integration_test 内容完全符合归档。写后断言所有原始字段及其他既有事件未改变；任何断言失败则回滚外层事务。
- 事件 3/4 已 accepted，均 issue_id=1；事件 2 仍 not_required、issue_id=null。
- issue_id=1：证据数 2、实名提交者 0、匿名会话 1，来源 human/system。问题名称及代码均带 integration_test，不视为真实投诉；沟通 pending_reply、改进 pending_analysis，未扩大为回复或解决操作。
- 独立新建只读连接复查持久数据和两条审计成功；当前 events=15、pending_review=0。
- 浏览器先返回空标签，后恢复两个已登录 `/admin/feedback` 标签；`getTab` 读取超时。因此服务端核实/聚合通过，网页操作链路、时间视觉仍未通过。本次不再要求重复登录。
- 再查 run_id=6 完整 evidence/evaluation：仅有摘录、评分、指纹及文件名，没有原文件或下载地址。服务器反馈后台不能据此恢复 text.json/images.json 或证明实际查看图片；保留真实平台产物核验缺口，不把登录缺口与产物缺口混为一谈。
- 本轮仅更改已授权的测试核实状态、新建对应测试聚合问题及审计；原未提交文件仍保留，无代码改动、commit、push、部署。任务 skill-feedback-004 继续 IN_PROGRESS。

## 冷启动与边界

- 已读 protocol、tasks、handoff、next-conversation 交接、roadmap 及相关 architecture/decisions，并核对当前代码。
- 分支 feature/skill-feedback-003-public-sessions；HEAD f1e2122，fetch 后与 origin/main 差异 0/0。
- sessions/events/admin review/issues 已存在；本轮没有改接口、部署、迁移或生产业务数据。
- 原 frontend/src/styles.css、比较文档及所有 _tmp_* 保留。外部 skill 文件只读，未安装、修改或向其他 agent 发消息。

## 正式 ID 与当前客户端

SSH 查询使用数据库只读事务；不输出凭证、哈希秘密或用户信息。

| 当前配置名称 | 版本 | 正式 ID | 生产启用 |
|---|---|---|---|
| zdzl-js | 0.2.4 | qsk_674b09e1134440d385163a81d7053ef9 | true |
| js-pg-fk | 0.2.5 | qsk_be064a8f1a53428c9d2b664dc86291a3 | true |
| zj-xzfx | 0.1.1 | qsk_51b872fea30f45d4ac475bdcf05d9f66 | true |

- 生产登记名称仍为 local-project-research / skill-feedback-loop / townscape-analysis-ppt；代码按固定 ID 识别，改名无需重新登记。
- 外部来源 E:/projects/test/agent-skills/skills；该目录当前不是 Git 仓库，不虚构提交号。图片执行模块 zd-tpjs 的 SKILL.md 元数据版本为 0.1.3。
- 三个 qmdh.json 和 qmdh_client.py 与 C:/Users/Admin/.codex/skills 对应副本逐字节一致；这不证明 WorkBuddy 安装副本一致。
- 当前客户端 SHA256：44ead118a6ee207806472fd9ecc13f5b15b1c3416854d6bdedca522bbf141b1c。
- 本轮 `python -B -m unittest discover -s E:/projects/test/agent-skills/skills/检索评测与反馈/scripts -p test_qmdh_client.py`：14 tests OK，全部使用 Fake transport，无生产提交。

## 最新真实回传

- 最新事件 13/14/15，run_id=6，platform=workbuddy，zdzl-js 0.2.4，correlation_id=dagang-nansha-20261013-a1。
- 发生北京时间 2026-10-13 12:52:22；接收 12:54:04（秒级展示）。delivery/system、evaluation/ai_inference、evaluation/ai_inference；均 not_required，issue_id=null。
- 客户端自报文字 72 条事实（70 verified、2 pending）、文字评测 100/pass=true；图片 23 张，100/pass=true，声明 visual_review、image_review_complete=true，执行模块 zd-tpjs 0.1.3。
- 这是客户端声明，不是本轮独立核验素材，也不覆盖早前 run_id=5 图片仅元数据核验/pass=false 的历史。
- 文字 research_sha256：72413fbf8688c14ae1587d77863a673087733f570a293d2705df43ba47d96506。
- 图片 research_sha256：34c394938c467b03dfd58f04555846e069488fed4853bd0cdfccd90a30168097。
- 在现有 E:/projects/test 范围未找到这次 text.json/images.json 或安全回执；已询问实际 WorkBuddy 产物路径。没有查看真实调用记录或实际图片，不能宣称平台完整验收通过。

## 已确认的契约偏差

事件 13 的 evaluation 使用 delivery_status=complete，缺少 outcome=completed。生产代码 summary() 仅按 delivery + evaluation.outcome=completed 统计 completed_runs，故 run_id=6 不计完成。当前 completed_runs=3，包含测试/探针 run_id=2/3 和真实 run_id=5，不能解释为三个真实用户完成任务。

外部 qmdh-contract.md 已要求 outcome=completed，当前客户端允许任意 evaluation 对象，未规范化此字段。后续应修正外部 payload 生成并离线回归；不能改已有原始事件内容后当作幂等重试。本轮未改外部独立维护文件或扩大生产写入范围。

## run_id=2 复核与实际阻塞

- 与归档回执的 correlation_id、skill_id、版本及事件 ID 一致；三条均明确 integration_test、无真实客户投诉。
- 事件 2：delivery，not_required，issue_id=null。
- 事件 3/4：problem / user_correction，pending，issue_id=null；两条 problem_code 同为 integration_test_client_acceptance_20261012。合成 human 仅表示授权测试夹具，不代表真人业务纠正。
- 全局 issues 当前为空。尚未执行核实，不能宣称聚合通过。
- 打开 https://cityusbdisk.cn/admin/feedback 后跳转 /login；当前可操作浏览器没有登录态，服务器无旧式配置管理凭证。已请求用户在本聊天右侧浏览器登录，未创建新管理凭证或绕过认证。
- 已有事件 3/4 核实与聚合授权继续有效，不需要重复授权。登录后只操作这两条，填写明确 integration_test 核实备注，再验证同一 issue、两个证据、零实名提交者/一个匿名会话；事件 2 保持不聚合。
- 时间 UI 的已登录视觉验收、真实产物指纹与调用记录核验、跨进程纠正/真实平台错误场景仍未完成。skill-feedback-004 保持 IN_PROGRESS。

Safe to hand off: Yes。本轮只读生产与外部 skill，新增交接并同步文档；未提交、push 或部署。
