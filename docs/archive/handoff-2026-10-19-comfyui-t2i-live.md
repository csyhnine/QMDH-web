# Handoff archive

### [2026-10-19] ComfyUI 文生图已启用 — 真实链路通过

- 两个模型现可在 /studio/generate 使用：本机 Z Image Turbo（id61）、本机 Qwen Image 2.1（id60），1K/单张；image.edit 尚未开放。正常公网API以现有admin(id1)/既有USR_ADMIN_TEST项目创建任务，经默认Redis/worker实跑，没有mock图/transport或新假项目。受控临时启用，成功后保留开启、会话已注销。
- Z Image task8237/asset9263/1024²/32480ms，Qwen task8238/asset9264/1024²/46526ms；两任务completed，各1 ProviderCall/2 UsageLedger，本机输出/服务器文件/公网下载SHA256一致，已目视检查。GPU锁已释放，真实验收历史保留。
- 本机原启动器会按缓存重新拉起全网卡进程；确认队列空后停止该启动器及旧副本，保留隐藏PID32112，仅127.0.0.1:8188。保留原CUDA/预览/环境，保存.launcher/preference.json args.listen=false；原配置/命令/日志和安全启动脚本在私有frp-20261019/local-control。frpc前台进程保持，未装服务/开机启动；电脑/两进程需保持运行。勿按旧CLIENT-STATUS重启全网卡。
- FRP0.71.0/mTLS/token/STCP与backend/三worker专网保持，frontend不可访问8188。运行代码仍621e2f1/0562244e、backend d66aa5c4/worker827c9321；本轮不改源码/服务器镜像，不重复无变化全站测试。env/key/schema/原styles13行和原未跟踪文件保持。
- 证据服务器 /opt/qmdh-frp/evidence/live-smoke-{zimage,qwen}.json，本机私有windows/server-evidence同名副本与windows/LIVE-ACCEPTANCE.md；最新备份 /www/backup/qmdh-comfy-live-20261019 与本机frp-20261019/live-backup：DB/5802媒体清单/2增量3318213字节，7文件两端SHA256一致，恢复链引用原发布与10-16完整链。程序回退先禁用id60/61，避免旧版未知adapter变模拟结果；不清库/媒体/任务。
- comfyui-frp-001 的隧道/文生图准备及真实验收 DONE；图生图另列后续，服务/长稳重连/未测尺寸不算完成。私有材料/参数与全部边界见docs/comfyui-frp.md；下一步按用户新需求，不自动多跑GPU或装服务。Safe to hand off: Yes。

