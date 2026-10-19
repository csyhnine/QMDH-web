# ComfyUI 真生图前交接原文

### [2026-10-19] FRP 服务端与 ComfyUI 文生图准备 — 待本机联调

- 10:57 最新只读验收：本机前台 frpc 注册后，backend/三 worker 的 /system_stats 和 /queue 共 8 个 GET 均 200 且 ComfyUI JSON 结构正确，队列均 0/0，provider id60/61 仍禁用。服务器证据 /opt/qmdh-frp/evidence/server-readonly-20261019.json，本机私有 windows/SERVER-READONLY-STATUS.md。完整只读通路已通过；本机 8188 仍全网卡监听，回环收口、服务/长稳、真实 GPU 及网站资产验收未完成。本轮不上传/不 POST prompt/不重启；下方未连通描述为此前快照。

- 分支 codex/comfyui-frp-plan；本机 API-HANDOFF/workflow-map/三个 API 图哈希吻合，未改本机原工作流、ComfyUI 启动参数或私钥。两个文生图适配器及固定节点参数映射/模板校验/Task checkpoint/全局 Redis GPU 锁/结果持久化/只读探活已实现，编辑图不启用；已发布功能 621e2f1/生产合并 0562244e，backend d66aa5c4、worker 827c9321；基于各自原镜像只替换合并后的代码，保留 ODA/FFmpeg/Nano Banana，发布前 pending/running=0。
- FRP 0.71.0 包 SHA256、frps/frpc verify、scratch 镜像通过；生产 frps/visitor 已运行，120.79.227.11:7443/TCP；STCP 无 remotePort，8188 仅 qmdh-web_comfy_backend internal 网络，backend/三 worker 加网不重启；frontend nc 被阻断。mTLS 正向及错误 token/SAN/CA/无客户端证书拒绝均通过。
- Windows CSR C:/ProgramData/QMDH-FRP/windows.csr 已签发；材料与 SERVER-HANDOFF.md 在私有 E:/backups/QMDH-web/frp-20261019/windows，离线 CA 在同级 ca，服务端材料 /opt/qmdh-frp/server、visitor。CA 私钥未传服务器/本机 agent，Windows 私钥未导出/传输。证书与指纹/有效期见 manifest.json，无秘密进 Git/聊天。
- 用户补充云安全组后，本机公网 7443 使用签发证书完成 TLS1.3/mTLS 校验，不公开 8188/7000。当前并未完成 Windows 隧道 /system_stats、真实生图/产物下载/网站端到端验收。网站 provider id60/61 已登记、保持禁用并留审计，不填假任务或提前展示可用。
- 本地完整关键集加 provider 回归 232 passed/1 skipped/24 subtests；生产隔离容器 14 项通过，CI 39191698825 前后端 success；已重建 backend/三 worker，frontend/DB/cache/search 不变，env/schema 不变，健康/六 CAD 路由通过；原 styles +13 行/比较文档/_tmp_* 保持。恢复链 /www/backup/qmdh-release-20261019-comfyui-prep 与本机私有 frp-20261019/release-backup：DB/env、运行快照、5800 媒体清单、1 增量 13875126 字节核验，引用 10-16 完整链。不得 down -v 或替换 ODA/Nano Banana 生产差异。
- 下一步本机 agent 阅读私有 SERVER-HANDOFF.md，验证证书匹配后配置 frpc/回环监听；公网 FRP 已可达，先接客户端并只读联通，再提供两个文生图真实 API history 与图片。服务端探活命令 python -m app.scripts.comfyui_preflight，不能把 visitor TCP 连通当 ComfyUI 已连通。Safe to hand off: Yes（准备可接手，业务尚待验收）。

