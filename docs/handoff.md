# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-19] ComfyUI 生产闭环 — 已发布、真实验收完成

- 用户授权全部解决本轮审计缺口。功能7a9874b已推main，生产功能合并cb2bc791；迁移b27d0f85c932追加task_dispatches/reference_uploads。backend fc3ac003、worker 1fbaa318、frontend 3c01a252；env/key和FRP/DB/cache/search容器保持，ODA/FFmpeg/Nano Banana保留。
- 同事务DB待办、Redis短超时唤醒、本机FIFO/原子容量/租约心跳/失主隔离；幂等、原prompt/client_id核对、已下载文件SHA恢复、1～3张逐张checkpoint，未知不盲重交。终态错误不无限重试；管理员恢复/安全关闭有权限与审计。页面真实队列/恢复状态替换估算百分比，后端创建前422，三个渠道1K/2K/4K/自定义已开放。
- 九任务十一图：8245三张（9268～9270，worker中断后恢复）；8246/8247文生图2K（9271/9272，后者FRP断线保持原prompt）；8248双图1K（9273）；8249/8250文生图4K（9274/9275）；8253自定义1536×1024（9278）、8254/8255双图2K/4K（9279/9280）。每Task一ProviderCall、资产/下载SHA与上游实际prompt数量准确；旧失败记录未改/重跑。id60/61文生图、id62双图编辑启用，最后4K编辑约483秒。
- 用户已在管理员PowerShell安装SYSTEM开机守护；原用户守护退出，停止原两进程后SYSTEM重拉ComfyUI/frpc、仅127.0.0.1:8188与后端200、实际GPU成功。当前非提权令牌不可读SYSTEM任务/防火墙元数据；未做整机重启或长期压测。运行材料C:/ProgramData/QMDH-FRP，私钥仅Admin/SYSTEM未导出，私有windows/PRODUCTION-CLOSURE.md为最新本机交接，不再照旧前台/备份路径运行。
- 最终CI39215244482（7a9874b）两job成功：后端227+24subtests；前端50/23既有TS/0新增/构建。Linux最终镜像隔离30项；PG副本49旧表计数保留、并发串行/同键唯一/容量10项通过。公网四容器探活、frontend不可达、三渠道/三档/幂等/422、bundle SHA、六CAD+health通过。IAB工具超时，未声称真实浏览器点击验收。
- 发布前 /www/backup/qmdh-release-20261019-comfyui-closure ↔ 本机frp-20261019/closure-backup：5805媒体/3增量3881989字节、DB/env/旧镜像/Git bundle/FRP运行包及验证，25文件SHA配对。发布后 /www/backup/qmdh-comfy-closure-live-20261019 ↔ closure-live-backup：5820媒体/15增量111458315字节、DB/证据，10文件SHA配对，完整读取tar；恢复链引用发布前及之前全链。隔离验证数据库已删除。
- 重建带 /opt/qmdh-frp/compose.frp.yml overlay及3 worker，保留ODA材料；回退先排空/核对上游并禁用60/61/62，再回qmdh-release-backup-{backend,worker,frontend}:20261019-closure，不降schema/清库/删媒体。原styles.css +13与所有原未跟踪文件保持，未混提交。下一步仅按用户新需求。Safe to hand off: Yes。详见docs/comfyui-frp.md。

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

