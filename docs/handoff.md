# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-13] 反馈时间展示 — 本地完成，未部署

- 聚合问题列表和详情补创建/更新时间；事件补发生/接收时间，复用 datetime 工具转换为北京时间并显示年月日时分秒。缺值显示未记录。
- API 已返回 created_at/updated_at/occurred_at/received_at，本轮仅补前端类型和展示，无后端或迁移。
- 文件：frontend/src/pages/admin/SkillFeedbackPanel.tsx、frontend/src/api.ts、frontend/scripts/test-feedback-security.mjs；测试夹具改为真实 UTC 格式，适配日期工具导入。
- 验证：npm run check，16 项通过，23 项既有类型错误、0 新增，Vite 构建通过。
- 只读生产查询发现最新事件 10/11/12 是大岗镇检索交付/文字评测/图片评测；发生北京时间 10-13 10:54:56，接收约 10:55:10；图片自评 pass=false、仅元数据核验。测试问题 3/4 仍 pending，未进行核实。
- 未提交/push/部署；原未提交文档/访客样式/比较文档/_tmp_* 保留，CAD/key/卷/18010 不动。下一步发布前端后验收页面时间；不重复后端开发。
- Safe to hand off: Yes。

### [2026-10-12] 反馈客户端核验 — 生产提交/去重通过，后台验收待续

- **事实纠正：** 外部 E:/projects/test/agent-skills 已有 qmdh_client.py 与三个 qmdh.json；旧“无 HTTP 客户端/ID 未提供”已过时。外部 agent 的 0.1.4 修改已可读，本轮离线客户端 12 项通过；不改其文件。
- **生产验收：** 用户明确授权 integration_test 三事件及后台核实/聚合。本轮 skill-feedback-loop 0.1.4 申请成功，delivery/problem/user_correction 三事件 ID=2/3/4，run_id=2；delivery 原内容重试 200、duplicate=true、ID=2。
- **剩余：** 后台确认正常交付不需核实、问题/纠正 pending，再确认聚合；WorkBuddy 真任务、后续跨进程纠正、错误场景与停用仍未验收。两个其他 ID 仅核对配置，未独立检查启用状态。后台标签已打开并跳转至登录页，等待用户登录；不宣称后台已通过。
- **版本/保护：** feature/skill-feedback-003-public-sessions，HEAD/origin/main d8e0368，fetch 后差异 0/0。未改接口、部署或代理；原 docs 改动、styles.css、比较文档、_tmp_* 保留，无提交/push。CAD/key/卷/18010 保护继续有效。
- **证据与下一步：** archive/handoff-2026-10-12-feedback-client-verification.md 和 archive/feedback-client-acceptance-2026-10-12.json。先取得可操作的已登录后台，用 run_id=2 核实本轮测试，再做 WorkBuddy 验收；禁止重复登记已有 ID。
- Safe to hand off: **Yes**（部分验收完成）。

### [2026-10-10] 固定 Skill ID 与自助临时凭证 — **已提交、推送、部署**

- **范围：** admin 登记固定 skill_id 后，外部 skill 无需公司账号即可申请一小时/十次的单任务凭证；绑定平台、任务、来源和版本，申请/提交各有原子全局+来源配额。停用 ID 撤销旧匿名凭证，重新开放不恢复。问题仍先核实，匿名会话不计作人。
- **入口：** 后台直接显示登记/复制固定 ID、改名/停用与自助接口说明；公司用户表单直接展开，以用户下拉替代数字 ID，admin 专属，ops 继续核实。
- **版本：** 功能 514de69 已在 GitHub main；运行镜像来自生产合并 7b310f9，生产迁移 d5e6f7g8h9i0。后续部署记录文档合并不重建镜像。
- **验证：** 本地后端 122 passed + 16 subtests/1 skipped，GitHub Linux 123 passed + 16 subtests，前端 16 项/23 既有、0 新增 TS 错误。新 PostgreSQL 隔离恢复/迁移/身份/20 并发争抢 5 次、nginx 实际 413/429、生产管理只读查询与公网检查通过；日志异常签名 0。
- **备份：** /www/backup/qmdh-release-20261010-171226，配对 E:/backups/QMDH-web/release-20261010-171226，配置/DB 哈希一致，5740 媒体文件匹配整包+增量，今日已读检两包 SHA256 未变，在新本机备份硬链接复用。恢复须先整包再增量；旧镜像 :20261010-public 保留。
- **后续：** 生产登记/凭证为 0，先登记实际 ID 再做浏览器/平台联调；不宣称已验收真实点击。代理信任保持空，公开用户共用每小时 5 次申请预算；扩大使用前核验真实 IP 链路。公开预算可被耗尽，停用 ID 可止损。根分区约 64%/17GB。
- **保护/详档：** 原 styles.css 13 行、比较文档/_tmp_* 未提交；.env 校验不变，CAD/ODA/key/18010/卷/媒体不动，Nano Banana 四文件保留。archive/handoff-2026-10-10-feedback-public-release.md 与 skill-feedback-integration.md。
- Safe to hand off: **Yes**
