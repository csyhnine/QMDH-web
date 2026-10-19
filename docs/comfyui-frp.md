# Windows ComfyUI / QMDH 私有接入

2026-10-19：**两个文生图模型已上线并完成真实网站任务验收**。入口 `/studio/generate`，选择“本机 Z Image Turbo”或“本机 Qwen Image 2.1”，当前按 1K、单张使用。计算在 Windows GPU 上完成，结果保存到 QMDH 服务器及原资产库。图生图、Windows 服务/开机启动、长稳重连不在本次完成范围。

## 当前连接与隔离

| 项目 | 当前值 |
|---|---|
| Windows frpc → 服务器 | `120.79.227.11:7443/TCP`，FRP `0.71.0` |
| TLS serverName | `frp.qmdh.internal`；专用 server CA、client CA，双向证书校验 |
| 代理 | user=`qmdh-windows`，name=`comfyui`，type=`stcp`，allowUsers=`qmdh-backend` |
| Windows ComfyUI | `127.0.0.1:8188`，已收口并实际复测 |
| backend/三 worker → visitor | `http://comfy-visitor:8188`，无 `/v1` |
| 专网 listener | `172.30.218.2:8188`，`qmdh-web_comfy_backend` internal，子网 `172.30.218.0/28` |
| 公网 ComfyUI 映射 | 无 remotePort，无 nginx 入口；8188/7000 不发布 |

FRP 仅公开 7443→容器7000，关闭 dashboard/vhost/UDP。frps 的 proxyBindAddr 为容器 loopback，allowPorts 仅保留不发布的 65535，防误注册普通 TCP 映射。visitor 另接 frp_control 控制网，只在专用网卡监听 8188；frontend/DB/Redis 不接入此网。backend/worker 保留原 default 网络，原 DB/Redis/外部 API 路径保持。服务器 root/Docker 管理员属于信任边界。

已验证：正确凭证登录、错误 token/CA/SAN/缺客户端证书拒绝；公网 mTLS/TLS1.3；frontend 实际不能连接专网8188；backend/三 worker `/system_stats` 与 `/queue` 共8次 GET 200，核验 ComfyUI JSON。Windows frpc 保持前台进程，尚非服务，关闭终端会断隧道。云安全组由用户放行7443，不应开放8188/7000。

## 本机回环收口

原 PID16304 来自绘世启动器 PID30808，带无地址 `--listen`。直接重启 Python 后，启动器又按缓存拉起全网卡副本并回写配置；已核对队列为空后停止该启动器及旧副本，只保留隐藏 ComfyUI PID32112。启动参数为 `--listen 127.0.0.1 --preview-method auto --cuda-malloc`，原环境保留，去掉 auto-launch；实测仅127.0.0.1监听。

`.launcher/preference.json` 的 `args.listen=false` 已保存。原配置/启动命令及当前日志位于受限 `E:/backups/QMDH-web/frp-20261019/local-control`，另有 `START-LOOPBACK.ps1`，该脚本遇8188已监听会拒绝另起进程。此启动器文件是本机环境配置，不入项目 Git。不要按旧 CLIENT-STATUS.md 的全网卡参数重启；未安装服务/开机自启。电脑、ComfyUI 与 frpc 需保持运行。

## 真实生成验收

用户授权继续后，通过公网网站 API 登录现有 admin(id1)，在其已有 USR_ADMIN_TEST 项目创建正式验收任务；走正常 Task API、Redis、worker 与 ComfyUI adapter，没有 mock transport/输出，也没有创建假用户或假项目。为通过正常 API 的 enabled 校验，逐模型受控临时启用，失败会回退禁用；两次验收成功后保留启用并移除待联调名称。临时登录会话已注销。

| 模型 / provider | Task | Asset | 尺寸 | adapter耗时 | 实际文件SHA256 |
|---|---|---|---|---|---|
| Z Image Turbo / comfyui-z-image（id61） | 8237 | 9263 | 1024×1024 | 32480ms | 53fb82f2eddf20a94f59f35730a36a7321b4825559c520b44b619e2580a386ab |
| Qwen Image 2.1 / comfyui-qwen-t2i（id60） | 8238 | 9264 | 1024×1024 | 46526ms | ea505c1342e6ccfd94cd42d7a60e20e92c78815bb67b9c19eca859e3623f275e |

两任务 completed，各有1个 ProviderCall、2个 UsageLedger，task/资产归属保持admin本人。ComfyUI本机输出、服务器存储及公网媒体下载 SHA256 相同，已目视检查实际图片。两次GPU租约正常释放，未重复生成；目前本地GPU价格未配置，记录成本0，不套用云模型价格。验收记录/图片保留，不删除正式历史。

证据：服务器 `/opt/qmdh-frp/evidence/live-smoke-zimage.json`、`live-smoke-qwen.json`，本机私有 `windows/server-evidence` 同名副本；本机 agent 最新交接为 `windows/LIVE-ACCEPTANCE.md`。更早 SERVER-READONLY-STATUS/CLIENT-STATUS 是有时间点的历史快照。

## 工作流与网站适配边界

原 API 图来自 `D:/ComfyUI-aki-v2/integration/qmdh/API-HANDOFF.md`，三个文件哈希吻合；服务端批准模板/map 在 `/opt/qmdh-frp/workflows`，只读挂载到 `/app/integration/comfyui`。图不进 Git，普通用户不能提交任意 graph/模型路径/URL。

- 固定 `comfyui` adapter 与私网URL；模型名从批准工作流中选择，只启用 qwen_image_2_1_t2i / z_image_turbo。
- 每任务深拷贝模板；Qwen 同步两处提示词/种子，关闭增强，替换有效 EmptyLatent 尺寸链接；采样器/步数/CFG固定，batch=1，不接受参考图。结构校验尺寸256..2048、8倍数、≤4MP；真实本轮只验1024×1024，支持的比例按 adapter 显式列表，未验证的4K/多张不开放。
- 提交前持久化 seed/workflow hash/client_id/submitting，收到 prompt_id 后再次保存；GET history 按该ID读取 output节点461/9；GET view拒绝跳转/路径越界/非图片/超限结果；先存服务器，再沿用 Task/Asset/ProviderCall/usage ledger。
- 三worker共享 Redis `qmdh:comfyui:gpu:owner`，忙时明确失败不提交。提交状态未知/断线保留锁，不自动TTL放第二任务；管理员必须按对应 prompt_id/queue/history 核对终态，再按owner compare-and-delete。不能全局interrupt/clear，不盲目重交。人工确认释放后可按原Task checkpoint续查，不宣称worker崩溃自动恢复。
- 队列+执行上限600秒，低于原running15分钟回收；本机手动任务仍可进ComfyUI自己的队列，不承诺GPU独占。图生图API图需要两张图，单图变体/实际输出未验证，因此 image.edit 尚未开放。
- `python -m app.scripts.comfyui_preflight` 只读探活，不提交GPU。provider配置中的 `frp-transport-authenticated` 仅兼容非空API Key字段的非秘密标记；真实FRP token不进provider配置。

## 私有认证材料

- Windows受限目录 `E:/backups/QMDH-web/frp-20261019/windows`：windows.toml、auth-token、server-ca.crt、windows.crt、manifest.json、SERVER-HANDOFF.md；当前frpc运行配置 `C:/ProgramData/QMDH-FRP/windows.toml` 是交付副本。
- Windows私钥 `C:/ProgramData/QMDH-FRP/windows.key` 仅Admin/SYSTEM，服务账号未确定，不扩大ACL。服务器材料 `/opt/qmdh-frp/server` 与 visitor，root:65532目录750/文件640，只读挂到UID65532容器。
- 离线CA私钥仅本机受限 `E:/backups/QMDH-web/frp-20261019/ca`，未给运行容器/本机agent；不复用网站证书或QMDH_ENCRYPTION_KEY。token与STCP secret为不同32随机字节值，不贴聊天/Git/公开URL。
- server CA证书DER SHA256：c6430f148245ae94777383504b44f9e20744d6550cca30ce242e9bfea656a69f。windows证书DER SHA256：8b2f0b3403f6ffcd00c096a7206babd73506b44fc98fb1fa35555bed296f84d3；北京时间2027-01-17 10:47:39到期。DER指纹不是PEM文件Get-FileHash。
- `ops/frp/sign-client.py` 核验RSA≥2048/EC≥256的CSR签名，只签clientAuth证书，拒绝覆盖。CSR SPKI SHA256：531b51ec9a51353b9077b683f87a2ef98fbf35453539853bf8343a5007d22428。不导出/传输本机私钥。
- 秘密走受限目录/已核验SSH主机指纹的SFTP；CA指纹独立核对。泄漏时轮换token/STCP secret及受影响叶密钥，不能假定FRP支持单证书吊销，必要时换client CA并重签。

## 部署、备份与回退

功能621e2f1，运行合并0562244e；backend镜像d66aa5c4806ca2448b82968eaec57c7e311a860950a230708e4ae2a564aca4b9，worker镜像827c9321e3ebbe8537bce9a729c73748c93643cfc6f5a5095a043bd97b2eecb6。依原运行镜像仅替换六个合并后文件，保留ODA/FFmpeg/Nano Banana生产差异。frontend/DB/cache/search容器保持，env/key/schema a16c9e74b821不变。回环收口/真实验收没有改服务器运行代码。

后续重建必须合并 `docker compose -f docker-compose.yml -f /opt/qmdh-frp/compose.frp.yml ...`（Git模板ops/frp/compose.frp.yml），保留专网和工作流只读挂载。FRP固定0.71.0，官方Linux包SHA256为84f27e39f11169f7adcef8e8b70c9329de17747b1f14dad9fb95eef5682ea716；scratch镜像qmdh-frp:0.71.0，build context用.dockerignore排除秘密，frps/frpc verify通过。

发布备份 `/www/backup/qmdh-release-20261019-comfyui-prep` 与本机受限frp-20261019/release-backup：DB/env/运行快照、5800媒体清单、1增量13875126字节，12份文件两端SHA256一致。最新真实任务备份 `/www/backup/qmdh-comfy-live-20261019` 与本机frp-20261019/live-backup：DB、5802媒体清单、2增量3318213字节，7份文件两端SHA256一致；恢复链引用前一发布备份及10-16完整链，不把增量当完整媒体。

程序回退前先确认无运行任务并禁用id60/61（避免旧版不认识comfyui时降为模拟adapter），再用 qmdh-release-backup-backend:20261019-comfyui / qmdh-release-backup-worker:20261019-comfyui 恢复旧镜像；不downgrade删表、不down-v、不删媒体/真实验收历史。

验证：本地232 passed/1 skipped/24 subtests，生产隔离容器14项，功能CI39191698825前后端success；公网health及六CAD路由通过。此次验收无源码变化，不重复全站回归；上述两张真实图证明正常生成链路，不代替Windows服务/长稳重连、图生图或全部尺寸/并发故障验收。2.0继续沿用账号归属Task/工件及prompt/workflow版本追踪，无新编排模型。

原10-16至只读接通阶段的完整方案已归档 [comfyui-frp-before-live-20261019.md](archive/comfyui-frp-before-live-20261019.md)。
