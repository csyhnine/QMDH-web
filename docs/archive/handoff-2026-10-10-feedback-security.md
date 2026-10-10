# Handoff — 反馈防滥用（2026-10-10）

发布覆盖：55216ab 已推送并部署；迁移 c4d5e6f7g8h9，运行镜像来自生产合并 30dfe26。下文为发布前开发记录，最新状态见 handoff-2026-10-10-feedback-security-release.md。

状态：本地完成，未 commit/push/部署。分支 feature/skill-feedback-002-security，基线 4bae2f2。GitHub main 未改，生产仍上一轮镜像/迁移，详见 production-release 归档。

## 用户范围

用户担心恶意利用反馈；核对后同意实施专用凭证、限流与每日配额、待核实机制。本轮只实现和测试；不改 CAD、生产配置、业务数据、访客样式，不占用 18010。未创建真实凭证，未安装采集 skill、未收真实数据或发消息。

## 实现

- 独立 credentials 表存哈希、用户/设备、精确 skill 名/版本、过期与撤销、计数。admin 创建/列表/撤销；仅创建响应返回随机 qfb_ 密钥且 no-store。X-QMDH-Feedback-Token 提交，通用 Agent Token 不再接受；新 token 无 Agent 业务权限。
- 单条条件数据库 UPDATE 原子扣额度（默认 30/固定 UTC 分钟、500/UTC 日）；429 + Retry-After。五个有效凭证/用户且额度总额 2000/日；PostgreSQL 创建使用用户行锁。撤销/停用/过期拒绝新认证；认证通过的失败和重试也消耗额度，框架解析失败由入口限流保护。
- ASGI 请求体解析前 64 KiB（含 chunked），nginx 对采集路径 IP 限额和同样体积限制；JSON 深度/键/数组/文本额外限定。已有通用限流无须改环境变量。
- 外部带问题代码的非 execution 事件为 pending，不建 issue、不重开状态、不增加导航收件箱。admin/ops 必填说明核实/驳回，写核实人/时间/审计；确认才聚合和必要时重开。已处理不能重核。正常事件 not_required 仅统计。
- 后台三个视图，凭证发放/撤销，来源显示客户端声明、统计为自报。已核实独立用户数按 credential.owner_id 去重，旧证据 legacy 未核实。沟通/改进状态分开；回复不外发。
- 外部文本及 JSON 被 React 转义，没有文件上传/URL 抓取/命令执行/自动 skill 修改或发布入口。

## 迁移与回退

新增 c4d5e6f7g8h9，父 b3c4d5e6f7g8；历史 client_id/问题关联保留，客户端标识列允许空，新行使用 credential_id 并有独立唯一约束。旧事件 review_status=legacy，不伪造核实事实。创建新凭证或新数据后 downgrade 主动拒绝，避免丢归属/历史；不要自动执行降级。

部署仍按 server-operations Daily Update：备份配置/DB/媒体、admin 非快进 merge、构建新镜像、迁移、更新 backend/worker/frontend、验证。当前服务器历史 Nano Banana 四文件仍须保留，不能覆盖为 GitHub 树；不得换 key/down -v。无需改 .env；旧采集端须切专用凭证。

## 验证与未验证

- backend/.venv/Scripts/python.exe backend/scripts/check.py：102 passed、16 subtests、1 skipped（原 Windows 链接权限限制）。
- 安全/反馈专项 24 passed，含 SQLite 升降级保留历史及有新数据时拒绝降级、真实鉴权、越权/停用/撤销/过期、名称版本、分块超限、刷量、pending 隔离、驳回/核实权限。并发独立数据库会话 20 请求争抢 5 次额度：5 成功、15 个 429。
- frontend npm run check：15 回归、23 既有/0 新增 TS 错误、Vite 构建通过。新增 2 项实际组件渲染测试检查 HTML 转义/不生成远程图片链接、核实操作仅 pending 且须说明。
- 未做 PostgreSQL 真运行/跨进程压力、nginx -t、浏览器真实交互、平台联调；Docker CLI 存在但引擎未运行，未启动或安装。
- Git diff --check 和当前文档引用收尾核对。原 styles.css 13 行与 compare 文档/_tmp_* 未混入。

## 下一步

审阅本地变更；收到提交部署指令后先做发布准备和真实 PostgreSQL/nginx 验证。安全版本上线后由管理员按用户/设备发独立凭证，再制作并联调 WorkBuddy/Codex 采集 skill。当前生产仍旧版，不能依据本地实现宣称已经防住刷量或权限复用。

2.0：原始历史、凭证归属、核实、改进和审计独立且可关联；不新增编排引擎或自动执行权限。
