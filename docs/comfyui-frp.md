# Windows ComfyUI / QMDH 私有接入

2026-10-26双功能已部署：运行源码d96d508已推送，人员跨项目甘特/拖拽分工与Qwen v1.1单/双图自动路由上线。公开输入数[1,2]、隔离PG保存/409与接收/幂等、公网新包通过；backend健康/3worker/frontend运行，生产迁移仍e51，无GPU出图。26文件配对备份SHA一致，25媒体归档链仍需本机两份基础包。当前第三Compose改为/opt/qmdh-frp/releases/people-qwen-20261026/compose.release.yml，工作流绑定同目录/workflows，禁止旧Git重建。详见[发布记录](release-people-qwen-2026-10-26.md)。草稿PR #5未合并，72待验收/25冻结/R98状态保持。

以下为此前阶段记录；原单图展示名、镜像和未提交状态只对应记录当时。

2026-10-19 最新：按用户命令已切换Qwen v1.1。入口 `/studio/generate`；文生图选“本机 Z Image Turbo”或“本机 Qwen Image 2.1 v1.1”，图像编辑选“本机 Qwen Image 2.1 v1.1 单图编辑”（只需1张输入图）。三个渠道启用状态、1K/2K/4K、自定义宽高、1～3张逐张生成参数保持；计算在Windows，结果保存至原资产库。v1.1已部署但未提交GPU验收任务，耗时/显存/输出仍待明确授权验证。

## 连接与隔离

| 项目 | 当前值 |
|---|---|
| Windows → frps | `120.79.227.11:7443/TCP`，FRP **0.71.0** |
| TLS | serverName=`frp.qmdh.internal`，独立server/client CA，TLS1.3/mTLS及证书校验 |
| STCP | user=`qmdh-windows`，proxy=`comfyui`，allowUsers=`qmdh-backend` |
| ComfyUI | Windows **127.0.0.1:8188**，没有公开ComfyUI映射 |
| 服务器 visitor | `172.30.218.2:8188`；backend/三个worker用 **http://comfy-visitor:8188**，无`/v1` |
| Docker | `qmdh-web_comfy_backend` internal网络，172.30.218.0/28；仅backend/worker加入；frontend实际探测不可达 |

frps仅发布7443（容器7000），不开放公网8188/7000、不配Nginx ComfyUI代理。frps禁用管理面板/vhost/UDP，proxyBindAddr回环、allowPorts仅未发布容器回环65535，防误加TCP代理。mTLS/token与独立STCP secret共同约束；普通用户不能改访客URL或提交任意graph。

## 平台参数与工作流

- v1.1种子范围修复已上线（qwen-v11-009）：Qwen的easy seed支持0..1125899906842624（含上界）；随机生成/显式提交/批量递增回绕均按此限制，Z与旧图保持原范围。8264曾因旧随机范围过大在执行前被400拒绝；该记录保留，不自动重跑。当前backendf8822343/worker3cc0ece1，模板与前端不变。

- provider id60 `comfyui-qwen-t2i`、61 `comfyui-z-image` 为image.generate；id62 `comfyui-qwen-edit`仅image.edit。前端显式登记comfyui、独立“本机ComfyUI”分组，未知真实adapter报错，不降成模拟图。
- 批准API图/map在 `/opt/qmdh-frp/workflows`，只读挂载 `/app/integration/comfyui`，按SHA256校验，每任务深复制。当前Qwen合同来自 `D:/ComfyUI-aki-v2/integration/qmdh/QWEN-v1.1-HANDOFF.md`，优先于旧API-HANDOFF；Z保持原合同。Qwen共享easy seed保留下游链接，50步/GPU缓存，增强false。
- Qwen有效尺寸节点`459:456`，Z为`57:13`。支持width/height成对、256～4096、8倍数、最多16MP；档位随比例换算，最长边不超过4096。选择分辨率档位会退出自定义尺寸，不会被旧宽高悄悄覆盖。正方形1K/2K/4K分别为1024/2048/4096。
- 提示词与补充说明、seed（含0）、宽高/比例/档位和张数有效；Qwen同步两处提示词/种子。采样步数、CFG、sampler、scheduler、增强开关等由批准图固定；不假装传入即生效。
- 每项1～3张顺序执行，graph内batch固定1，每张独立prompt_id/seed/checkpoint/路径，断点续取已完成张；部分成功后终态失败保留已有图片。未配置本机GPU单价，当前账面费用为0。
- v1.1编辑只接收一张目标图（LoadImage470），API的reference_input_count=1驱动上传/提示/提交校验；旧双图输入不再适用于当前模板。仅允许当前用户上传或生成的PNG/JPEG/WebP（单张≤32MB/16MP）；未记录归属的历史上传图须重新上传。先POST /upload/image再绑定该节点，不沿用示例图、不接受外部URL或服务器本地路径。
- 编辑按首图比例时按所选档位缩放；指定比例/自定义宽高则切换画布分支。提示词可要求保留布局，但模型效果仍需用户判断。

## 持久队列与恢复

- Task与task_dispatches同事务写入；Redis只负责唤醒和兼容旧投递。worker即使丢失Redis通知仍轮询数据库，Redis连接/读取有短超时；GPU锁不可读时保留待恢复任务，不记成生成失败。
- PostgreSQL事务锁原子领取和容量检查；本机FIFO串行，其他渠道仍可并行。每人最多10项本机未完成任务，总计100项。执行租约90秒、心跳15秒；旧worker失去租约后不能继续保存/提交。
- 用户范围submission_key+参数hash防重复；丢响应重用原键，修改参数返回409。客户端仅留摘要/随机键，不留提示词；已成功的“再次生成”是明确的新请求。
- 提交前持久化seed/workflow SHA/client_id/submitting，收到prompt_id后再保存。断线、worker中断、超时先按原prompt_id查history；丢POST响应按唯一client_id查queue/history，绝不据暂时没找到就重交。Redis GPU owner无盲目TTL；异常由恢复器/管理员核对。
- 每隔约30秒尝试恢复待核对本机任务；已下载到服务器且SHA正确的结果可直接恢复入库，无需ComfyUI仍保留history。执行中/队列中/恢复中都不走旧15/30分钟“终止并重提”逻辑；其他渠道的过期执行不盲重跑。
- 已部署页面显示队列位置、生成、离线/恢复状态，提供无百分比动态条；2026-10-19用户要求统一百分比，studio-progress-001已在本地恢复统一预估条（运行最高95/完成100、恢复暂停），尚未提交/部署，详见archive/handoff-2026-10-19-task-percent.md。尚未接入采样节点实时步数。`GET /providers/comfyui/status`及模型管理显示运行状态；管理员可恢复原任务或在确认队列空、无成功结果时备注关闭，操作留审计，按owner释放锁。普通用户不能执行恢复管理操作，不提供全局interrupt/clear。
- 仅从指定保存节点461/9读取exact prompt_id产物；GET /view拒绝跳转、路径越界、超限/非图片。结果先保存服务器，再沿用Task/Asset/ProviderCall/UsageLedger。恢复不重复记调用/账。

## 旧模板真实验收（不能视为v1.1验收）

九项任务、十一张图片均经正常公网API、既有admin/USR_ADMIN_TEST项目及真实worker/GPU执行；没有新建假用户/项目或模拟上游。每项终态仅一条ProviderCall，资产归属与服务器/公网下载SHA一致；上游实际prompt数量等于期望张数，重启/断线未重复提交。

| 项目 | Task | Asset | 实际尺寸 |
|---|---|---|---|
| Z Image 三张/worker中断恢复 | 8245 | 9268, 9269, 9270 | 1024×1024 / 1024×1024 / 1024×1024 |
| Z Image 2K | 8246 | 9271 | 2048×2048 |
| Qwen 文生图2K/隧道恢复 | 8247 | 9272 | 2048×2048 |
| Qwen 双图1K | 8248 | 9273 | 1024×1024 |
| Z Image 4K | 8249 | 9274 | 4096×4096 |
| Qwen 文生图4K | 8250 | 9275 | 4096×4096 |
| Z Image 自定义 | 8253 | 9278 | 1536×1024 |
| Qwen 双图2K | 8254 | 9279 | 2048×2048 |
| Qwen 双图4K | 8255 | 9280 | 4096×4096 |

8245在第二张已提交后重启三个worker，另暴露并修复批次JSON循环引用，已加真实SQL三张落库回归；恢复原prompt后完成三张。8247生成时中断frpc，待恢复状态/守护重连/原prompt_id保留通过。8253/8254/8255在SYSTEM重新拉起ComfyUI/FRP后成功；双图4K约483秒。

最终质量CI [39215244482](https://github.com/csyhnine/QMDH-web/actions/runs/39215244482)（7a9874b）：后端227 passed +24 subtests；前端50项、23既有TS错误/0新增、构建通过。Linux最终镜像隔离30项通过；生产副本迁移保留49旧表计数、PG并发领取串行/其他渠道可用、四并发同键仅建一项、十二并发容量严格10项通过。最终公网API三渠道/三档、幂等复用、非法参数创建前422、四容器探活/前端不可达、六CAD代理及health通过。IAB浏览器工具超时，未声称真实浏览器点击验收；前端为真实组件/派生状态回归及公网bundle一致性检查。

## Windows守护与认证材料

用户已在管理员PowerShell执行 `C:/ProgramData/QMDH-FRP/install-windows-supervisor.ps1`：QMDH-Comfy-Supervisor为SYSTEM开机任务、自动重启策略，入站8188阻断规则。当前非提权令牌不可读任务/防火墙元数据；原用户守护退出，受控停止原进程后SYSTEM重拉ComfyUI与frpc、回环与后端HTTP200、实际GPU任务成功。未重启整台Windows，不把组件重启当整机重启或长期压测。

运行材料在仅Admin/SYSTEM可访问的 **C:/ProgramData/QMDH-FRP/**：`windows.toml`、`frpc.exe`、`server-ca.crt`、`windows.crt`、`auth-token`、`windows.key`、`windows-supervisor.ps1`、`comfy-environment.json`。私钥未导出/移动/扩权。health.json记录就绪/证书剩余天数，少于30天renewal_due=true；logs保留14天。电脑运行期间守护负责恢复；不要另开旧启动器/全网卡ComfyUI或frpc副本。

离线CA私钥仍仅在受限 **E:/backups/QMDH-web/frp-20261019/ca**，从未传给服务器或运行容器。服务器必要叶材料在 `/opt/qmdh-frp/server`、visitor，root:65532目录750/文件640，只读挂载。原windows材料包保留私有备份，最新交接见 `windows/PRODUCTION-CLOSURE.md`、system-supervisor-acceptance.json。

- server CA证书DER SHA256：c6430f148245ae94777383504b44f9e20744d6550cca30ce242e9bfea656a69f。
- Windows证书DER SHA256：8b2f0b3403f6ffcd00c096a7206babd73506b44fc98fb1fa35555bed296f84d3；北京时间2027-01-17 10:47:39到期。DER指纹不是PEM文件哈希。
- `ops/frp/sign-client.py`核验CSR签名/RSA≥2048或EC≥256，只签clientAuth且拒绝覆盖。续签/轮换走受限文件与已核验SSH/SFTP，独立核对CA指纹；token/STCP secret分离，真实秘密不进入provider配置/聊天/Git。
- provider兼容非空Key字段使用非秘密标记frp-transport-authenticated；泄漏需轮换受影响材料，不能假定FRP支持单证书吊销，必要时换client CA重签。

## 发布、备份与回退

最终功能代码7a9874b，迁移b27d0f85c932追加task_dispatches/reference_uploads。backend fc3ac003、worker 1fbaa318、frontend 3c01a252；基于原运行镜像仅复制合并后的变更，保留ODA/FFmpeg/Nano Banana生产差异。env/key及FRP/DB/cache/search原容器保持。

发布前备份 `/www/backup/qmdh-release-20261019-comfyui-closure` ↔ `E:/backups/QMDH-web/frp-20261019/closure-backup`：DB/env、5805媒体清单/3增量3881989字节、旧镜像、运行与公网/并发/迁移证据、Git bundle/FRP运行包。增量恢复链引用前次UI发布；发布后 `/www/backup/qmdh-comfy-closure-live-20261019` ↔ 本机closure-live-backup：5820媒体/15增量111458315字节，10文件SHA配对；发布前25文件SHA配对。全部恢复按链，不把增量当完整媒体。

重建必须保留 `docker compose -f docker-compose.yml -f /opt/qmdh-frp/compose.frp.yml`、三个worker、模板只读挂载/专网和ODA构建材料。回退先排空待办/确认上游终态、禁用id60/61/62，再用 qmdh-release-backup-{backend,worker,frontend}:20261019-closure；不downgrade、不删Task/媒体/新表、不换key。旧代码可能把未知adapter退成模拟图，尤其不能带着编辑渠道回退。

原阶段记录归档于 [comfyui-frp-before-production-closure-20261019.md](archive/comfyui-frp-before-production-closure-20261019.md)。

### 创作区显示入口（2026-10-19 布局修复）

自定义宽高与本机连接状态位于底部“比例／分辨率”菜单内，自定义尺寸默认折叠；不再作为创作框根级行。1K/2K/4K、张数、双图编辑与提交链路保持。

双图编辑入口直接提示必传两张及顺序，缺图时提交按钮说明缺哪张。单图编辑不在当前已验证工作流内；不能仅取消前后端校验或偷偷复制第一张作为第二张。

### Qwen v1.1 已切换（2026-10-19 当前）

新版单图/easy seed/50步与GPU缓存已上线，当前map SHA ae4127ee5d20a1239a8ac597f4ae1183b9126a8c5250d4842bafca4e3b511c94；前后端适配成套发布，API单图合同/公网静态资源/健康通过。发布备份qmdh-qwen-v11-release-20261019两端27文件SHA一致；旧镜像标签20261019-qwen-v11可在排空/核对后回退。未运行GPU任务，600秒预算内实际性能和输出仍待验证；完整当前运行/源码/回退事实见[qwen-v1.1-preparation.md](qwen-v1.1-preparation.md)。


## 2026-10-26本地输入数量自动选择（未部署）

前后端支持公开reference_input_counts并按1/2张选择不同编辑模板。新双图从v1.1单图复制，只增加475及两处参考图连接；50steps、cache gpu、thinking、共享seed等全部保留，旧v1.0双图不用于本候选。接收即固定具体SHA和输入数，恢复不切图/重提。实际候选与定向验证见[接线记录](qwen-reference-routing-2026-10-26.md)，未做GPU出图或生产切换。
