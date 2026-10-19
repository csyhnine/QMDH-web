# Windows ComfyUI / QMDH 私有接入交接

状态：2026-10-19，FRP 服务端与网站文生图适配器已部署，证书已签发，公网 mTLS 已验证；两个 provider 保持禁用，等待本机 agent 联调与真实 API 生成验收。先文生图、后图生图；本机 agent 负责 Windows frpc/ComfyUI，本会话负责服务器与网站。

## 2026-10-19 当前准备与联调交接（优先于下方 10-16 方案）

- **10:57 北京时间更新：完整通路只读验收通过。** 已读取本机 CLIENT-STATUS.md；backend/三个 worker 分别 GET /system_stats 与 /queue 共 8 次 HTTP 200，核验 system/devices/queue JSON 结构，四份队列快照 running=0/pending=0。证据 /opt/qmdh-frp/evidence/server-readonly-20261019.json，私有本机 windows/server-evidence 同名副本及 SERVER-READONLY-STATUS.md。Windows frpc 以前台进程运行；ComfyUI 仍全网卡监听、未收口回环。本轮无 GPU/上传/重启，两个 provider 保持禁用；真实生成、输出下载和网站资产验收仍未完成。以下早前 reachable=false 是接通前快照。

- 已读取本机 D:/ComfyUI-aki-v2/integration/qmdh/API-HANDOFF.md 与 workflow-map.json，三个 API 文件 SHA256 全部吻合，原图保存在私有运行目录，无图进 Git。当前仅文生图开放代码路径：Qwen Image 2.1 与 Z Image Turbo；Qwen 编辑图需要双图且尚无 API 真实输出验证，未启用 image.edit，不用示例图片填空。
- FRP 0.71.0 官方 Linux 包哈希验证完成，scratch 镜像 qmdh-frp:0.71.0 已构建；frps/frpc verify 均通过。服务器 120.79.227.11:7443/TCP 已监听，服务器 visitor mTLS 登录成功。无 STCP remotePort；容器 7000 只发布为公网 FRP 7443，ComfyUI 8188 无宿主发布。误注册 TCP 的 allowPorts 仅容器 loopback 65535，且不发布。
- backend 和三个 worker 已用 docker network connect 加入 qmdh-web_comfy_backend（internal、172.30.218.0/28），原容器 ID/启动时间未改变，四者 TCP 访问 visitor 8188 均成功；frontend 实际 nc 测试连接专网入口失败。专网 listener 不等于本机 ComfyUI 已连接，当前不宣称 /system_stats 或生图已成功。
- mTLS 正向登录以及错误 token、错误 SAN、错误 CA、无客户端证书四项拒绝已验证。Windows 本机首次到公网 7443 超时，用户补充云安全组后复测已完成 TLS 1.3/mTLS 校验。已收到本机 C:/ProgramData/QMDH-FRP/windows.csr，签名核验后签发 windows.crt。云安全组由用户处理，服务端不公开 8188/7000。
- 专用 CA/叶证书/随机 token/STCP 密钥已生成，离线 CA 私钥只在受限 E:/backups/QMDH-web/frp-20261019/ca。服务器 runtime 在 /opt/qmdh-frp/server 和 visitor；容器 UID 65532 只读自身材料，无 CA 私钥。Windows 材料在 E:/backups/QMDH-web/frp-20261019/windows：server-ca.crt、auth-token、windows.toml、manifest.json。windows.crt 已签发（2027-01-17 10:47:39 北京时间到期）；windows.key 由本机 agent 在 C:/ProgramData/QMDH-FRP 生成并保管。该目录 ACL 仅 Admin/SYSTEM 继承。客户端 config 使用上述材料绝对路径，私钥指向 C:/ProgramData/QMDH-FRP/windows.key。
- server CA 证书 DER SHA256 指纹：c6430f148245ae94777383504b44f9e20744d6550cca30ce242e9bfea656a69f。本次已用 ops/frp/sign-client.py（--ca-dir 指向离线 ca、--csr 指向本机请求、--output 指向 windows/windows.crt）签发 clientAuth 证书；CSR SPKI SHA256 为 531b51ec9a51353b9077b683f87a2ef98fbf35453539853bf8343a5007d22428，证书 SHA256 为 8b2f0b3403f6ffcd00c096a7206babd73506b44fc98fb1fa35555bed296f84d3；拒绝覆盖已有证书，不读取/传输本机私钥。
- 网站适配器已发布：功能 621e2f1，生产合并 0562244e；backend 镜像 d66aa5c4806ca2448b82968eaec57c7e311a860950a230708e4ae2a564aca4b9，worker 镜像 827c9321e3ebbe8537bce9a729c73748c93643cfc6f5a5095a043bd97b2eecb6。依托原运行镜像仅复制合并后的六个代码文件，保留 ODA/FFmpeg/Nano Banana 生产差异。发布前 pending/running=0；重建 backend/三 worker，frontend/postgres/redis/meilisearch ID 与启动时间保持，env/schema 不变。get_provider_adapter 识别独立 comfyui 适配器，固定 private URL 与管理员模板目录，不接收浏览器任意图/模型/URL。Qwen 同步两处 prompt/seed、关闭增强，替换真正 EmptyLatent 输入；采样器/steps/CFG 固定、batch=1。支持明确 width/height（256..2048、8 的倍数、≤4MP）和已列比例对应尺寸，拒绝未验证的大分辨率预设。实际尺寸兼容性仍需本机 API 实跑。
- 每个真实 Task 提交前将 seed/workflow hash/client_id/submitting 写入数据库；收到 prompt_id 后再次持久化，再按唯一 history 取 output 节点 461/9 的图片，拒绝跳转/路径越界/非图片与超限结果，写入原 media_storage 并沿用 Asset/ProviderCall/usage ledger。超时上限 600 秒，低于既有 running 15 分钟回收阈值，不改全站超时规则。
- 三 worker 共享 Redis qmdh:comfyui:gpu:owner；忙时明确失败且不提交。提交状态未知或离线中断时保留锁，禁止自动 TTL 到期让第二任务挤入；需管理员用对应 prompt_id 和本机 queue/history 核对终态，再 compare-and-delete 释放同一 owner。不能全局 interrupt/clear，也不盲目重交。已知 prompt_id 在人工核对释放后可从原 Task checkpoint 续查，不宣称 worker 崩溃能自动恢复。正常终态释放锁，下载路径含 Task/prompt UUID，重复取回不会重新生成。
- 两个 provider 已以禁用状态登记并留审计：id=60 comfyui-qwen-t2i、id=61 comfyui-z-image；模板在 ops/frp/provider-profiles.example.json；api_key=frp-transport-authenticated 是兼容现有非空 API Key 字段的非秘密标记，不是 FRP token。FRP 秘密不得填入网站 provider 字段。未真实验收前不启用模型、不创建假项目/用户/任务、不套用云模型价格。
- 已在 backend/三个 worker 执行只读探活：模板哈希均通过，ComfyUI 尚未连接（reachable=false），没有提交 prompt。待本机启动 frpc 后复测：docker compose exec -T backend python -m app.scripts.comfyui_preflight；每个 worker 同样运行。只检 /system_stats 与工作流哈希，不提交 GPU。网络联通后再由本机 agent 给出两个文生图 API history/实际图片；图片编辑后续单独完成。
- 准备发布恢复链：/www/backup/qmdh-release-20261019-comfyui-prep 与受限本机 E:/backups/QMDH-web/frp-20261019/release-backup。DB dump、env、运行镜像与 5800 媒体清单已保存；1 个媒体增量 13875126 字节，完整读取/哈希校验，restore-media-chain.json 引用 10-16 完整链；不把本轮增量当完整媒体备份。
- 持久部署须始终合并主 compose 与 /opt/qmdh-frp/compose.frp.yml（或 Git ops/frp/compose.frp.yml）；手动 network connect 是本轮无中断接网方式，后续只用主文件重建会丢专网/模板挂载。适配器发布时需挂 workflows:/app/integration/comfyui:ro，并保护现有 ODA/Nano Banana 差异。

- 本轮验证：本地关键集 + provider 回归 232 passed/1 skipped/24 subtests；生产隔离、无网络容器 14 项 unittest 通过；CI 39191698825 前后端成功；健康与六条 CAD 路由通过。数据库 schema a16c9e74b821、env 保持；两端 12 份发布备份文件 SHA256 一致。当前无真实 prompt、GPU 消耗或生成验收。

## 当前对接值

| 项目 | 约定 |
|---|---|
| Windows serverAddr | `120.79.227.11`（现有服务器 SSH 地址；首次联调再核对） |
| 公网 FRP 端口 | `7443/TCP`，已监听并通过公网 TLS1.3/mTLS 校验；不是 HTTPS 网站路径 |
| FRP 版本 | 双方固定 `0.71.0`，已查官方 tag；不是“自动使用最新版本” |
| TLS serverName | `frp.qmdh.internal`，server 证书 SAN 必须包含此 DNS 名；连接仍用上方 IP，无需为此名字配置公共 DNS |
| Windows user / proxy | `qmdh-windows` / `comfyui`，类型 `stcp` |
| visitor user | `qmdh-backend`；Windows allowUsers 仅此值；用户名不是独立密码 |
| Windows ComfyUI | `127.0.0.1:8188`，仅本机绑定，不开 Windows 入站端口 |
| 网站服务端 base URL | `http://comfy-visitor:8188`，无 `/v1`；backend 与所有 worker 使用 |
| 内部 visitor 监听 | `172.30.218.2:8188`；绑定专用网卡，不绑定控制网络网卡 |
| 公网 ComfyUI 端口 | 无，STCP 不设置 remotePort；不配置 nginx 转发或前端直连 |

10-16 初始只读记录（历史）：生产 Compose v5.1.3；当时未发现 frps 命令；当时 7443/7000/8188 没有 TCP 监听；宿主路由与现有 Docker 网段未与拟用 `172.30.218.0/28` 重叠。云安全组、上游策略未检查，以上不代表公网已可用。部署当天重新检查全部 Docker IPAM、路由和端口。

## 网络与隔离

Windows frpc → 公网 7443 → 容器 frps:7000；服务器 visitor frpc → 私有 frp_control → frps。visitor 在第二张网卡 comfy_backend 上提供 8188，仅 backend、worker 加入该 internal 网络。frontend、数据库、Redis 和其他服务不加入。backend/worker 同时保留原 default 网络，原有 DB/Redis/外部 API 出站路径保持。

`ops/frp/compose.frp.yml` 是主 compose 的显式 overlay，不能独立替代主文件。内部 DNS 返回 visitor 的接口地址；listener 仅绑定 comfy_backend 静态地址。backend 的 localhost 是自己的容器，不能填 `127.0.0.1:8188`；也不通过 host.docker.internal 或宿主公网端口绕行。

FRP 唯一 host publish 为 7443:7000；proxyBindAddr 强制 frps 容器 loopback，纵使误注册 TCP 代理也不向宿主发布。禁 host network、privileged、Docker socket、dashboard、HTTP/HTTPS vhost、KCP/QUIC/UDP。信任边界包括服务器 root/Docker 管理员；容器网络不能隔离这些管理员。

安全组只放 7443/TCP，优先来源为 Windows 当前公网出口 /32；动态出口变化先更新来源规则，不关闭认证。Docker published port 可能绕过普通 UFW INPUT，需核对云安全组和 Docker 转发防火墙，不能仅凭 UFW 输出宣称隔离成功。8188/7000 不开放公网，不新增网站路径。

## 证书与秘密交接

使用专用 server CA 与 client CA（不复用网站证书私钥），服务端强制 mTLS；双方 frpc 均配置 server CA + serverName 核验服务端，frps 用 client CA 核验客户端。Windows 与 visitor 使用不同 clientAuth 叶证书。另用独立 32 随机字节 token 和另一份 32 随机字节 STCP secret（64 位 hex）；不得复用 SSH、网站管理员密码或 QMDH_ENCRYPTION_KEY。

签发步骤由服务器侧后续执行：

1. 专用 CA 在离线/受保护位置创建，CA 私钥不得挂进运行容器或交给客户端。server 叶证书：SAN DNS:frp.qmdh.internal、EKU serverAuth；visitor/windows 叶证书：不同 CN、EKU clientAuth；叶证书 basicConstraints CA:FALSE、有效期建议 90 天，CA 建议一年。核对系统时间与提前续期。
2. 本机 agent 在 `C:\ProgramData\QMDH-FRP` 创建 windows.key 与 windows.csr，私钥仅该运行账号/Admin/SYSTEM 可读。只将 CSR 送入受限交接目录；服务器校验 CSR 签名、用途后签发，返回 windows.crt。visitor/server 的私钥留服务器，各自运行目录分开。
3. 服务器运行目录 `/opt/qmdh-frp/{server,visitor}`，分别仅包含所需配置与叶证书/CA 公钥/token；目录 root:65532 0750、文件 root:65532 0640，使镜像 UID 65532 可读。visitor.toml 内含 STCP secret，同样按秘密管理。不挂载整个备份目录。
4. 推荐交接目录 `E:\backups\QMDH-web\comfyui-frp-handoff\windows`，ACL 关闭继承，仅 Admin/SYSTEM 和实际 frpc 服务账号。使用现有已核验主机指纹的 SSH/SFTP 下载最小包：server-ca.crt、windows.crt、auth-token、已填 STCP secret 的 windows.toml、材料 manifest。本机 windows.key 不进入下载包。CSR 先置该目录，再经同一 SSH 通道上传签发。若换一台机器，用收件人公钥加密包，解密密钥走另一路。
5. 聊天/Git 只交接路径、证书 SHA256 指纹、serial、notAfter、CSR 公钥指纹和配置版本，不贴 token、STCP secret、私钥、完整已填配置；秘密本身不写入 manifest。CA 指纹用独立已信任渠道核对，不能只信随包 manifest。目录不位于网站根目录，不经附件/公开 URL 传输。服务端材料保存在受限备份链中。
6. auth-token 文件使用无换行 ASCII hex，双方 tokenSource 从文件读取；STCP secret 只填受限运行副本。模板中的 REPLACE 字符串不得用于运行。任一秘密泄漏，轮换 token 与 STCP secret；证书泄漏另换叶密钥。FRP 不能被假定支持单张客户端证书吊销，紧急吊销需要更换受信 client CA、重新签发未受影响客户端并重启隧道。

10-16 准备阶段尚无生产材料；10-19 已签发并放入上方受限路径。可给本机 agent 此文和私有 windows/SERVER-HANDOFF.md 的文件路径，秘密内容不贴聊天。

## 配置与部署准备

模板：`ops/frp/frps.toml.example`、`visitor.toml.example`、`windows.toml.example`、`Dockerfile`、`compose.frp.yml`。运行副本与任何 `.key`、秘密均只放 Git 外目录。

官方 Linux amd64 归档 `frp_0.71.0_linux_amd64.tar.gz` SHA256：`84f27e39f11169f7adcef8e8b70c9329de17747b1f14dad9fb95eef5682ea716`。先对下载包核验，再将 frps/frpc 提取到 `/opt/qmdh-frp/bin/`，复制本目录 Dockerfile 到 `/opt/qmdh-frp/Dockerfile`，用 scratch 构建本地 `qmdh-frp:0.71.0`。Windows agent 从同一官方 release 获取自己的架构包，独立核验该资产的官方 SHA256，不能使用 Linux 哈希。

准备生产目录后，用相同版本二进制分别 `frps verify -c ...` / `frpc verify -c ...`。证书链、SAN/EKU、文件权限另外核验，verify 不等于 TLS 联通。先构建 frps 镜像（visitor 复用），再显式合并主文件与 overlay，用 `docker compose -f docker-compose.yml -f ops/frp/compose.frp.yml config --quiet` 验证，不将完整展开配置打印进日志（其中可能带原 .env）。

实际发布须先保全原数据库/config/媒体恢复链和镜像。先独立启动 frps/visitor 并核验 TLS；backend/worker 加网需要容器重建，排空/协调运行任务，不能直接中断现有生成。网络变更不要求重建 backend 镜像；以后发布适配器时保留 ODA 私有 build args/包及 Nano Banana 生产差异。无数据库迁移，不动旧 key、18010、CAD 或管理台账。回退移除 overlay 对 backend/worker 的网络接入并停用这两个 FRP 服务，保留材料、业务记录和媒体，不 down -v。

## 工作流接口约定 v1（待双方实测签收）

10-16 的代码当时尚无 ComfyUI 策略；10-19 已按上方现状新增独立 `comfyui` adapter 与能力 `image.generate`，第二阶段 `image.edit`；不开任意 URL 代理，不伪装 OpenAI compatible。provider 先禁用，工作流确认和联调通过后再给正式模型入口。

本机 agent 提供以下文件到受限交接目录 `workflow/`，不含人名、真实业务图或秘密：

- `txt2img.api.json`：API 格式 node-id → class_type/inputs，不能仅交 UI 的 nodes/links 格式；不预设任何 node ID。
- `workflow-manifest.json`：workflow_id/version/SHA256；ComfyUI commit、Python/Torch/CUDA、显卡/显存、自定义节点仓库与 commit；checkpoint/VAE/LoRA 名称及哈希；支持尺寸范围/步长、batch 上限、seed 范围、steps/CFG/sampler/scheduler 的允许值、平均/最长耗时。
- `bindings.json`：业务字段到 node_id/input/type/range 的显式映射。文生图至少 positive_prompt、negative_prompt（可选但明确）、width、height、seed、steps、CFG、sampler、scheduler、batch_size、filename_prefix；明确哪些参数固定。图生图另加 LoadImage 输入与 denoise。只有白名单字段可被网站替换，模型/自定义节点不能由普通用户任意指定。
- `history-success.json`、`history-error.json`（可用脱敏/合成失败样例并注明）、成功实际图片、输出节点 ID 白名单、输出结构和 MIME。首轮固定 batch=1/单 GPU 并发=1；网站三 worker 共用一个全局 Redis 配额，不是每个 worker 各允许一个。若本地同时手动使用 GPU，需明确共享队列/优先级和等待上限。

请求与取回：

1. QMDH 创建现有账号所有的 Task，保存 workflow 版本/hash、已解析参数及实际 seed；worker 读取服务端批准模板，深拷贝后按绑定改值。客户端不传任意 graph、模型文件路径或 base URL。
2. 提交 `POST /prompt`，JSON 为 `{"prompt": <API graph>, "client_id": <task-specific UUID>}`。记录返回 prompt_id 并与 QMDH task_id/user_id 对应，检查 HTTP 和 node_errors；成功入队不表示生成成功。先不依赖新版本才有的客户端指定 prompt_id。
3. 每 2 秒轮询 `GET /history/{prompt_id}`，请求连接超时初拟 5 秒/读取 30 秒、总队列+执行预算初拟 20 分钟，拿到真实性能后调整。history 空对象表示尚无终态，不能算成功或失败；检查 status.completed/status_str、execution_error/interrupted 和白名单输出。WebSocket `/ws?clientId=...` 可补进度，但断线后仍以 history 恢复，不靠 WS 二进制预览当最终产物。
4. 首轮仅从已确认输出节点的 `outputs[node_id].images[]` 取 filename/subfolder/type；type 必须 output，用固定 base URL 的 `GET /view` 查询参数编码下载，拒绝绝对路径、..、任意外链和跳转。限制图片数/字节数/像素并解码确认。以后视频输出结构另立契约。
5. 图片由现有 media_storage 写入 QMDH 管理存储，按 Task 归属落 Asset，再沿用 ProviderCall/usage ledger。原始图必须落服务器后才完成任务，网站前端只读现有媒体 URL，不知道隧道地址或 Windows 路径。保留 prompt_id、workflow hash、输出引用与下载状态，避免 worker 重启后重复生成/重复扣账；价格未核定不套用云模型计费。
6. POST /prompt 响应丢失属于提交状态未知，禁止盲目重试；能通过已记录关联/queue/history 确认才续接，不能确认就明确待核查。Windows 离线、OOM、缺节点、超时、断网分别报告。超时不承诺已停止本机任务；不调用全局 interrupt/clear 误杀本机手动任务。取消按该 prompt_id 协商支持版本，第一期无精确取消时保留限制。
7. 图生图阶段：worker 从当前账号可访问的参考图读字节，multipart `POST /upload/image`，image 文件名使用 QMDH 唯一 task 前缀、type=input、overwrite=false。使用返回的 name/subfolder 构造 LoadImage 值，再提交；不向 Windows 传服务器本地路径，也不让 Windows 拉取公开参考图 URL。不自动删除本机历史。

## 10-16 原准备验证记录（不覆盖上方 10-19 进展）

- 本地 Python 3.12 tomllib：三份 TOML 模板全部解析通过。
- 生产临时目录内合并现有主 Compose 与本 overlay，`docker compose ... config --quiet` 通过，未启动服务。
- 服务器下载官方 Linux 包超过约 150 秒仍未完成，已仅中止本轮临时下载，临时目录随上下文清理；尚未完成包哈希、frps/frpc verify、镜像构建、TLS 与业务联通验证。不得据此标记可部署。
- `git diff --check` 通过；没有改运行时代码，本轮不重复执行全站回归。

## 联调验收与后续任务

上线前必须留下证据：错误 token/错误 CA/错误 SAN/无客户端证书均拒绝；Windows→frps mTLS 成功；STCP 错误 secret 拒绝；backend 和三个 worker 内分别 GET /system_stats 成功；frontend 容器无法访问专用 8188；公网探测 8188/7000 不通且无新增 nginx 路径；frpc 断开后网站明确不可用、重连可恢复。只 GET 探活不等于真实生成通过。

之后用双方同意的合成提示词进行 1 次文生图（消耗本机 GPU，正式启用前安排），核对 prompt_id→history→图片 SHA256→QMDH 归属持久化；再验证 worker 重启/提交不确定性/超时/并发锁/部分下载失败，最后接图生图。不能因隧道连通就标网站接入完成。

10-16 阶段仅准备模板；10-19 已部署文生图 adapter，网络、文生图真实运行、图生图仍分别验收。2.0 兼容：沿用 Task/ProviderCall/Asset 与账号所有权，工作流版本和 prompt_id 提供追溯/恢复依据；不引入任意工作流执行器或新的管理权限。

官方依据：[FRP v0.71.0 发布](https://github.com/fatedier/frp/releases/tag/v0.71.0)、[FRP TLS](https://gofrp.org/en/docs/features/common/network/network-tls/)、[visitor 配置](https://gofrp.org/en/docs/reference/visitor/)、[版本固定服务端示例](https://github.com/fatedier/frp/blob/v0.71.0/conf/frps_full_example.toml)、[客户端示例](https://github.com/fatedier/frp/blob/v0.71.0/conf/frpc_full_example.toml)、[ComfyUI API 示例](https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/websockets_api_example.py)、[ComfyUI server 路由](https://github.com/Comfy-Org/ComfyUI/blob/master/server.py)。ComfyUI master 仅作接口依据，最终以本机实际 commit/样例核验。
