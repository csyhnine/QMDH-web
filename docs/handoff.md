# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-10] 外部 Skill 自助临时凭证 — **DONE（本地未提交/未部署）**

- **范围：** admin 登记固定 skill_id 后，外部 skill 无需公司账号即可申请一小时/十次的单任务凭证；绑定平台、任务、来源和版本，申请/提交各有原子全局+来源配额。停用 ID 撤销旧匿名凭证，重新开放不恢复。问题仍先核实，匿名会话不计作人。
- **入口：** 后台直接显示登记/复制固定 ID、改名/停用与自助接口说明；公司用户表单直接展开，以用户下拉替代数字 ID，admin 专属，ops 继续核实。
- **版本：** 分支 feature/skill-feedback-003-public-sessions，基线 7dd45d3；本地 head 迁移 d5e6f7g8h9i0，生产仍是下条 release 的 c4d5e6f7g8h9。
- **验证：** 后端 122 passed + 16 subtests/1 skipped，前端 16 项/23 既有、0 新增 TS 错误与构建通过；含并发争抢、轮换不绕过、代理头信任/伪造、匿名统计、新迁移保留/拒绝降级，入口未加载即渲染可见。
- **后续：** 未发布、未做新 PostgreSQL/nginx/浏览器/平台联调、未登记真实 skill。默认按实际连接 peer 聚合，生产代理后共享限额；配置可信代理前先核实真实 IP 链路。公开接口可能被耗尽额度，停用 ID 可止损。
- **保护/详档：** 原无关 styles.css 13 行、比较文档/_tmp_* 不动；CAD/ODA/key/18010/数据库/媒体不动。archive/handoff-2026-10-10-feedback-public-sessions.md 与 skill-feedback.md。
- Safe to hand off: **Yes**

### [2026-10-10] 反馈防滥用 — **已提交、推送、部署**

- **版本：** GitHub 功能 55216ab；生产发布合并 30dfe26，backend/worker/frontend 镜像由其构建；迁移 c4d5e6f7g8h9。后续文档合并不重建镜像。
- **范围：** 独立可撤销/过期、限定用户/设备/skill 版本的采集凭证；数据库原子额度、解析前体积和 nginx IP 限制；外部问题先核实，再聚合/重开。人工线程与双状态保留。
- **验证：** GitHub Linux 103 passed + 16 subtests，前端 15 项/0 新增 TS 错误；隔离 PostgreSQL 副本迁移、权限、核实与 20 并发争抢 5 次额度通过。nginx -t 和实际 413/429 通过；公网健康/CAD/反馈页面 200，未认证接口 401，生产管理只读查询通过，近期日志无异常签名。
- **备份：** /www/backup/qmdh-release-20261010-151347，配对本机 E:/backups/QMDH-web/release-20261010-151347；媒体整包 14.6GB + 15.8MB 增量，CRC/逐项读检与当前 5740 文件元数据核对。恢复先整包再覆盖增量。备份期间有 3 个新上传，非零归档退出经完整读检和补增量解决，未删除文件。
- **保护：** .env 校验一致，key/卷/18010/CAD 未改；保留生产 Nano Banana 4 文件。原 styles.css 13 行、比较文档及 _tmp_* 未提交。旧镜像标签 :20261010-security 保留。
- **后续：** 生产专用凭证数量 0，没有安装平台 skill/采集真实数据。管理员按用户发凭证后再做平台联调；真实浏览器操作尚未验收。根分区约 64%/17GB 可用。
- **详档：** docs/archive/handoff-2026-10-10-feedback-security-release.md；契约 docs/skill-feedback.md。隔离测试 DB 已移除；应用回退保留新增表/列，不自动降级。
- Safe to hand off: **Yes**

### [2026-10-10] 累计稳定化与 Skill 反馈 — **已提交、推送、部署**

- **版本：** GitHub 功能 08a2884；生产发布合并 861a49a，运行 backend/worker/frontend 镜像由其构建，后续文档合并不重建。生产迁移 b3c4d5e6f7g8。
- **验证：** 本地后端 94 passed + 16 subtests、1 skipped；GitHub Linux 95 passed + 16 subtests/前端通过。公网健康、CAD、反馈页面 200；新管理接口未登录 401；生产 DB 的管理查询只读检查通过。
- **备份：** 配置/数据库 /www/backup/qmdh-release-20261010-140657；配对本机 E:/backups/QMDH-web/release-20261010-140657，媒体 14.6GB 完整读检。老镜像回退标签保留；.env 校验一致，未改变加密 key/数据卷，未清理媒体。
- **生产差异：** 保留原服务器 4 个 Nano Banana 文件，与 fe3adb5 一致，相关 5 项回归通过；不能将服务器强制快进或覆盖为 GitHub 树。
- **后续：** 平台采集 skill、浏览器交互验收仍待做；媒体审计未运行。CAD 先收 DXF，等待用户官方 Linux ODA。
- **详档：** docs/archive/handoff-2026-10-10-production-release.md。原无关样式、比较文档与临时脚本未提交。
- Safe to hand off: **Yes**
