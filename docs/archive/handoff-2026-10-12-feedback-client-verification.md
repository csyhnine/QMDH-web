# 2026-10-12 反馈客户端冷启动核验与生产提交

本档覆盖旧 client-next 交接中“尚无客户端/正式 ID 未提供”的当前判断，旧档保留为历史。

## 代码与外部实现

- QMDH sessions/events/admin public-grants 已存在于 backend/app/routers/skill_feedback.py；没有重复实现。
- git fetch origin 后 HEAD 与 origin/main 均 d8e0368，差异 0/0，当前分支 feature/skill-feedback-003-public-sessions。
- 只读核对外部仓库 E:/projects/test/agent-skills 和其现有 chat；该 agent 负责修改，未向其发消息、未改其文件。
- skills/skill-feedback-loop/scripts/qmdh_client.py 已实现 HTTPS、用户同意门控、内存凭证、禁重定向、有限重试、固定事件内容、配置核对与安全回执。当前本轮运行 12 项离线测试通过；不等于 WorkBuddy 实测。
- 已有 validation/qmdh-integration-2026-10-12.md：0.1.0 单 evaluation 实际送达，server_event_id=1/run_id=1；该外部记录不证明后台核实和自动采集。

配置 ID（公开标识，不含凭证）：

| skill | ID | 本轮核验 |
|---|---|---|
| local-project-research | qsk_674b09e1134440d385163a81d7053ef9 | 配置版本 0.1.4；未独立查当前服务端登记 |
| skill-feedback-loop | qsk_be064a8f1a53428c9d2b664dc86291a3 | 配置版本 0.1.4；生产申请/提交成功，证明测试时登记有效 |
| townscape-analysis-ppt | qsk_51b872fea30f45d4ac475bdcf05d9f66 | 配置版本 0.1.0；未独立查当前服务端登记 |

## 本轮生产测试（用户明确授权）

用户确认“授权测试，我会打开已登录后台”，范围为明确标注 integration_test 的交付、问题/人工纠正事件及后台核实/聚合。合成证据不含客户数据，不代表真实业务投诉；人工纠正是经授权的测试 fixture。

- 使用外部 0.1.4 Client/transport，platform=codex，申请一次会话，凭证仅在进程内，未保存或打印。
- correlation_id=integration-test-46201193-08e9-4a02-93c7-05ae6ca66322。
- delivery/system、problem/system、user_correction/human 三事件均 sent，服务端 ID=2/3/4，均 run_id=2。
- 两条问题事件 problem_code=integration_test_client_acceptance_20261012。
- delivery 的同 token/原 ID/完整内容重试返回 HTTP 200，duplicate=true、event_id=2/run_id=2，未新增记录。
- 安全回执见 feedback-client-acceptance-2026-10-12.json；不包含 token。

## 尚未完成

浏览器 inventory 只有无标签的 in-app browser/MCP Apps，没有可操作的已登录后台。尝试创建 https://cityusbdisk.cn/admin/feedback 可见标签首次超时，kernel reset；重新 inventory 确认标签已创建并跳转至 https://cityusbdisk.cn/login，等待用户登录。未完成浏览器核实/聚合，不拿代码预期冒充真实后台状态。

下一位先取得已登录且浏览器工具可访问的后台：检查事件 2 not_required、3/4 pending；确认 3/4 后应聚合到同 skill_id/版本/problem_code 的一个问题，保留两个证据。只操作本轮测试 ID，沿用已授权范围。不重复提交或登记 ID。

WorkBuddy 新版加载与真实任务提交、401/403/409/413/422/429 真实平台处理、停用/撤销、版本隔离、跨进程后续纠正尚未验收。当前客户端为任务内批量提交，无常驻监听，退出后凭证不恢复。代理信任与真实 IP 链仍待专项只读核验，未改配置。

## 保护与交接

只追加本档/安全回执并局部更新原已修改的 tasks/handoff；未提交/push/部署，生产镜像/迁移没有重新核验。保留 styles.css、compare 文档、所有 _tmp_*、原归档与未提交文档内容。未改 CAD、环境密钥、数据库结构、媒体卷或 18010。

Safe to hand off: Yes。任务 IN_PROGRESS，生产提交/去重子步骤完成，后台与真实平台验收待续。
