# Qwen Image 2.1 v1.1 准备与运行切换

2026-10-19 最新状态：用户随后明确命令“切换到v1.1的版本去”，**v1.1文生图/单图编辑已切换线上**，前后端适配同步发布，Z不变。未提交GPU任务，实际耗时/显存/输出仍未验收。此前“只同步准备”的限制对本次切换已被新命令覆盖，commit/push与GPU禁令继续有效。

同日后续修复qwen-v11-009：用户任务8264被400拒绝，根因为随机种子1374080225793968超过easy seed最大1125899906842624（2^50）。现已按映射节点类型统一随机生成、显式校验和多张回绕范围：Qwen 0..2^50含上界，Z/旧图仍0..2^53-1；不截断用户值，不重跑8264。当前backendf8822343/worker3cc0ece1（三副本）、frontend仍d5dfe72b；模板/hash/启用状态/600秒保持。Windows/Linux专项27+12sub通过，运行object_info范围只读核验通过；备份qmdh-qwen-v11-seed-fix-20261019两端21文件SHA一致。详见archive/handoff-2026-10-19-qwen-v11-seed-fix.md；下方原切换镜像为修复前历史。

## 材料与路径

- 输入交接 `D:/ComfyUI-aki-v2/integration/qmdh/QWEN-v1.1-HANDOFF.md`，优先于旧API-HANDOFF。
- 服务器准备目录 `/opt/qmdh-frp/prepared/qwen-v1.1-20261019/`：`workflows/`放映射、三个模板与原交接；`source/`放此准备分支源码；不被生产Compose挂载。
- 线上从 `/opt/qmdh-frp/workflows` 读取，当前v1.1 map SHA256 `ae4127ee5d20a1239a8ac597f4ae1183b9126a8c5250d4842bafca4e3b511c94`；切换前旧map SHA为`3407a8e8b0b28d8c713aa03ce33e8ce379977b4ec28e82bba2414f2a882e9f35`，旧模板保留。
- 准备快照 `/www/backup/qmdh-qwen-v11-preparation-20261019`，本机 `E:/backups/QMDH-web/frp-20261019/qwen-v11-preparation`。只有文件/只读运行与provider快照，不是一次数据库/媒体发布备份。

| 模板 | SHA256 | 输入/种子 |
|---|---|---|
| qwen_image_2_1_image_edit-v1.1-api.json | f0842f769bc97773b22b8852993b4e6b8ab3c8b1fe0ade15a6752d3cb4c2d504 | LoadImage470一图；502.seed |
| qwen_image_2_1_t2i-v1.1-api.json | 129bef5c6f44c846b65df46b72f64c8ca95f8a41543475d2eaea530e82c1c29d | 486.seed |
| z_image_turbo-api.json | 1c085f5e3db6acf2cc9dfdb550801601e68be259797b54153257572ec2ee0516 | 保持原样 |

## 已准备适配

- seed仅写映射的easy seed共享源（含0），校验KSampler/TextGenerate两个下游链接并保留；不把链接覆盖为整数。两个提示词映射始终替换实际用户提示词，增强开关仍false；50steps及Cache.device=gpu保留，输出461。
- 编辑按map.reference_input_count与image_loaders长度校验；老map无此字段时使用loader数，旧双图兼容，新单图仅上传/绑定470。禁止zip静默丢第二图。所有权、图片类型/大小、安全路径和断点恢复保留。
- provider能力响应新增可选reference_input_count，来自**在用**模板；前端上传上限/提示/按钮/提交校验随合同切换，无字段时兼容旧双图。不动态扩成多图；本轮新版合同明确一图。
- `python -m app.scripts.check_comfyui_workflows --root <bundle>`：仅本地文件检查，校验SHA、节点链接、共享种子/零种子、提示词、50步/GPU缓存、一图、输出及模板不变；不会访问DB、Redis或ComfyUI。

## 超时兼容性

- 线上id60/62以及Z id61当前enabled=true，timeout_seconds均600；本轮保持。
- 适配器单张预算 `max(10,min(profile.timeout_seconds,600))`，单次HTTP读取上限30秒/连接5秒，整体截止含上游探活、上传、排队、采样、history轮询及下载。多张1～3逐张预算，整任务可能超过600秒。
- 600秒不是前端同步等待窗口；网站先创建持久任务，worker执行。90秒租约由15秒心跳续期；Comfy任务不走普通旧15/30分钟自动终止逻辑。
- 提交后超过预算会保留prompt_id/client_id、GPU owner和checkpoint并进入恢复核对；后续领取重新给予轮询预算，不自动重交原prompt。终态错误仍失败。只把provider改大于600不会突破当前适配器上限。
- 旧25步4K编辑实跑约483秒不能证明新版50步兼容600秒；GPU缓存也不能直接推导提速或显存足够。1K/2K/4K实际耗时、显存和输出均待受控验证，本轮没有性能通过结论，不擅自扩大超时。

## 后续受控切换边界

先准备发布备份并确认旧待办/恢复任务与上游均已核对；当前checkpoint固定workflow SHA，不能在旧任务执行中直接换map。保留旧镜像/模板。将经过检查的代码与前端成套部署，再按授权切换模板根目录（包含原样Z），把id62展示名从“双图编辑”改为“单图编辑”，enabled位保持；核对API的reference_input_count=1与页面一致。选定少量任务逐档验证后才可声称上线验收；如需改600秒硬上限另行明确预算并验证恢复，不取消幂等/租约/原prompt保护。回退同样需排空并核对版本，不重置库或媒体。

## 准备阶段结果（切换前历史）

本地及服务器隔离静态合同三图通过，后端ComfyUI23项在Windows/Linux均通过；前端完整53项、新版单图合同与构建通过，23既有TS/0新增。服务器隔离检查使用--network none，合同容器额外read-only/tmpfs，无生产数据库或媒体挂载。准备源码03e845d已推codex/qwen-v11-preparation，source.tar SHA256 146aac01b7b8e6f167aaf1839e1c920264999bd3be6cfa2cae48c02be139903d；未合main/未激活/未重建运行镜像。verification.json证明全部在用文件SHA、provider enabled/timeout与全部容器ID/镜像/启动时间不变；9份证据文件两端SHA一致。未调用/prompt，无GPU任务；实际耗时/显存/输出仍待验证。

## 运行切换结果（当前）

- 发布仅使用03e845d已准备源码；backend/worker分别继承原运行镜像，仅修改providers.py/schemas.py/comfyui.py并加入静态检查器，逐文件SHA差异核对通过，保留生产task_executor/ODA/FFmpeg/Nano Banana差异。frontend继承原nginx镜像，仅替换静态产物。未发布本地空库迁移修复。
- 当前镜像backend `6d3c4d91`、worker `fa6f6e69`（3副本）、frontend `d5dfe72b`。服务器Git仍c70eac02、工作树未改，本轮无commit/push/merge；运行版本以`/opt/qmdh-frp/releases/qwen-v1.1-20261019/RELEASE.json`为准，不能仅凭服务器Git误判。运行源码准备目录和Dockerfile保留用于复建。
- 公开API已返回id60“本机 Qwen Image 2.1 v1.1”、id62“本机 Qwen Image 2.1 v1.1 单图编辑”且reference_input_count=1。三渠道enabled=true/timeout=600保持，Z的模板SHA与名称不变；改名写provider.updated审计。
- 切换前两次核对全部任务/dispatch为空、ComfyUI queue_running/queue_pending=0、GPU锁不存在；短暂停入口后排空worker再切换，无中断或重交旧prompt。当前backend及3worker均运行，FRP/DB/cache/search及其他原容器ID/镜像/启动时间保持；env/key、挂载/网络保持。Alembic仍b27d0f85c932。
- 新镜像隔离后端23 passed+8 subtests、模板合同3项、前端53项/23既有TS错误0新增/构建通过；运行后backend/worker读取object_info确认三图所需节点类全可用，仅GET未发/prompt。公网index-CTTka0hF.js、index-uDmNPMjA.css、GeneratePage-BvhihfWU.js与容器SHA一致；单图API、health健康及六CAD401通过。未声称真实浏览器点击或GPU性能/效果通过。
- 发布备份`/www/backup/qmdh-qwen-v11-release-20261019` ↔ `E:/backups/QMDH-web/frp-20261019/qwen-v11-release`：27份文件SHA一致；DB/env、5828媒体清单/5增量51190080字节、旧模板、Git bundle、源码及检查证据。媒体恢复链接此前comfy-feedback备份及其既有全链，不把本次增量当完整包。
- 回退先停新入口、排空/核对v1.1任务和上游，再恢复workflows-before.tar.gz内旧map/模板与`qmdh-release-backup-{backend,worker,frontend}:20261019-qwen-v11`，展示名恢复旧文生图/双图；必须仍用主Compose+FRP叠加文件、保留3worker。不downgrade/不恢复旧库覆盖新业务/不清GPU锁。切换不等于GPU实跑验收，后续实际生成仍需明确授权。


## 2026-10-26本地输入数量自动选择（未部署）

前后端支持公开reference_input_counts并按1/2张选择不同编辑模板。新双图从v1.1单图复制，只增加475及两处参考图连接；50steps、cache gpu、thinking、共享seed等全部保留，旧v1.0双图不用于本候选。接收即固定具体SHA和输入数，恢复不切图/重提。实际候选与定向验证见[接线记录](qwen-reference-routing-2026-10-26.md)，未做GPU出图或生产切换。
