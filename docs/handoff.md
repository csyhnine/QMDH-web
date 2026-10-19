# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-19] FRP 服务端与 ComfyUI 文生图准备 — 待本机联调

- 分支 codex/comfyui-frp-plan；本机 API-HANDOFF/workflow-map/三个 API 图哈希吻合，未改本机原工作流、ComfyUI 启动参数或私钥。两个文生图适配器及固定节点参数映射/模板校验/Task checkpoint/全局 Redis GPU 锁/结果持久化/只读探活已实现，编辑图不启用；已发布功能 621e2f1/生产合并 0562244e，backend d66aa5c4、worker 827c9321；基于各自原镜像只替换合并后的代码，保留 ODA/FFmpeg/Nano Banana，发布前 pending/running=0。
- FRP 0.71.0 包 SHA256、frps/frpc verify、scratch 镜像通过；生产 frps/visitor 已运行，120.79.227.11:7443/TCP；STCP 无 remotePort，8188 仅 qmdh-web_comfy_backend internal 网络，backend/三 worker 加网不重启；frontend nc 被阻断。mTLS 正向及错误 token/SAN/CA/无客户端证书拒绝均通过。
- Windows CSR C:/ProgramData/QMDH-FRP/windows.csr 已签发；材料与 SERVER-HANDOFF.md 在私有 E:/backups/QMDH-web/frp-20261019/windows，离线 CA 在同级 ca，服务端材料 /opt/qmdh-frp/server、visitor。CA 私钥未传服务器/本机 agent，Windows 私钥未导出/传输。证书与指纹/有效期见 manifest.json，无秘密进 Git/聊天。
- 用户补充云安全组后，本机公网 7443 使用签发证书完成 TLS1.3/mTLS 校验，不公开 8188/7000。当前并未完成 Windows 隧道 /system_stats、真实生图/产物下载/网站端到端验收。网站 provider id60/61 已登记、保持禁用并留审计，不填假任务或提前展示可用。
- 本地完整关键集加 provider 回归 232 passed/1 skipped/24 subtests；生产隔离容器 14 项通过，CI 39191698825 前后端 success；已重建 backend/三 worker，frontend/DB/cache/search 不变，env/schema 不变，健康/六 CAD 路由通过；原 styles +13 行/比较文档/_tmp_* 保持。恢复链 /www/backup/qmdh-release-20261019-comfyui-prep 与本机私有 frp-20261019/release-backup：DB/env、运行快照、5800 媒体清单、1 增量 13875126 字节核验，引用 10-16 完整链。不得 down -v 或替换 ODA/Nano Banana 生产差异。
- 下一步本机 agent 阅读私有 SERVER-HANDOFF.md，验证证书匹配后配置 frpc/回环监听；公网 FRP 已可达，先接客户端并只读联通，再提供两个文生图真实 API history 与图片。服务端探活命令 python -m app.scripts.comfyui_preflight，不能把 visitor TCP 连通当 ComfyUI 已连通。Safe to hand off: Yes（准备可接手，业务尚待验收）。

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
