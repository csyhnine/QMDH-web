# Tasks

Last aligned: `2026-10-15`。旧任务原文与开发顺序完整保存在 `archive/document-baseline-before-2026-10-08-alignment/tasks.md`，不作为当前排期。

## Rules And Current Goal

- 状态使用 TODO / IN_PROGRESS / BLOCKED / DONE；注明本地/已提交/已部署。
- 每项限定为一个可审阅修改单元；同步 handoff，涉及架构再同步 architecture，中大型任务做 2.0 兼容检查。
- 当前是 1.0 生产稳定化：历史可靠性、减少无效刷新、文档、自动检查与媒体治理。6 月 Studio/Video 合并序列已归档。
- 角色、账号归属以代码为准；有效角色 admin/ops/designer，owner 兼容为 admin。
- 原访客样式/比较文档/临时脚本不混入本轮提交。不得按旧 stash 序号 pop。
- 用户已于 2026-10-10 明确授权本轮累计变更提交、push 与部署。CAD 和已明确暂缓事项保持边界。

## Current Queue

| ID | 事项 | 状态 | 下一步或事实 |
|---|---|---|---|
| other-gif-001 | 其他模块与手动 GIF 压缩界面 | IN_PROGRESS（本地） | 侧栏图纸改其他；保留图纸解析/原链接，增加 GIF 上传、参数、预览和下载；待发布 |
| gif-upload-001 | 新上传 GIF 自动压缩 | DONE（已部署） | a655596/55bd284，生产镜像含 FFmpeg；500000 字节目标，运行容器上传验证 1597553→453484 字节 |
| video-template-001 | 视频生成提示词模板库 | DONE（已部署） | a655596，迁移 e6f7g8h9i0j1；前后端已发布，21 个旧公共图片模板保留，视频公共内容待管理员添加 |
| skill-feedback-004 | 外部客户端接入与真实平台验收 | IN_PROGRESS | 已发现三个配置 ID 与真实 HTTP 客户端；0.1.4 生产三事件提交/去重通过。生产最新事件 13/14/15（run_id=6）；三个 ID 启用，当前客户端 14 项离线通过。run_id=2 经 SSH 核实并聚合 issue_id=1（2 证据/1 匿名），真实产物未获取，事件 13 完成统计字段不符；详见 archive/handoff-2026-10-13-feedback-live-verification.md |
| skill-feedback-006 | 反馈时间展示 | DONE（已部署） | b619413 / 生产合并 b04ffb53；聚合问题与原始事件统一北京时间，公网新包与健康检查通过 |
| skill-feedback-005 | 真实 IP 与代理信任核验 | TODO | 当前代理信任为空、公开用户共享来源预算；扩大使用前先核验链路，不直接开放全网信任 |
| skill-feedback-003 | 外部 skill 自助临时凭证与入口修正 | DONE（已部署） | 514de69 / 生产镜像 7b310f9 / 迁移 d5e6f7g8h9i0；Linux 123 后端/16 前端、PG/nginx/公网通过，真实 ID/平台联调待做 |
| skill-feedback-002 | 反馈防滥用 | DONE（已部署） | 55216ab / 生产 30dfe26，迁移 c4d5e6f7g8h9；专用凭证尚未发放，平台联调待做 |
| skill-feedback-001 | Skill 自动采集与改进后台 | DONE（已部署） | 08a2884 已发布，迁移 b3c4d5e6f7g8；平台采集 skill 与浏览器联调待做 |
| studio-perf-003 | 历史分页与运行任务跟踪 | DONE（已部署） | 08a2884 已发布，运行镜像来自生产合并 861a49a |
| studio-perf-005 | 后台暂停与配置刷新 | DONE（已部署） | 随 08a2884 发布，加载器 10 项回归 |
| docs-align-001 | 正式文档对齐 | DONE（已提交） | 已归档并发布，最新部署记录补实际验证 |
| quality-gate-001 | 最小自动检查 | DONE（已提交/CI 通过） | 最新 GitHub Linux 后端 123 passed + 16 subtests，前端 16 项检查通过 |
| ops-storage-001 | 媒体治理 | IN_PROGRESS | 只读工具已发布，生产容量复测 63%/18GB；未执行引用审计或清理 |
| studio-perf-001 | ECS 容量评估 | TODO | 旧 9 月负载记录只作线索，升配/swap 前重新测量 |
| studio-perf-002 | nginx 媒体直出 | DONE（代码已存在） | nginx alias + frontend 只读卷；本轮未复核生产运行配置 |
| studio-perf-004 | 缩略图派生与懒加载覆盖 | TODO | 已有部分 lazy-load，不再描述全部 eager；缩略图仍待规划 |
| cad-extract-001 | CAD 图纸提取 | DONE（已部署） | Linux ODA 尚未提供，生产先收 DXF，详见下方 |
| cad-dwg-002 | Linux ODA 接入 | BLOCKED | 等用户提供官方 Linux 安装包；不自行下载/安装 |
| video-grok-timeout-001 | Grok 轮询超时 | TODO | 9 月上游问题；复核当前失败记录再处理，不自动重提任务 |
| video-seedance-502-001 | Seedance 参考图代理/DNS | TODO | 历史上游问题；先确认当前是否仍发生 |

## Current Task Details

### Task: [other-gif-001] 其他模块与手动 GIF 压缩

- 状态：IN_PROGRESS（本地实现与回归完成后发布），分支 feature/other-gif-001-ui。
- 目标：侧栏“图纸”改“其他”，保留现有图纸解析，提供可见、可操作的 GIF 压缩工具。
- 边界：导航与路由包裹、独立 GIF 页/CSS、鉴权手动压缩接口及请求局部参数；不修改 CAD 算法/组件/数据，不改旧自动上传压缩策略。
- 验收：旧 /studio/cad（含查询参数）继续使用原组件；/studio/gif 显示上传/500KB 默认目标/高级参数/双预览/大小对比/下载；只挂载当前工具；手动请求不修改全局配置；鉴权/输入/服务不可用有明确错误。
- 禁止：覆盖原 styles.css 13 行、比较文档/_tmp_*，修改 CAD/key/卷/18010；不登记新账号或向正式库写验收模板。
- 依赖：已发布 FFmpeg 服务；无新迁移。文档同步：handoff、architecture、archive/handoff-2026-10-15-other-gif-tool.md。
- 2.0 兼容：复用存储和压缩服务，以不可变请求配置隔离参数，无新增任务编排或数据模型。

### Task: [gif-upload-001] 新上传 GIF 自动压缩

- 状态：DONE（2026-10-15 已提交/推送/部署），功能 a655596、构建 55bd284；发布验收见 archive/handoff-2026-10-15-video-gif-release.md。
- 目标：所有新上传 GIF 自动按统一规格压缩；用户已确认全量新上传范围。
- 实现：默认目标 500000 字节；按颜色/帧率/尺寸逐档优化，支持锁定尺寸/帧率和配置质量下限，API 返回实际大小/达标状态；上传原件另存，只有更小且动画/循环/透明与时长验证通过才返回派生 GIF；超时/失败/繁忙回退原件。三个上传入口复用同一 helper；同步处理受 20 秒软预算约束。
- 边界：上传入口、独立压缩服务、镜像 FFmpeg 和离线测试/文档；不重压历史、生成结果/CAD/灵感下载；不改 key、卷、18010 或原样式/临时文件。
- 验收：真实 FFmpeg 的动画/透明/循环/尺寸及体积测试，原件保留与失败回退，多入口一致性；最终专项 16 项通过。后端全量 141 passed/1 skipped/16 subtests，前端 19 项/类型基线/构建通过；额外附件/存储 17 passed/6 subtests。
- 依赖：容器需包含 FFmpeg，Dockerfile/CI 已补；生产已含 FFmpeg 7.1.5，默认压缩已启用。无本功能数据库迁移，视频模板迁移已同步执行。
- 文档：handoff、architecture、archive/handoff-2026-10-15-gif-upload-compression.md；2.0 兼容：原件/派生分离、复用存储、日志可追踪，不改变任务执行模型。

### Task: [video-template-001] 视频生成提示词模板库

- 状态：DONE（2026-10-15 已提交/推送/部署）；a655596，生产迁移 e6f7g8h9i0j1。
- 目标：视频生成可浏览/套用公共模板，保存/编辑/删除个人模板，后台维护视频公共模板。
- 实现：复用现有 CRUD/权限/分类搜索；新增 media_type=image/video，旧模板默认 image；视频套用保留模型、SKU 时长、画幅、分辨率、参考图，仅应用提示词/风格/说明，修改正文解除绑定，跨类型不套用；切类型清理模板编辑状态。
- 边界：提示词模板相关前后端、迁移与测试；不调用收费生成，不改 CAD、反馈接口、密钥、卷或原样式；不创建生产模板内容。
- 验收：类型隔离、视频参数保护、旧模板兼容、个人权限隔离、增改删、迁移保留原数据。测试结果见 archive/handoff-2026-10-14-video-templates.md。
- 依赖：配对备份、隔离 PostgreSQL 迁移及正式迁移、前后端发布均完成；浏览器交互未独立验收。
- 文档：handoff、architecture 与本轮详档；2.0 兼容：类型字段可延续到工作流，模板 ID/归属/统计不变，无新增执行引擎。

### Task: [skill-feedback-004] 外部客户端接入与真实平台验收

- 状态：IN_PROGRESS（2026-10-13 只读生产复核：最新真实 run_id=6 已回传，当前客户端 14 项离线通过；run_id=2 服务端核实/聚合通过，网页视觉与真实产物核验未完成）。
- 目标：正式 skill_id 交付开发者，真实平台完成申请/回传，管理员可核实和聚合。
- 边界：按 skill-feedback-integration.md 配合外部实现并验收；不重复开发已上线接口，不擅自安装外部 skill 或采集用户数据。
- 禁止项：不编造 ID、不用零值示例、不写 token/敏感信息到仓库或日志；不改 CAD、key、卷、18010 或无关文件。
- 验收：正常交付只统计；问题/人工纠正先核实；任务关联与幂等有效；额度/退避/错误不阻断主任务。真实生产测试先明确授权范围。
- 依赖：三个 ID 配置及外部客户端已找到；skill-feedback-loop 正式 ID 已由本轮生产申请/提交成功验证。三个 ID 已于 2026-10-13 只读查询确认均启用。用户已授权明确标注 integration_test 的交付/问题/人工纠正测试及后台核实聚合；用户已确认登录，工具可见后台标签但读取超时；服务器核实已完成。
- 文档：handoff 与 archive/handoff-2026-10-13-feedback-live-verification.md；run_id=2 事件 3/4 已 accepted、同 issue_id=1；网页读取超时，服务器最新真实反馈无原文件地址；事件 13 缺 evaluation.outcome=completed，后续修正外部生成端，不改原事件冒充幂等重试。

### Task: [skill-feedback-005] 真实 IP 与代理信任核验

- 状态：TODO；扩大公开使用前处理。
- 目标：确认宝塔/frontend/backend 的真实来源传递，评估合理的来源限额。
- 边界：先只读核验配置/链路，再决定最小可信代理范围；没有证据不改环境。
- 禁止项：禁止全网可信 CIDR、信任调用者 X-Forwarded-For、换 token 绕过额度；保留 key/卷。
- 验收：可信入口覆盖来源头，伪造头不能绕过配额，合法来源划分有可复核证据。
- 依赖/文档：server-operations Daily Update、skill-feedback.md、最新发布交接；配置变更另记录验证和部署。

### Task: [skill-feedback-003] 外部 skill 自助临时凭证

- 状态：DONE（已提交/push/部署，用户授权）；功能 514de69，运行镜像来自生产合并 7b310f9，生产迁移 d5e6f7g8h9i0。分支 feature/skill-feedback-003-public-sessions。本地后端 122 passed + 16 subtests/1 skipped，GitHub Linux 123 passed + 16 subtests，前端 16 项/0 新增 TS 错误；隔离 PG、nginx 实际限流、生产公网/只读查询通过。
- 目标：无需公司账号的 skill 按单次任务申请反馈专用凭证；修正隐藏在加载按钮后的创建入口，公司用户下拉选择；管理员登记固定 ID、改名/升级沿用 ID、停用/开放、匿名身份和统计、全局/来源持久配额。
- 边界/禁止项：不安装平台 skill、不采集真实用户数据、不分发真实密钥、不动 CAD/ODA/生成算法/18010/key/数据卷；原 styles.css/比较文档/临时脚本未提交，生产 .env 校验一致。新配对备份和 :20261010-public 老镜像保留。
- 验收：未开放拒绝；版本/任务/平台/来源/有效期/十次总量限制；轮换会话与伪造 IP 不能绕过配额；关闭并重开不恢复旧 token；问题 pending、匿名不算人；旧公司凭证与历史保留；前后端检查、迁移拒绝破坏降级。
- 后续：生产尚无登记 ID/凭证；先在反馈后台登记实际 skill 并交付 ID，再联调。生产代理信任保持空，用户共享来源预算；扩大使用前核验真实 IP 链路。真实浏览器/平台操作待验收，详见 archive/handoff-2026-10-10-feedback-public-release.md。
- 文档：skill-feedback、architecture、decisions、checks、handoff、skill-feedback-integration 与 public-sessions 归档；2.0 不引入编排引擎，任务和证据关联保留，运行配额与业务历史分层。

最新阶段覆盖：本节本地/暂停/未部署描述为开发验收记录，当前已提交部署与 CI 状态以上方队列和生产归档为准。

### Task: [skill-feedback-002] 反馈防滥用

- 状态：DONE（已提交/push/部署）。用户 2026-10-10 授权；GitHub 功能 55216ab，运行镜像来自生产合并 30dfe26，迁移 c4d5e6f7g8h9。
- 分支：feature/skill-feedback-002-security；原访客 styles.css、比较文档和临时脚本保持原状。
- 目标/实现：反馈独立凭证不能调业务接口；用户/设备/skill 版本、过期/停用/撤销、原子额度、解析前大小和 nginx IP 限制；未经核实问题不进收件箱/不重开，admin/ops 确认后聚合，恶意文本只存为数据。
- 验证：本地 102 passed + 16 subtests/1 skipped，GitHub Linux 103 passed + 16 subtests；前端 15 项、23 既有/0 新增 TS 错误及构建通过。隔离 PostgreSQL 迁移/认证/核实/并发硬限额、nginx 实际 413/429，公网和生产只读查询通过；没有合成业务数据写入生产。
- 风险/后续：生产凭证数量 0；平台 skill 与真实浏览器操作待验收。旧来源声明仍非真实性证明；创建新凭证后不做破坏性 downgrade。旧镜像、配置/DB/整包+增量媒体备份保留。
- 边界：不分发真实凭证、不安装平台 skill、不改 CAD/18010/key/媒体数据；生产保留 Nano Banana 四文件。
- 文档：skill-feedback、architecture、decisions、checks、handoff 与 archive/handoff-2026-10-10-feedback-security-release.md。
- 2.0：凭证、原始事件、核实、改进分别追踪/审计，不扩成编排引擎。

### Task: [skill-feedback-001] Skill 自动采集与改进后台

- 状态：DONE（2026-10-10 本地，未提交/push/部署）。用户在部署前要求先调整反馈，发布保持暂停。
- 目标：WorkBuddy/Codex 反馈采集无需填表；任务内关联执行/评测/交付后纠正，原始事件和需关注问题分开。
- 边界：新增 runs/events/issues 模型、迁移 b3c4d5e6f7g8、采集/管理接口与后台面板；原人工线程兼容，独立改进状态。不编写/安装反馈 skill、不发送外部消息、不采集真实用户数据、不改 CAD/执行算法/生产配置/无关文件。
- 实现：Agent 鉴权、客户端范围事件幂等与关联 ID、来源声明、skill 名/版本；按版本与稳定问题代码聚合并保留每次证据。普通执行只统计；明确问题/纠正进入收件箱。沟通待回复/已回复，与改进待分析/待修改/待验证/已解决分开；评分、根因、建议、复测展示，更新有审计记录。
- 验收：正常数据不创建问题，重试不重复，版本不混，任务元数据不变；来源/权限/体积限制，旧表单兼容、双状态独立与解决后纠正重开；SQLite 升降级保留旧反馈。后端完整 93 passed + 16 subtests、1 skipped；最新反馈专项 23 passed；前端统一检查通过，0 新增类型错误。
- 依赖与限制：发布须先备份并执行新增迁移，前后端一起更新；真实 PostgreSQL、并发压力、平台联调、浏览器交互未验收。不是任意文本自动语义聚类；外部采集端需生成稳定任务/事件 ID 并声明来源。
- 文档同步：docs/skill-feedback.md、handoff、architecture、checks、plan 与反馈归档。
- 2.0 兼容：结构化长期业务历史与执行模型解耦，保留来源/证据，不新增编排引擎、不覆盖原始事件。

### Task: [studio-perf-005] Studio 后台暂停与配置低频刷新
- 状态：**DONE（2026-10-08 本地；未提交、未部署）**
- 目标：减少后台无效请求，同时保持长时间打开页面时配置可更新。
- 分支与依赖：继续 `feature/studio-perf-003-history-pagination`；依赖上一轮未提交的分页/任务跟踪改动，两项在同一加载器内顺序完成。
- 实现：Page Visibility 隐藏时清除轮询定时器，返回时立即同步；已有请求运行时排队一次返回同步。运行/空闲仍分别 4/12 秒，使用最新回调，避免每次 tasks 更新重建定时器。
- 配置：health、projects、providers、workflows、promptTemplates 每 5 分钟按需刷新；失败保留原配置，显示错误，5 分钟后再尝试。初始和显式 full 加载仍即时刷新配置。配置错误不阻断任务进度，成功后清除对应错误。
- 边界与禁止项：仅 Studio 登录态加载器；不暂停服务端任务、不强行中断已发请求、不改访客行为、不改其他页面；CAD、生产配置、业务数据及原工作区改动保持不动。
- 验收：隐藏不轮询，返回更新旧任务；长时间隐藏后刷新到期配置；失败不清空原值；切账号/卸载清理监听器并忽略旧响应；已加载历史和游标保留。
- 验证：加载器 hook 回归 10 passed（包含上一轮 4 项），Vite build 通过；全量类型检查仍有基线问题，无本轮新增错误。
- 文档：`docs/handoff.md`、`docs/architecture.md`、`docs/archive/handoff-2026-10-08-studio-history-pagination.md` 同步；无迁移、新依赖或服务端修改。
- 2.0 兼容性：只调整客户端查询时机，持久任务仍由服务端执行，状态可追踪；不改变未来工作流执行/恢复/审计模型。

### Task: [studio-perf-003] Studio 历史分页与运行任务跟踪
- 状态：**DONE（2026-10-08 本地；未提交、未部署）**
- 目标：历史可按需加载，较老的运行任务仍能更新到终态。
- 分支：`feature/studio-perf-003-history-pagination`，基于 `65c47a0`。
- 实现：`/tasks` 新增 `before_id`、`task_ids`，按 ID 降序；`/assets` 新增 `task_ids`，权限与收藏过滤在 limit 前执行。前端 API 真正传递参数；历史每页 120 条，按任务取齐资产；刷新保留已加载历史。
- 跟踪：轮询最近 40 条 + 全部 pending/running，对离开运行列表的已知任务按 ID 补查终态；已删除任务从跟踪中移除。空闲刷新也仅刷新任务/资产。
- 边界：项目/类型/模型/状态筛选仍在已加载记录上执行，页面有提示；不做全库搜索、独立资产库分页、虚拟列表；隐藏页面暂停由后续 studio-perf-005 完成。
- 禁止修改项：CAD、布置算法、生产配置、用户数据、访客样式和无关工作区文件。
- 验收：新增/删除不使 ID 游标漂移；较老任务完成可见；跨用户资产不挤掉当前用户结果；翻页失败可重试，账号切换清空历史。
- 验证：后端列表测试 33 passed，前端 hook 回归 4 passed，Vite build 通过。扩大回归 45 passed/2 failed，两项失败在基线代码复现（Meilisearch 未启动、旧 dashboard 权限断言）。tsc 当前 23 项、HEAD 27 项，新增错误 0。
- 依赖与文档：无迁移，无新增包；前后端须同时部署。同步 `docs/handoff.md`、`docs/architecture.md`、详档 `docs/archive/handoff-2026-10-08-studio-history-pagination.md`。
- 2.0 兼容性：只增加查询参数，保留任务/资产关联和持久历史，不改变执行或审计模型，后续工作流可复用查询能力。

### Task: [cad-extract-001] 居委会图纸分区、审查与家具
- 状态：**DONE（2026-10-08 已部署生产）**
- 详档：`docs/archive/handoff-2026-10-08-cad-geometry-fitout-wip.md`（09-29「还是不对」已过时）
- 已做：几何分区、多边形与可摆区域、组团、评分改写、咖啡厅吧台/操作台；男女卫生间与厕位门保留
- 部署：GitHub `65c47a0`（功能 `872dc3f`）；按用户冷启动补充，生产 git `fe3adb5`，运行镜像仍来自 `1783bec`。迁移 **`z1a2b3c4d5e6`**，`/studio/cad` 200。生产无 DWG 转换器，等待用户提供官方 Linux ODA 安装包，此前只收 DXF。现有 `ce_0abae8a9402f` 为需转 DXF，不自动重转；不要重跑 `ce_94778ce26c6e`。本轮未连接生产复核。
- 非目标：线稿、ControlNet、Canvas 生图；不要再改布置算法，不要拆卫生间
- 本地图：`ce_94778ce26c6e`（09/28 15:02），一层网格 4.74。不要生成 `ce_d2955df6f9b9`。不要改旧图 `ce_b121e1b892de` 的咖啡厅

### Task: [quality-gate-001] 最小自动检查
- 状态：DONE（2026-10-10 本地，未提交/push/部署）。
- 目标：前后端关键回归可统一执行，新增类型错误不能静默通过。
- 边界：frontend/package.json、scripts/typecheck-baseline.mjs、类型基线/检查器测试、backend/requirements-dev.txt、scripts/check.py、软删除测试权限夹具、.github/workflows/check.yml、文档。
- 实现：前端 npm run check 串联 13 项回归、全源码类型基线对比与构建；后端明确离线关键检查集，忽略项目 .env、临时存储/SQLite、关闭外部搜索。CI 两个 job，不部署、不使用生产秘密。
- 验收：本地统一命令通过；基线逐项匹配并阻止新增/重复增加；完整 typecheck 仍保留非零失败；测试不读取业务数据。GitHub 执行须提交后验证，不声称已运行。
- 依赖/限制：Node22/Python3.12；已有 TypeScript 错误未修复；不是全后端/外部服务/浏览器验收。修复旧 dashboard 测试以 admin 核对并断言 ops 403，不改生产权限。
- 文档同步：docs/checks.md、handoff、continuity、plan 与本轮归档。
- 2.0 兼容性：仅增加开发验证，不改变工作流、持久记录、执行或审计行为。

### Task: [docs-align-001] 正式文档对齐
- 状态：DONE（2026-10-08 本地，未提交/部署）。
- 目标：正式文档能区分当前代码、本地 WIP、生产快照与历史。
- 边界：plan/tasks/continuity/architecture/decisions/handoff 及对应归档；不改产品行为，不操作生产或无关文件。
- 实现：完整保存对齐前 5 份文档；归档旧 June 合并顺序、完成任务和重构过程。保留尚未完成/需核对任务索引。更新 ops 权限、真实能力、测试/迁移、媒体直出、启动兼容补列与服务器版本。
- 验收：当前文档路径/链接可解析；过时排期不再高于当前任务；不把未部署改动写成已上线，不丢失原始任务说明。
- 依赖：本轮代码只读核对与用户提供的生产事实；生产时点信息明确标注未重新连接复核。
- 文档同步：handoff、archive/handoff-2026-10-08-docs-alignment.md。

## Deferred And Verification Index

下列事项没有被这次文档整理判为完成，也不自动开工；原说明见完整任务归档或原专项档。

| ID | 当前处理边界 |
|---|---|
| chat-b2-001 | HITL 生图/视频切片仍待收口，助手 UI 不自动开放 |
| agent-wip-001 / agent-codex-harness-001 | harness/memory/gov 代码已有；旧记录部署状态不统一，续做前核对专项代码和最近生产交接，不整包合并 WIP |
| canvas-20260721 | 画布复制/批量运行 stash，先核对 stash 内容；保持暂缓 |
| chat-nav-001 | 旧记录“本地 DONE 未提交”是否已并入后续提交需核对，不照旧描述直接部署 |
| image-vip-001 | 旧 READY_TO_CONFIGURE 与 UA 热修记录需按当前适配器及生产配置核对 |
| guest-001 | P0/P1 已部署；P2 匿名限流/清理/smoke 仍是后续候选 |
| inspiration-001 | 新功能和内容运营搁置，只读维护 |
| hh-i2v-004 | 可选多 Key/试错 Key 隔离，正式量增加后再评估 |
| prod-001 | 已存在拆分后的 hooks/panels；继续大拆曾被要求停止，仅必要问题修复，不恢复旧重构排期 |
| prod-005 / prod-006 / prod-007 | CORS/限流/会话清理已有代码；生产配置与启用状态需专项核对，不重新立项为零实现 |
| prod-008 | OSS 代码和同步脚本已有；生产仍按交接为 local，切换需专项备份/验证与用户要求 |

其余 DONE 的历史验收保留在归档。微服务、多租户、替换 Redis 不列入当前迭代。

### Task: [ops-storage-001] 媒体治理

- 状态：IN_PROGRESS；只读预览子步骤 DONE（2026-10-10 本地，未提交/部署）。
- 目标：按 30 天 mtime 预览 generated 图片/视频占用，保护数据库引用，输出可复核报告。
- 边界：新增 media_audit 服务、audit_generated_media CLI、临时数据测试及文档；仅 SELECT/只读事务，无删除入口。不触碰真实业务库、生产卷、CAD、环境配置或无关工作区文件。
- 实现：实际 schema 文本/JSON 列扫描，包括归档/软删除行；URL 编码与 Markdown 路径解析，.bin 同名别名保守保护；过期无引用只列候选；报告不输出业务字段值与连接秘密，拒绝覆盖报告/在媒体目录写报告。
- 验收：临时库/文件分类、JSON 与缺失引用、数据库写入拒绝、不创建缺失数据库、路径越界/链接隔离；Windows 链接权限不足项跳过，待 Linux 验证。前序离线 66 项回归保持通过。
- 限制：PostgreSQL 真实连接、Linux 链接测试与生产容量未验证；不透明引用/OSS/其他 schema 不保证覆盖，候选不授权删除。没有清理计划或执行器。
- 依赖/文档：不新增依赖/迁移，详见 docs/media-audit.md 与 docs/archive/handoff-2026-10-10-media-audit.md。
- 2.0 兼容性：独立只读运维工具，不改变应用执行、数据留存、审计或工作流。

## Next Step

视频模板与 GIF 自动压缩已上线，发布/备份/回退和验收详见 archive/handoff-2026-10-15-video-gif-release.md。

后续继续已记录的反馈客户端真实产物、浏览器视觉及真实 IP 信任链验收；不重复核实已 accepted 的测试事件或重做已上线接口。

最新验收见 archive/handoff-2026-10-13-feedback-live-verification.md；冷启动红线见 archive/handoff-2026-10-13-next-conversation.md。反馈时间展示 b619413 已部署，生产 git 0a41ad8c，运行前端来自 b04ffb53；不要重做已上线接口。先直接只读查服务器反馈与正式 ID，并核对外部 E:/projects/test/agent-skills 当前版本；已有真实检索回传不等于素材核实通过。run_id=2 的核实/聚合已通过 SSH 完成；继续时间 UI 视觉与真实平台产物验收；扩大使用前核验真实 IP 信任链。媒体/类型基线/容量/缩略图/历史视频随后处理，CAD 等官方 Linux ODA 包。原访客样式、比较文档、_tmp_* 保留。
