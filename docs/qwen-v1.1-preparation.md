# Qwen Image 2.1 v1.1 同步准备

2026-10-19。用户明确要求只同步准备、不提交GPU任务、provider启用状态保持。**v1.1已暂存，未切换线上模板或运行代码**；线上仍使用旧Qwen双图/文生图，不能把以下静态检查当成v1.1生成验收。Z不变。

## 材料与路径

- 输入交接 `D:/ComfyUI-aki-v2/integration/qmdh/QWEN-v1.1-HANDOFF.md`，优先于旧API-HANDOFF。
- 服务器准备目录 `/opt/qmdh-frp/prepared/qwen-v1.1-20261019/`：`workflows/`放映射、三个模板与原交接；`source/`放此准备分支源码；不被生产Compose挂载。
- 线上仍从 `/opt/qmdh-frp/workflows` 读取，map SHA256 `3407a8e8b0b28d8c713aa03ce33e8ce379977b4ec28e82bba2414f2a882e9f35`。旧模板保留。
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

## 本轮结果

本地及服务器隔离静态合同三图通过，后端ComfyUI23项在Windows/Linux均通过；前端完整53项、新版单图合同与构建通过，23既有TS/0新增。服务器隔离检查使用--network none，合同容器额外read-only/tmpfs，无生产数据库或媒体挂载。准备源码03e845d已推codex/qwen-v11-preparation，source.tar SHA256 146aac01b7b8e6f167aaf1839e1c920264999bd3be6cfa2cae48c02be139903d；未合main/未激活/未重建运行镜像。verification.json证明全部在用文件SHA、provider enabled/timeout与全部容器ID/镜像/启动时间不变；9份证据文件两端SHA一致。未调用/prompt，无GPU任务；实际耗时/显存/输出仍待验证。
