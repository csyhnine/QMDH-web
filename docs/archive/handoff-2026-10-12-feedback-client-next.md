# 2026-10-12 反馈客户端接入与新对话交接

## 当前状态

- QMDH 后台已上线，不需要重新开发凭证/反馈接口。功能提交 514de69；本地 HEAD 与本地 origin/main 均为 d8e0368，分支 feature/skill-feedback-003-public-sessions。本轮未 fetch，未重新连接生产。
- 最后一次生产核验为 2026-10-10：运行镜像来自 7b310f9，生产 git 后续文档合并为 80f345f，迁移 d5e6f7g8h9i0；验证/备份详见 handoff-2026-10-10-feedback-public-release.md。不要把旧发布的迁移、镜像或测试数量当作最新状态。
- 2026-10-12 用户转述外部 skill 编写 agent：只预留了字段和流程，尚未实现网络客户端，因此不能实际回传。已经给用户正式接口与接入文档，尚未收到客户端实现或真实提交成功的证据。
- 2026-10-10 生产登记 skill 和凭证均为 0；今天未复查，不能断言当前仍为 0。正式 skill_id 尚未在本对话提供，不能编造或使用文档零值占位符。

## 优先待办

1. 确认实际 skill 名称/负责人，管理员在反馈后台「登记 Skill 并生成固定 ID」取得正式 skill_id，交给编写 agent。同名允许，改名/升级沿用 ID；不要让客户端自行生成 ID。
2. 外部 agent 按 ../skill-feedback-integration.md 实现真正 HTTP 客户端：用户同意后，每任务固定 correlation_id，申请匿名会话，再提交事件。QMDH 侧新会话 POST /api/v1/feedback/skills/sessions，事件 POST /api/v1/feedback/skills/events，域名 https://cityusbdisk.cn，事件使用 X-QMDH-Feedback-Token。
3. 客户端完成后联调真实平台及后台浏览器：正常 delivery 只统计，问题/人工纠正进入待核实，确认后聚合；重试去重、错误处理、停用 ID 与凭证保护。向生产写测试数据先明确用户授权范围，不宣称已有真实端到端验收。
4. 扩大公开使用前，核验宝塔 → frontend nginx → backend 的真实 IP 覆盖/信任链；当前 QMDH_FEEDBACK_TRUSTED_PROXY_CIDRS 为空，代理后用户共享来源配额。只在证据充分后考虑最小范围代理信任，禁止信任全网或调用者伪造的 X-Forwarded-For。

凭证一小时、每分钟五次、生命周期十次认证提交尝试，重试计数；申请来源每 UTC 小时五次/每日二十次，另有全局及事件共享额度。429 遵守 Retry-After，不换 ID/任务/token 绕过；反馈失败不影响主任务，敏感信息和 token 不入日志/仓库。公开 ID 不证明真实用户身份，来源/评分仍为客户端声明，不自动执行反馈或修改发布 skill。事件响应 event_id 是服务端整数记录 ID，不是请求的客户端事件 ID。

## 其余待办（不自动开工）

- 媒体：生产只读引用审计尚未执行，清理另行确定范围；最后容量约 64%/17GB 是 10-10 快照，先复测。
- TypeScript：23 项既有基线错误仍在，新增错误检查已启用。
- 容量评估、缩略图/懒加载覆盖、Grok 超时和 Seedance 代理/DNS历史问题：先核验当前症状，不自动重提视频任务。
- CAD：等待用户提供官方 Linux ODA 安装包；此前只收 DXF，不自行下载/安装。本机 Windows ODA 不能搬到生产。

## 工作区、保护与下一位第一步

- 本轮只留档：docs/handoff.md、docs/tasks.md、本档。未提交/推送/部署；没有修改代码或生产。
- 原 frontend/src/styles.css 的访客样式、docs/compare-qmdh-openclaw-codex.md 与 scripts/_tmp_* 均保留，不混入提交。临时脚本可能有秘密，不直接打印或盲目执行。
- 不提交 .env、backend/app.db、backend/storage/**；不更换 QMDH_ENCRYPTION_KEY、不 docker compose down -v、不占用或杀掉别人 18010。
- 生产历史合并不能快进，pull 必须 sudo -u admin；保留服务器四个 Nano Banana 差异文件，按 server-operations.md Daily Update 操作，旧脚本不能盲用。此次没有新的部署请求。
- CAD 禁止重跑 ce_94778ce26c6e、解析 ce_d2955df6f9b9、修改 ce_b121e1b892de；ce_0abae8a9402f 不自动重转。不改布置算法、不拆卫生间、不做线稿或生图。
- 冷启动先检查 Git/未提交改动，再按 protocol.md 阅读 tasks、handoff、roadmap、相关 architecture/decisions；读接入契约及最新生产详档。第一步核验正式 ID 与外部客户端完成情况，别重复实现已经上线的接口。代码与文档冲突以代码为准。

Safe to hand off: Yes。后台部署完成，外部客户端与真实平台验收未完成。
