# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-10] 反馈防滥用 — **DONE（本地，未提交/部署）**

- **范围：** 独立采集凭证（admin 创建/撤销、用户/设备、skill 版本范围、过期/停用）、持久原子配额、解析前 64 KiB 限制、nginx IP 限制；外部问题待核实，admin/ops 确认后才聚合/重开。双状态与人工线程保留，已核实独立用户数展示。
- **分支/基线：** feature/skill-feedback-002-security / 4bae2f2；开始时 fetch 后与 origin/main 一致。新迁移 c4d5e6f7g8h9，生产仍 b3c4d5e6f7g8，没有生产操作。
- **验证：** 后端关键集 102 passed、16 subtests、1 skipped；安全/反馈专项 24 passed。20 并发争抢 5 次配额，5 成功/15 个 429。前端 15 项回归、0 新增类型错误、构建通过；原 TypeScript 23 项基线保留。
- **待验收：** PostgreSQL 并发、nginx 实际运行、浏览器、平台联调；本机 Docker 引擎未运行。没有创建真实凭证或采集 skill。上线前不要发放外部采集凭证，当前生产仍是原版 Agent 认证。
- **保护：** 原 styles.css 13 行、比较文档、_tmp_* 原状；不动 CAD/18010/业务库/生产 key/数据卷，不发外部消息。用户随后授权提交、推送、部署；正在备份和发布验收，部署完成后追加实际记录。
- **详档：** docs/archive/handoff-2026-10-10-feedback-security.md；契约 docs/skill-feedback.md。创建新凭证后降级会拒绝，避免丢历史，应用回退应保留新增结构。
- Safe to hand off: **Yes**


### [2026-10-10] 累计稳定化与 Skill 反馈 — **已提交、推送、部署**

- **版本：** GitHub 功能 08a2884；生产发布合并 861a49a，运行 backend/worker/frontend 镜像由其构建，后续文档合并不重建。生产迁移 b3c4d5e6f7g8。
- **验证：** 本地后端 94 passed + 16 subtests、1 skipped；GitHub Linux 95 passed + 16 subtests/前端通过。公网健康、CAD、反馈页面 200；新管理接口未登录 401；生产 DB 的管理查询只读检查通过。
- **备份：** 配置/数据库 /www/backup/qmdh-release-20261010-140657；配对本机 E:/backups/QMDH-web/release-20261010-140657，媒体 14.6GB 完整读检。老镜像回退标签保留；.env 校验一致，未改变加密 key/数据卷，未清理媒体。
- **生产差异：** 保留原服务器 4 个 Nano Banana 文件，与 fe3adb5 一致，相关 5 项回归通过；不能将服务器强制快进或覆盖为 GitHub 树。
- **后续：** 平台采集 skill、浏览器交互验收仍待做；媒体审计未运行。CAD 先收 DXF，等待用户官方 Linux ODA。
- **详档：** docs/archive/handoff-2026-10-10-production-release.md。原无关样式、比较文档与临时脚本未提交。
- Safe to hand off: **Yes**

以下两条保留发布前开发过程；当前状态以上述生产记录为准。

### [2026-10-10] Skill 自动采集与改进后台 — **DONE（本地，发布暂停）**

- **范围：** 自动接收接口、任务关联 ID、来源、skill 名/版本、同类问题聚合、评测与改进详情、沟通/改进双状态；保留人工线程。普通事件只存后台和统计，不逐条进入收件箱。
- **迁移：** 新 head b3c4d5e6f7g8，父 z1a2b3c4d5e6，生产未应用。前序累计改动仍未提交，分支/基线不变。
- **验证：** 后端完整 93 passed、16 subtests、1 skipped；最后反馈专项 23 passed；前端统一检查通过，0 新增类型错误。SQLite 迁移保留原反馈。
- **待验收：** 平台/浏览器/真实 PostgreSQL 与并发压力；没有创建/安装反馈 skill 或采集真实数据。后台回复仅保存记录，不发送外部消息。
- **发布：** 用户原要求提交推送部署，但随后要求先调整反馈；当前明确暂停，没有提交/push/SSH/部署。恢复发布前审阅新增迁移与契约。
- **文档：** docs/skill-feedback.md；详档 docs/archive/handoff-2026-10-10-skill-feedback.md。
- Safe to hand off: **Yes**


2026-10-10 收尾审阅：`docs/release-review-2026-10-10.md` 记录累计范围与未完成验收。前端统一检查通过；后端 71 passed、16 subtests passed、1 skipped。补 `backend/tests/__init__.py` 避免同名包覆盖测试导入。仍未提交/push/部署；浏览器、Linux/PostgreSQL 与 GitHub CI 未验收。
