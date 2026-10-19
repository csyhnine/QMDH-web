# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-19] ComfyUI 图片渠道显示修复 — 已发布

- 用户反馈图片模型显示视频；数据库/API能力image.generate正确。漏掉前端comfyui登记，后台getAdapterOption把未知类型落到首项Haodeya视频；Studio图片白名单也缺ComfyUI，原API真实生成验收没有覆盖前端入口。这是本轮修复范围。
- 新分支codex/comfyui-image-channel-fix：登记ComfyUI本机图片；未知adapter保留原标识/规划中；支持文生图列表且本机ComfyUI独立来源分组，保留能力检查，视频/未开放编辑不显示。Haodeya/Grok名称只有同时具备video.generate才可分到视频组，避免图片渠道因名称被误标。真实ModelsPage组件与Studio derived菜单回归已加入，原styles13行不提交。46项前端回归通过、23既有TS错误/0新增、构建通过；01d6c11/13bbe74已发布，生产合并ae2901af，仅frontend镜像623a1841；backend/worker/FRP/DB/cache/search ID/启动时间与env保持，未重跑GPU。公网ModelsPage-CTuUDlVF.js及studioTaskSubmissionActions-DBF-XrvR.js与容器SHA一致，入口index-Ll-Dz75_.js，health/六CAD路由通过。

- 发布备份 /www/backup/qmdh-release-20261019-comfyui-provider-ui 与本机 E:/backups/QMDH-web/release-20261019-comfyui-provider-ui：DB/env/5802媒体清单、0媒体增量及完整恢复链引用、运行快照/公网证据，13文件SHA一致；旧frontend镜像qmdh-release-backup-frontend:20261019-comfyui-provider-ui可回退。原styles13行、比较文档与_tmp_*保留。Safe to hand off: Yes。

### [2026-10-19] ComfyUI 文生图已启用 — 真实链路通过

- 两个模型现可在 /studio/generate 使用：本机 Z Image Turbo（id61）、本机 Qwen Image 2.1（id60），1K/单张；image.edit 尚未开放。正常公网API以现有admin(id1)/既有USR_ADMIN_TEST项目创建任务，经默认Redis/worker实跑，没有mock图/transport或新假项目。受控临时启用，成功后保留开启、会话已注销。
- Z Image task8237/asset9263/1024²/32480ms，Qwen task8238/asset9264/1024²/46526ms；两任务completed，各1 ProviderCall/2 UsageLedger，本机输出/服务器文件/公网下载SHA256一致，已目视检查。GPU锁已释放，真实验收历史保留。
- 本机原启动器会按缓存重新拉起全网卡进程；确认队列空后停止该启动器及旧副本，保留隐藏PID32112，仅127.0.0.1:8188。保留原CUDA/预览/环境，保存.launcher/preference.json args.listen=false；原配置/命令/日志和安全启动脚本在私有frp-20261019/local-control。frpc前台进程保持，未装服务/开机启动；电脑/两进程需保持运行。勿按旧CLIENT-STATUS重启全网卡。
- FRP0.71.0/mTLS/token/STCP与backend/三worker专网保持，frontend不可访问8188。运行代码仍621e2f1/0562244e、backend d66aa5c4/worker827c9321；本轮不改源码/服务器镜像，不重复无变化全站测试。env/key/schema/原styles13行和原未跟踪文件保持。
- 证据服务器 /opt/qmdh-frp/evidence/live-smoke-{zimage,qwen}.json，本机私有windows/server-evidence同名副本与windows/LIVE-ACCEPTANCE.md；最新备份 /www/backup/qmdh-comfy-live-20261019 与本机frp-20261019/live-backup：DB/5802媒体清单/2增量3318213字节，7文件两端SHA256一致，恢复链引用原发布与10-16完整链。程序回退先禁用id60/61，避免旧版未知adapter变模拟结果；不清库/媒体/任务。
- comfyui-frp-001 的隧道/文生图准备及真实验收 DONE；图生图另列后续，服务/长稳重连/未测尺寸不算完成。私有材料/参数与全部边界见docs/comfyui-frp.md；下一步按用户新需求，不自动多跑GPU或装服务。Safe to hand off: Yes。

### [2026-10-16] ComfyUI FRP 接入准备 — 未部署

- 新分支 codex/comfyui-frp-plan，起点 0fc630f；原 styles.css 与所有未跟踪文件保持。此前管理模块只读复核：生产 d7f14138、前端镜像仍 85b3652e、schema a16c9e74b821、六人授权启用、项目 0/名册 5；浏览器验收因控制工具无法识别 URL 停止，没有真实点击通过结论。
- 用户本轮改为准备自建 FRP 连接 Windows ComfyUI；已确认先文生图、后图生图。本机另一 agent 负责 frpc/工作流；未授权自动给其他 chat 发消息，交接文档由用户转交。
- ops/frp 提供固定 0.71.0 的 frps/visitor/windows 模板、scratch Dockerfile 与显式 Compose overlay。STCP 不发布 ComfyUI，拟用 120.79.227.11:7443/TCP；mTLS、tokenSource 与独立 STCP secret；visitor 只绑定专用 internal 网络接口，backend/worker 保留 default 网络，frontend 不接入。
- 生产只读无 7443/7000/8188 TCP 监听、无 frps 命令，拟用 172.30.218.0/28 未与当前路由重叠；安全组未核验。未开端口/启动服务/构建镜像/写业务数据/签发秘密。现有代码无 ComfyUI adapter，后续不得冒充 OpenAI 接口或声称网站已可生成。
- 验证：三份 TOML 解析通过，生产临时合并 Compose config --quiet 通过（未启动）；官方包下载超过约 150 秒未完成，仅中止本轮下载并清理临时目录，包哈希/二进制 verify/TLS/镜像/真实业务联调仍未完成。
- 详细地址、CSR/最小材料包、受限目录、签发/轮换、工作流白名单参数、prompt/history/view/结果持久化和验收在 docs/comfyui-frp.md。下一步接本机 windows.csr 与工作流包，再签发及安排网络联调；无须重问首批能力。当前无生产 token/证书可领取。Safe to hand off: Yes（方案可接手，功能尚未上线）。
