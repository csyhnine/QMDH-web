# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-16] ComfyUI FRP 接入准备 — 未部署

- 新分支 codex/comfyui-frp-plan，起点 0fc630f；原 styles.css 与所有未跟踪文件保持。此前管理模块只读复核：生产 d7f14138、前端镜像仍 85b3652e、schema a16c9e74b821、六人授权启用、项目 0/名册 5；浏览器验收因控制工具无法识别 URL 停止，没有真实点击通过结论。
- 用户本轮改为准备自建 FRP 连接 Windows ComfyUI；已确认先文生图、后图生图。本机另一 agent 负责 frpc/工作流；未授权自动给其他 chat 发消息，交接文档由用户转交。
- ops/frp 提供固定 0.71.0 的 frps/visitor/windows 模板、scratch Dockerfile 与显式 Compose overlay。STCP 不发布 ComfyUI，拟用 120.79.227.11:7443/TCP；mTLS、tokenSource 与独立 STCP secret；visitor 只绑定专用 internal 网络接口，backend/worker 保留 default 网络，frontend 不接入。
- 生产只读无 7443/7000/8188 TCP 监听、无 frps 命令，拟用 172.30.218.0/28 未与当前路由重叠；安全组未核验。未开端口/启动服务/构建镜像/写业务数据/签发秘密。现有代码无 ComfyUI adapter，后续不得冒充 OpenAI 接口或声称网站已可生成。
- 验证：三份 TOML 解析通过，生产临时合并 Compose config --quiet 通过（未启动）；官方包下载超过约 150 秒未完成，仅中止本轮下载并清理临时目录，包哈希/二进制 verify/TLS/镜像/真实业务联调仍未完成。
- 详细地址、CSR/最小材料包、受限目录、签发/轮换、工作流白名单参数、prompt/history/view/结果持久化和验收在 docs/comfyui-frp.md。下一步接本机 windows.csr 与工作流包，再签发及安排网络联调；无须重问首批能力。当前无生产 token/证书可领取。Safe to hand off: Yes（方案可接手，功能尚未上线）。

### [2026-10-16] 新对话冷启动留档 — 可直接接手

- 用户要求先留档，下一对话继续。本轮仅 Git/生产只读核对与正式文档整理，不新增功能、不构建部署镜像、不写业务数据。冷启动主档：archive/handoff-2026-10-16-next-conversation.md，替代 10-13 旧 next-conversation 的“当前状态”，旧档保留作历史。
- 留档前本地 codex/management-workbench，HEAD/origin/main 9420bf2、0/0。生产文档合并 5cc038b9，前端功能运行合并 787d2370，镜像 85b3652ed57b8ce9548d81940da1944d08fa7b538a795659f9b0fdede13ee7eb；schema a16c9e74b821，后端 healthy/三 worker/其他依赖正常，生产工作区干净。
- 四视图工作台已部署，勿重复开发；六个授权账号含 admin 保持启用。只读快照项目 0、名册 5，后续须读实时数据。真实管理员公网登录 UI 验收、真实员工/项目录入仍待继续，不能用本地 mock 验收冒充；未承诺自动排程/导入/假期日历。
- 最近功能 CI 38873245073 与发布文档 CI 38873869117 成功。原 styles.css +13/-0、比较文档与 _tmp_* 保持，未纳入提交。备份链、秘密来源、ODA/代理配置、CAD 禁重跑记录和其他未完任务均在冷启动主档。
- 新对话先依 protocol 读 tasks/handoff/冷启动主档/相关代码，再按用户新需求推进；既有管理名单/管理员授权无需再问。Safe to hand off: Yes。

### [2026-10-16] 管理工作台与交互排期 — 已部署

- 514a8cb/ce31075，生产前端运行合并 787d2370；同一 /management/projects 分管理总览/项目台账/项目计划/人员排期，台账列显隐分组排序、右侧详情与搜索勾选人员。旧六人授权（含 admin）、API、记录、金额语义保持，无迁移。
- DHTMLX Community 10.0.3 MIT 精确依赖与许可文件，项目计划懒加载；拖动/拉伸/进度先预览、可查看前后变化、显式按版本逐项目保存，部分失败只移除成功项，失败/未尝试保留。归档只读，禁止父项目拖动/依赖写入与自动排程；人员负荷自行按日历日计算。HTML 转义、空值与精确金额汇总保留，未填假项目。
- 本地 Chrome headless 实际组件与真实页壳：四视图/拖动/撤销/确认保存/409 保留/页内离开取消/抽屉/390px 导航筛选及图内滚动均通过，浏览器错误 0。数据与 transport 为本地样例，未声称正式账号登录点击验收；cua 仍 kernel assets 路径错误。临时预览目录/服务已清理，样例/脚本/六截图存私有备份。
- CI 38873245073 成功：Linux 后端 197 passed/16 subtests，前端 43 项/23 既有 TS 错误/0 新增/构建成功。5799 媒体/26 文件增量 122595063 字节，两端 release-20261016-management-workbench 备份及媒体完整读取/30 文件 SHA256 通过，restore-media-chain.json 引用上次完整链。
- 只更新 frontend，新镜像 85b3652ed57b8ce9548d81940da1944d08fa7b538a795659f9b0fdede13ee7eb；backend/三 worker/postgres/redis 容器 ID、启动时间、镜像前后完全一致，未中断生成服务。公网入口/health 200，管理未登录 401，ManagementProjectsPage-DELNWkYr.js 和 dhtmlxgantt.es-DPXjonIM.js/许可证可访问；六条 CAD 代理检查通过。
- SQL READ ONLY 确认六人权限与 admin 仍启用，正式项目 0，schema a16c9e74b821；env/key 不变，styles 13 行/比较文档/原临时文件、媒体与数据卷保护。详见 archive/handoff-2026-10-16-management-workbench.md。Safe to hand off: Yes。
