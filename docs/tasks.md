# Tasks

Last aligned: `2026-10-19`。旧任务原文与开发顺序完整保存在 `archive/document-baseline-before-2026-10-08-alignment/tasks.md`，不作为当前排期。

## Rules And Current Goal

- 状态使用 TODO / IN_PROGRESS / BLOCKED / DONE；注明本地/已提交/已部署。
- 每项限定为一个可审阅修改单元；同步 handoff，涉及架构再同步 architecture，中大型任务做 2.0 兼容检查。
- 当前是 1.0 生产稳定化：历史可靠性、减少无效刷新、文档、自动检查与媒体治理。6 月 Studio/Video 合并序列已归档。
- 角色、账号归属以代码为准；有效角色 admin/ops/designer，owner 兼容为 admin。
- 原访客样式/比较文档/临时脚本不混入本轮提交。不得按旧 stash 序号 pop。
- 用户已于 2026-10-10 明确授权本轮累计变更提交、push 与部署。CAD 和已明确暂缓事项保持边界。

## Next Conversation Checkpoint

- comfyui-production-004 / comfyui-edit-002 已发布完成：持久队列/恢复/幂等、1～3张、1K/2K/4K/自定义、双图编辑及SYSTEM守护均已验证；九项真实任务十一张。以 docs/comfyui-frp.md 为准，按用户新需求，不重复GPU验收/重装守护。
- 用户已要求于 2026-10-16 先留档，后续在新对话继续。冷启动读取 archive/handoff-2026-10-16-next-conversation.md，10-13 的 next-conversation 仅保留历史，不代表当前部署。
- 管理台账与四视图工作台均已上线，admin 已明确授权；下一步按用户新需求，优先实际管理员页面/真实资料验收，不能用本地样例冒充业务记录。本次留档不新增开发范围。

## Current Queue

### qwen-v11-007 — v1.1 模板与适配准备

- 状态：IN_PROGRESS（用户明确只准备，不激活、不跑GPU）。
- 目标：共享easy seed/50步GPU缓存、单图合同与前后端校验兼容；服务器独立目录同步模板/哈希/源码并离线验证；核对600秒预算。
- 禁止：改provider启用状态、覆盖在用map、发布运行镜像、提交GPU任务、修改Z/原styles13行/原未跟踪文件。
- 验收：原始SHA、共享种子链接/一图/输出、后台测试/前端回归；服务器隔离无网络合同检查，active文件/provider/容器不变。
- 文档：qwen-v1.1-preparation/tasks/handoff/comfyui-frp；后续激活/实际耗时输出为独立待授权验收，不混作完成。模板合同与checkpoint版本保留未来多步骤追溯。

### comfyui-feedback-006 — 执行进度与双图提交引导

- 状态：DONE（功能c048893已推main，生产合并95794424，仅frontend部署）。
- 目标：补无百分比动态条；本机编辑两图条件在标题/提示/按钮一致，单图不再显示可提交；提交阶段中文。
- 禁止：取消后端两图验证、开放未验证单图变体、改后端/FRP/Windows/原styles.css。
- 验收：52前端检查、TS零新增/构建；Chrome1440/390动态/双图条件/无溢出，公网bundle和容器SHA一致。
- 文档：tasks/handoff/comfyui-frp；仅展示与输入引导，无2.0结构变化。

### comfyui-composer-layout-005 — 创作框布局回归

- 状态：DONE（0a83c2a已推main，生产合并d5311599；仅frontend部署）。
- 目标：恢复三行创作框，连接状态/自定义宽高移入既有显示菜单；保留所有生成参数功能。
- 禁止：原styles.css未提交13行、后端/数据/FRP/Windows运行状态。
- 验收：51前端检查/TS无新增/构建；Chrome真实组件1440/390宽度截图、无溢出、尺寸交互；公网包与容器一致，仅frontend替换。
- 文档：tasks/handoff/comfyui-frp；纯展示位置调整，无2.0结构影响。

### comfyui-production-004 — 生产任务闭环

- 状态：DONE（已提交/推送main/部署，功能7a9874b，迁移b27d0f85c932）。用户2026-10-19授权全部解决审计缺口。
- 目标/边界：同事务持久待办、领取租约/心跳/恢复、本机串行与多张逐张执行、提交幂等、断线核对与人工处理入口；统一参数/真实状态；分辨率与双图编辑；Windows 守护、重连/证书运维。
- 禁止：覆盖原 styles.css +13 或原未跟踪文件、重置库/媒体/key、改 CAD/18010；不盲重交不确定 GPU 任务。
- 验收：九项真实任务十一张（8245～8250、8253～8255）及SHA/归属/账、SYSTEM重拉/FRP断线/worker恢复；PG副本49表保留/并发领取/同键唯一/容量、最终Linux隔离30项与CI后端227+24sub/前端50通过。25份发布备份、10份后验收备份两端SHA一致。未做整机重启/长期压测，不伪称该项通过。
- 文档：tasks/handoff/comfyui-frp/architecture/server-operations；新增业务工件仍沉淀既有 Task/Asset，持久调度单独建表，为多步骤执行保留扩展边界。

| ID | 事项 | 状态 | 下一步或事实 |
|---|---|---|---|
| comfyui-provider-ui-003 | ComfyUI 图片渠道前端接入 | DONE（已发布，01d6c11/13bbe74） | 补 ComfyUI adapter 标签、未知类型不再默认视频；生成页图片白名单包含 ComfyUI，本机独立分组，图片/视频/编辑菜单与后台真实组件回归 |
| comfyui-frp-001 | Windows ComfyUI 私有隧道与文生图 | DONE（已上线并真实验收） | 回环收口；Z Image task8237/asset9263、Qwen task8238/asset9264 实跑、媒体SHA/归属/账记录通过；id60/61启用；后续生产闭环/多张/尺寸/守护与编辑见004/002 |
| comfyui-edit-002 | ComfyUI 双图编辑 | DONE（已发布） | id62启用，目标图+参考图归属/上传/绑定/回存；8248/8254/8255为1K/2K/4K实跑，单图变体不在批准范围 |
| management-workbench-002 | 管理工作台与交互排期 | DONE（已部署，514a8cb/ce31075） | 四视图、列分组排序/右侧详情/搜索选人；DHTMLX 10.0.3 MIT，拖动预览/版本保存/失败保留；本地 Chrome 操作与窄屏检查、CI 后端 197/前端 43 通过，仅替换 frontend，六人授权/API/业务数据保留，无迁移 |
| management-projects-001 | 公司管理层年度台账与人员甘特排期 | DONE（已部署，db376ec） | 独立公司权限/单位隔离，五位已核对账号及后续明确授权的 admin 已开通；台账全字段、人员、阶段甘特/里程碑/重叠、CSV、归档/版本保护；迁移 a16c9e74b821，生产副本与线上只读验证通过，无示例项目；真实浏览器点击因工具故障未验收 |
| migration-bootstrap-001 | 历史空库迁移链完整性 | TODO | 纯空库 alembic upgrade head 在旧 chat_messages attachments 迁移缺表；生产副本升级和 Base.metadata 建表后新迁移均通过。本轮不改旧链，后续用独立任务修复并建立从零回归 |
| cad-auto-route-001 | 系统通路建议与人工修改 | DONE（已部署，23ccfa8） | 只读建议、完整宽度避障/部分连通提示；预览采用保留手画，支持修改折点/宽度/起点与删除 |
| cad-preparation-001 | 布置前尺度、功能与主通路确认 | DONE（已部署，cfdccca） | 每平面两点校准、明确用途/保留空白、手动主通路家具禁放；旧方案保留，条件失效须重确认；不自动重跑旧图 |
| cad-fitout-timeout-001 | 布置结果被外层代理超时截断 | DONE（已部署） | 宝塔 CAD extracts 前缀等待 300s；已纠正前缀尾斜杠导致列表循环跳转，内部 rewrite 兼容浏览器已缓存的 301，补六条只读路由检查；已存三套方案，不重跑原记录；ops/nginx/cad-extracts.conf 可恢复 |
| gif-info-001 | GIF 原始与结果实际参数 | DONE（已部署） | 1997c3f；原始/结果实际尺寸、平均 fps、用色等可见，旧历史可按需补读，无迁移 |
| gif-edit-001 | 统一其他导航与压缩记录复用 | DONE（已部署） | f18b5d6；两套侧栏共用其他入口，历史/当前结果可复制原件与参数，新结果另存 |
| gif-history-001 | GIF 持久历史与资产库 | DONE（已部署） | 9b89b53；历史/资产库 GIF 分类按账号持久保存，迁移 f7g8h9i0j1k2，旧未知归属文件不自动补录 |
| gif-batch-001 | GIF 推荐压缩参数与批量处理 | DONE（已部署） | 1fc9174；344/12.5fps/96 色，20 文件顺序处理与 ZIP 下载；运行 GIF 5707655→488082 字节 |
| other-gif-001 | 其他模块与手动 GIF 压缩界面 | DONE（已部署） | 52276de；侧栏其他含图纸解析/GIF 压缩，默认 500KB 可调，预览/下载；生产真实压缩 1597553→258959 字节 |
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
| cad-extract-001 | CAD 图纸提取 | DONE（已部署） | DXF 解析与 Linux ODA DWG 转换均可用，旧记录不自动重转 |
| cad-dwg-002 | Linux ODA 接入 | DONE（已部署） | 0346eee/b1532b1；官方 ODA 27.9 与 Xvfb 容器内持久接入，新公开 DWG 转换/实体/预览/隔离上传通过，旧图不重跑 |
| video-grok-timeout-001 | Grok 轮询超时 | TODO | 9 月上游问题；复核当前失败记录再处理，不自动重提任务 |
| video-seedance-502-001 | Seedance 参考图代理/DNS | TODO | 历史上游问题；先确认当前是否仍发生 |

## Current Task Details

### Task: [comfyui-provider-ui-003] ComfyUI 图片渠道前端接入

- 状态：DONE（2026-10-19 已前端发布，01d6c11/13bbe74；生产运行合并ae2901af）。用户反馈本机图片模型显示到视频渠道；API的image.generate能力正确，根因是ModelsPage未知adapter回退到第一项Haodeya视频，以及Studio图片adapter白名单遗漏comfyui。
- 边界：ModelsPage的适配器选项/未知标签、modelAdminUtils图片可用性/ComfyUI来源分组、真实前端组件与菜单回归；不修改模型能力/秘密/价格、后台生成链路或原styles.css改动，不再跑GPU任务。
- 验收：后台显示ComfyUI本机图片，未知adapter保留自身标识/未适配；两模型出现在文生图本机分组，不进入视频或未实现的图像编辑模式；46前端回归、无新增TS错误、构建及公网新chunk验证通过。保护真实记录和现有backend/worker/FRP运行，发布只换frontend。
- 发布：仅frontend换为623a18419d7cbeea2f507d95d6a508c571d9780a624f45b7dbff98131d3ef1df；其他容器ID/启动时间/镜像、env保持。公网新ModelsPage/共享helper chunk与容器字节SHA一致，入口指向新bundle，health与六CAD路由通过。两端13份恢复证据SHA一致、5802媒体/0增量，引用上一真实生成完整恢复链；没有重跑GPU。
- 依赖/同步：现有真实provider id60/61、docs/comfyui-frp.md；更新tasks/handoff，架构图片入口说明。2.0仅纠正已有能力展示与路由筛选，不变数据/执行/归属。

### Task: [comfyui-edit-002] ComfyUI 双图编辑

- 状态：DONE（2026-10-19已发布，id62启用）。批准双图图已接入既有账号/项目/私网；1K/2K/4K真实任务8248/8254/8255、资产9273/9279/9280及SHA/归属通过。
- 边界：两张当前账号可访问图片的上传、准确LoadImage绑定、批准工作流参数、既有Task/Asset/ledger持久化；不改原示例图或原图生图模板，不增加单图变体/任意graph/节点安装；守护另在004完成。
- 禁止：跨账号读图、传服务器本地路径给Windows、以模板示例图补缺图、全局interrupt/clear或重复执行状态不明任务，修改env/key/CAD/原未提交文件。
- 依赖：本机API-HANDOFF与workflow-map的编辑图、LoadImage470/475及输出461；单图变体尚未实跑，另行定义。
- 验收：双图上传返回值准确绑定，非本人图片拒绝、少图明确报错；真实history/图片下载/归属与SHA一致，原图不改，故障不混任务；每次真实GPU运行须在授权范围内。
- 文档同步：tasks/handoff/comfyui-frp，涉及接口边界更新architecture；2.0沿用workflow hash/prompt_id/Task与资产归属，不引入任意工作流执行器。

### Task: [comfyui-frp-001] Windows ComfyUI 私有隧道与文生图

- 状态：DONE（2026-10-19 已部署/已启用/真实验收）。边界：FRP服务端、专网、证书/认证、两个文生图adapter、Task checkpoint/GPU锁、图片回存；不含图生图或Windows服务/长稳。
- 结果：回环127.0.0.1:8188；公网mTLS和错误凭证拒绝；frontend阻断、backend/三worker只读通路通过。正常公网网站API/现有admin账号与既有项目生成两张1024²，Z8237/9263/32480ms、Qwen8238/9264/46526ms；Task/Asset/ProviderCall/UsageLedger及本机/服务器/下载SHA一致，id60/61启用，GPU锁释放。
- 配置：原启动器已停、listen=false与回环保留。后续004已由SYSTEM开机守护接管ComfyUI/frpc，旧PID不再有效，运行材料C:/ProgramData/QMDH-FRP。001阶段原无schema变化，004追加两表；不导出私钥、不公开8188、不改env/key/CAD/18010/卷及原未提交文件。
- 检查：此前本地232/24subtests、隔离14与功能CI通过；本轮只改本机运行配置/模型启用和正式验收记录，无源码变化，不重复全站测试。
- 回退：先禁用id60/61再回旧镜像，不删除真实任务/媒体。最新DB/媒体增量恢复备份已配对，2文件3318213字节/7备份SHA一致。
- 2.0：沿用Task/Asset/ProviderCall/ledger，workflow hash/prompt_id追踪，不引入新编排。同步tasks/handoff/architecture/server-operations/comfyui-frp。

### Task: [cad-auto-route-001] 系统通路建议与人工修改

- 用户明确要求由系统先生成，同时保留手画和修改权。新增账号归属只读 POST /cad/extracts/{id}/route-suggestions；尺度/功能确认后生成建议，不写正式条件/方案/媒体。用户预览并采用后另点保存。
- 基于 mask/墙线、已知楼梯电梯包围框、校准比例构造完整宽度可行域；仅合拢微小分割缝，原墙线不跨越；保守方形净空侵蚀＋连通分量＋四邻域最短路树。优先入口分区/接待/大分区，未知入口标建议；可指定起点。无法连通/太窄/缺墙图明确报告，不用直线穿墙补接。
- 采用时只替换未修改的系统通路，保留旧无来源和手画通路；用户改折点或宽度后成为 manual，后续建议不覆盖；12 条/30 折点限额不静默丢弃。保留手画、删除、取消修改、指定/恢复起点。
- 校准与确定用途仍需输入，建议不等同实际入口/门洞或疏散验收。当前三种家具策略共用用户采用的通路网络，不新增目标型方案。无迁移，复用 CAD JSON，旧签名兼容。
- 禁止自动重算保护旧图/覆盖原 styles.css、比较文档与 _tmp_*；key/18010/数据卷保持。只读真实图副本试跑可做，但不保存或生成其正式家具方案。
- 检查：后端新 9 项、完整本地 181 passed/1 skipped/16 subtests；Linux CI 182 passed/16 subtests；前端 34 项/23 既有、0 新增类型错误/构建，组件事件测试覆盖预览/采用/手画保留/改宽/移点/取消。当前 cua 浏览器连接因 kernel assets 路径缺失失败，未宣称新拖点已做真实浏览器验收。
- 23ccfa8 已部署，生产运行合并 f060300c；新镜像隔离 HTTP 建议/不写记录/采用保留手画/保存/三家具方案避让/跨账号拒绝通过。原 ce_1e513e72a64e 两平面按既有估算比例、1.2 米宽只读试跑均 partial，分别 2/1 条建议、1/1 分区连通、4/2 未连通，耗时 6.6/3.52 秒；SQL READ ONLY + 媒体只读挂载，不保存/重算正式条件和家具。
- 发布备份 release-20261016-cad-auto-route 两端 SHA256、空媒体增量与 env 不变核验；媒体恢复链明确引用前次私有备份包，未删除/重新复制旧包。新备份及前次目录 ACL 修正为仅 Admin/SYSTEM 可继承，以保证原受限文件可读。

### Task: [cad-preparation-001] 布置前确认第一阶段

- 用户授权按分析改进，先落实尺度确认、功能确认与主通路预留。范围：新增账号归属 POST /cad/extracts/{id}/preparation，复用 payload_json；每平面独立两点米制校准，重算房间面积/多边形/可摆区域并同步撤销快照比例；保留原件、图像、旧布置，不自动重新生成。
- 明确九种用途含保留空白，不再用模糊名称决定新布置；手动标注最多 12 条通路（每条 2–30 点、宽 0.8–4 米），三方案放置前预留、放置后逐像素校验家具轮廓。密度/铺开评分排除预留带；界面说明它只是排布参考分。
- 条件签名覆盖分区/几何/原 mask 和标注参数，修改/撤销分区后须重确认；旧方案与新条件不一致时明示。已确认分区不再被布置接口隐式拆分，旧 clear 操作仍可用。
- 限制：本阶段不自动识别核心筒、不承诺墙体连通/门洞/疏散验证，也未实现人数容量优化和服务/交流等目标型方案；后续按实际验收再推进。使用者需手动标注主通路，宽度是可调设计输入。
- 验收：新增后端 11 项、原 CAD 31 项；Linux CI 173 passed/16 subtests；前端 32 项/23 既有类型错误、0 新增/构建；独立浏览器预览点选两点、选择功能、绘制/保存通路并恢复通过。隔离测试不得写正式 DB/媒体，不重算保护旧图，不提交原 styles.css/比较文档/_tmp_*，不动 key/18010/数据卷。
- 2.0：条件与方案签名是既有 CAD 工件输入快照，无新迁移/编排，后台归属权限保持。同步 architecture/handoff/server-operations；发布前配对备份 release-20261016-cad-preparation，原 env 不变。

### Task: [gif-info-001] GIF 原始与结果实际参数

- 状态：DONE（已提交/推送/部署），功能 1997c3f、生产运行合并 cd60dab3，分支 codex/gif-media-parameters。
- 目标：补上原始 GIF 的实际尺寸/帧率/用色等信息，支持压缩结果对照，避免把初始上限误认为实际参数。
- 边界：新增鉴权只读 POST /assets/gif-inspect（不保存文件/记录），选中文件后显示参数；原件/结果实际信息写入既有 compression JSON，无迁移；旧记录详情 inspect_metadata=true 在原归属校验后按需读取文件，不改写旧记录。
- 验收：尺寸/帧数/总时长/平均 fps/变帧率/每帧最多实际用色/循环/透明可见；新历史持久，旧记录缺参数可读，不跨账号读文件；读取超时/繁忙/文件无效提示真实状态，不影响已验证压缩结果保存。
- 禁止：覆盖原 styles.css/比较文档/_tmp_*，改 CAD/key/卷/18010，伪造帧率或把请求颜色上限当实际用色。
- 依赖：既有 GIF 解码预算与存储接口；同步 architecture/handoff/archive。2.0 兼容：工件元信息复用 JSON，不扩展任务编排/数据库结构。

### Task: [gif-edit-001] 统一其他导航与压缩记录复用

- 状态：DONE（已提交/推送/部署），功能 f18b5d6、生产代码合并 ce56c34d，仅前端更新，分支 codex/gif-copy-and-navigation。
- 目标：修复生成页仍显示图纸而通用侧栏显示其他；支持历史记录复制到压缩区并调整后新建结果。
- 边界：OTHER_TOOLS_NAV 共享名称/入口，两套侧栏复用；当前结果/历史回看增加复制按钮，读取原件为 File 并恢复全部初始参数，清除 record_id 查询、返回表单，等待用户点击压缩；新结果走既有接口另存，原记录/文件不改。
- 验收：两侧栏实际渲染均为其他、点击同到 /studio/other；复制取原件而非派生结果，保留文件名/0 值/false 选项，读取失败或非 GIF 明确报错；参数仍可调整，处理中禁止冲突操作/忽略卸载后响应；前端 30 项/23 既有、0 新增类型错误/构建通过。
- 禁止：覆盖原 styles.css/比较文档/_tmp_*，修改 CAD/key/卷/18010、覆盖旧记录或虚构新后台接口。
- 依赖：已上线历史与单件压缩接口；无新迁移/后端改动。同步 architecture/handoff/archive；2.0 沿用既有工件与参数快照，不扩展编排。

### Task: [gif-history-001] GIF 压缩持久历史与资产库

- 状态：DONE（已提交/推送/部署），功能 9b89b53、生产运行合并 e6d98efa，分支 codex/gif-persistent-history。
- 目标：解决压缩结果仅在页面内存、刷新丢失且资产库无记录的问题。
- 边界：新增账号归属的 gif_compression_records，记录原件/结果路径、文件名、参数、大小与达标状态；单件成功请求提交 DB 后才返回成功，包括未达标/无需压缩结果；历史列表/详情与资产库 GIF 分类复用此记录，无虚构生成任务。
- 验收：刷新后最近 20 条可回看，资产库全部/GIF 分类可检索和回跳；原件与结果可下载，跨账号含 admin 拒绝访问，迁移保留旧数据；旧无归属 UUID 文件不自动猜测归属补录。
- 禁止：修改 CAD/key/18010、覆盖原 styles.css/比较文档/_tmp_*、清理历史媒体或向正式库写测试账号/夹具。
- 依赖：新增迁移 f7g8h9i0j1k2，发布先备份/隔离迁移验收再应用；同步 architecture/handoff/archive。
- 2.0 兼容：记录是账号所有的工具工件，复用现有存储与库聚合，不改生成资产权限/不新增编排。

### Task: [gif-batch-001] GIF 推荐参数与批量处理

- 状态：DONE（已提交、推送、部署），功能 1fc9174、生产运行合并 0449ec4b，分支 codex/gif-batch-presets。
- 目标：采用用户建议的最长边 344、12.5fps、最多 96 色与抖动，继续以 500000 字节为目标；支持批量上传与下载。
- 边界：新上传自动处理与手动工具默认值对齐，保留单次参数、Lanczos 等比不放大、循环/时长/透明校验和超预算回退；批量复用单文件鉴权接口，逐个发请求，不增加后台任务或新数据库表。
- 验收：真实 25→12.5fps、720×360→344×172，有限/无限/无循环及颜色限制通过；20 文件/单件 20MiB/总计 100MiB 校验、单件失败续跑、卸载停止后续上传、ZIP 重名/中文安全文件名与内容通过。
- 禁止：修改 CAD/key/历史数据/卷/18010、覆盖原 styles.css/比较文档/_tmp_*、将单件失败或未达标虚报为达标。
- 本地后端 152 passed/1 skipped/16 subtests；前端 26 项、23 既有/0 新增类型错误与构建通过。
- 文档同步：architecture、handoff、archive/handoff-2026-10-15-gif-batch.md。2.0 兼容：UI 队列和不可变请求选项复用既有媒体服务，无编排扩张。

### Task: [other-gif-001] 其他模块与手动 GIF 压缩

- 状态：DONE（已提交、推送、部署），功能 52276de，生产运行代码合并 6c09498e，分支 feature/other-gif-001-ui。
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

最新验收见 archive/handoff-2026-10-13-feedback-live-verification.md；冷启动红线见 archive/handoff-2026-10-13-next-conversation.md。反馈时间展示 b619413 已部署，生产 git 0a41ad8c，运行前端来自 b04ffb53；不要重做已上线接口。先直接只读查服务器反馈与正式 ID，并核对外部 E:/projects/test/agent-skills 当前版本；已有真实检索回传不等于素材核实通过。run_id=2 的核实/聚合已通过 SSH 完成；继续时间 UI 视觉与真实平台产物验收；扩大使用前核验真实 IP 信任链。媒体/类型基线/容量/缩略图/历史视频随后处理，CAD Linux ODA 已于 2026-10-16 部署，旧图不自动重转。原访客样式、比较文档、_tmp_* 保留。


### Task: [cad-dwg-002] Linux ODA 转换器接入（2026-10-16）

- 状态：DONE（已提交/推送/部署），功能 0346eee、Qt 依赖修复 b1532b1，生产运行合并 26095b9d，分支 codex/linux-dwg-converter。
- 授权：用户明确要求配置服务器转换器，覆盖此前等待安装包/不自行下载安装的暂缓状态；其余旧图保护继续有效。
- 目标：生产 DWG 上传经官方 ODA 27.9 Linux 转 DXF，再复用原解析链。
- 边界：官方 amd64 .deb 作为服务器私有构建输入（不入 Git），SHA256 校验、可选 Docker/Compose build args，Xvfb 包装命令持久配置；不改 CAD 分区/布置/生成算法，不重转历史记录。
- 安全：命令模板先分词后填路径、shell=False，转换临时源名固定 source.dwg；Linux 超时终止整组进程，包括 Xvfb/ODA，保留 Windows 直指 exe 支持。
- 验收：无包构建仍可用；安装包/哈希/版本可追溯，合成新 DWG 通过转换与 DXF 解析/预览；记录正式 env 允许变化的三个转换器字段、其他配置/key 保持，备份后发布/可回滚。
- 禁止：旧图 ce_94778ce26c6e/ce_b121e1b892de/ce_d2955df6f9b9/ce_0abae8a9402f 重跑或修改，动 18010/key/历史媒体/数据卷，提交安装包或原样式/比较文档/_tmp_*。
- 文档同步：architecture/server-operations/handoff/archive；2.0 兼容：仍为既有可选文件转换能力，不引入新生成/编排模型。
