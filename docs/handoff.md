# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-19] ComfyUI 生产闭环 — WIP，尚未发布

- 用户授权全部解决并发/恢复/可靠队列/参数/幂等/守护/就绪提示与尺寸/双图缺口。分支 codex/comfyui-production-closure，原 styles.css +13 与原未跟踪文件保留。
- 已实现 Task 同事务 outbox、租约/心跳与本机 FIFO、丢响应核对而不盲重交、1～3张逐张checkpoint、提交幂等、真实状态/管理恢复入口、尺寸与双图素材归属。迁移 b27d0f85c932 是追加两表，不修改旧历史。当前只在本地，未部署/未做新真实GPU验收。
- Windows 运行材料复制至受限 C:/ProgramData/QMDH-FRP，私钥未变；用户级隐藏守护 PID31796、HKCU Run 登录启动，health.json 只读本机就绪/证书期限。系统级任务/防火墙被Windows拒绝（当前令牌非管理员），安装脚本已准备，不能声称开机未登录启动通过。
- 下一步：完成回归与生产副本迁移/并发验证，备份后发布，真实连续/多张/尺寸/双图与worker/隧道恢复验收。详见 docs/comfyui-production-closure.md。不得将WIP判完成。


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

