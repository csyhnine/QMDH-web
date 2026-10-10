# 外部 Skill 自助临时凭证交接

本文件保留发布前开发过程；当前已随 514de69 部署，生产镜像来自 7b310f9、迁移 d5e6f7g8h9i0。下方未提交/未部署/未验收描述是当时快照，最新验证与备份以 handoff-2026-10-10-feedback-public-release.md 为准。

2026-10-10，**DONE（本地，未提交/未推送/未部署）**。

- 用户指出旧凭证创建表单隐藏在「加载或刷新」之后，要求非公司用户的 skill 自行申请临时凭证。本轮分支 feature/skill-feedback-003-public-sessions，基线 7dd45d3。
- 新增 POST /api/v1/feedback/skills/sessions，无需登录；仅允许 admin 登记开放的固定 skill_id；名称可重复、升级不重新放行。token 随机，仅返回一次，存哈希，一小时/十次/每分钟五次，绑定关联任务、平台、来源和版本。不能读取后台或调用业务；不创建 User/AgentClient。
- 新增 admin GET/POST public-grants 与 PATCH public-grants/{skill_id}，默认没有登记 skill；停用立即阻止申请并撤销该 ID 旧临时凭证，重新开放不恢复它们。原公司凭证继续可用。
- DB 原子全局/来源配额，申请和提交分别计量，跨 worker/新 token/任务 ID/skill 版本共享；来源 IPv6 /64 聚合，不等于人。quota 元数据只留最近三个 UTC 日期，业务凭证/任务/证据不删。
- 默认连接 peer，代理后共享额度；新增 QMDH_FEEDBACK_TRUSTED_PROXY_CIDRS，只有明确可信代理提供的单合法 X-Real-IP 可生效，X-Forwarded-For 不采信。生产真实代理链和 Uvicorn peer 设置仍须确认，不能盲开全网 CIDR。异常配置/头回退 peer。
- 请求体解析前 /sessions 4 KiB、events 64 KiB；nginx 增加 /sessions 1 r/s、burst 5、429。ID 登记、申请、提交和核实入口权限隔离，匿名问题仍 pending。
- UI 将自助接入和固定 ID 登记/复制/改名/停用表单直接显示；公司凭证表单直接展开可见，使用账号下拉。只有 admin 看凭证/版本管理，ops 保留改进核实。分页维持 50 条。事件标匿名，聚合问题分别显示公司账号数/匿名会话数，匿名不计作人数。
- 新迁移 head d5e6f7g8h9i0，父 c4d5e6f7g8h9；保留旧凭证/证据和归属，登记 ID 或出现匿名会话则拒绝降级。runs/issues 新增 skill_id，新问题按 ID/版本/问题代码聚合，旧问题迁移到 legacy:名称的聚合范围，同名不同 ID 不混合，同 ID 改名不拆分。优先回退镜像而保留结构。此未提交迁移在本轮修订为固定 ID，旧名称/版本版本只运行过一次性测试数据库，生产从 c4 升级。
- 验证：backend/scripts/check.py **122 passed + 16 subtests、1 skipped**（原 Windows 链接权限限制）；新增专项覆盖开放权限、绑定/到期/撤销/重新开放、十次跨窗口上限、申请与提交共享配额、伪造头、可信代理、IPv6 /64、20 并发争抢 5 次、匿名不算人、正常事件只统计、解析前体积与迁移保留/降级拒绝。frontend npm run check **16 项、23 既有/0 新增类型错误、Vite 构建通过**；包含实际组件渲染确认未加载时入口可见。git diff --check 通过。
- 待发布验证：新 PostgreSQL 分支/迁移与运行 nginx 尚未测试；浏览器实际操作及 WorkBuddy/Codex 平台联调尚未测试。本轮未创建真实凭证、开放真实版本或提交真实反馈，未做 SSH/部署。
- 生产仍 55216ab / 镜像 30dfe26，生产 git 最后文档合并 2176b95，生产迁移 c4d5e6f7g8h9；GitHub main/本地基线 7dd45d3。原备份 E:/backups/QMDH-web/release-20261010-151347 与 /www/backup/qmdh-release-20261010-151347 保留，恢复媒体需整包+增量。
- 下次发布先 Daily Update 备份、保留生产 Nano Banana 四文件，再构建 backend/worker/frontend、新镜像迁移、启动与验证。不要自动登记或开放未知 skill；代理设置未验明前保留共享限额。
- 保护：原 styles.css 13 行、比较文档和 scripts/_tmp_* 保持原状；.env/app.db/storage/key/媒体卷/18010/CAD/ODA 未动。Linux ODA 继续等待用户官方包。
- 2.0：公开授权为配置，quota 为可重建运行态；证据与核实/改进为业务历史，沿用任务关联，不引入编排或执行不可信反馈。

Safe to hand off: **Yes**。已完成功能与本地检查，发布与外部联调是后续独立操作。契约见 ../skill-feedback.md 与 ../skill-feedback-integration.md。
