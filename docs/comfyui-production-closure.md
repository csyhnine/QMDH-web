# ComfyUI 生产闭环（2026-10-19）

状态：WIP，codex/comfyui-production-closure；不能把本地实现当已发布。

## 已确认的原问题

真实 task8242 完成，8243/8244 因 GPU 占用失败；原锁只互斥不排队。
通用 Redis BRPOP 无确认/租约，数据库建任务与入队非同一事务。
断线后锁保留但缺少恢复器；通用超时提示会误导重复提交。
前端张数/比例不按本机能力约束；尺寸未接入控件；双图 API 尚未接入。
电脑端手动进程，无启动守护；探活未形成用户可见状态。

## 当前实现边界

- 新 task_dispatches 与 Task 同事务写入，是持久待办；Redis 只唤醒与兼容旧投递。PostgreSQL 事务锁串行领取，90 秒执行租约、15 秒心跳，过期本机任务恢复同一 checkpoint；其他渠道中断保留待核对失败，不盲重投。
- 本机统一 FIFO 串行；其他渠道仍可由其他 worker 执行。每人最多10项本机待办、总共100项。本机排队不走旧30分钟超时回收。
- 用户范围 submission_key + request hash 防重复；客户端仅保存摘要和键，丢响应保留、成功删除；参数改变返回409。
- 原任务 prompt_id 优先，丢 POST 响应按唯一 client_id 在 queue/history 找回；找不到保持待核对，绝不据“暂时没找到”重交。
- 1～3张逐张执行并持久保存每张的结果/seed；中断从未完成张继续；原始 graph 批次仍为1，结果按 prompt_id 隔离。
- 宽高有效节点映射、1K/2K/4K预设与自定义256～4096、8倍数/16MP上限；未实跑尺寸不计验收。编辑使用两张归属核验的PNG/JPEG/WebP上传至ComfyUI，固定画布与随首图比例分支显式控制。
- /providers/comfyui/status：在线/忙碌/恢复中/离线及等待量；模型管理有恢复操作，关闭须队列为空且无成功产物、备注及审计，锁按owner释放。
- 未识别的真实 adapter 报错，不再退成模拟图。原静态演示渠道保留。

## Windows 守护

受限运行目录 C:/ProgramData/QMDH-FRP：证书/CA/token 配置已从备份目录复制为独立运行材料，私钥不变；环境只复制必要路径/模型缓存/CUDA字段，不复制token环境。
windows-supervisor.ps1 守护回环ComfyUI与frpc、写health.json、证书到期前30天标记renewal_due、日志14天保留。当前会话没有管理员令牌：系统级启动任务与防火墙安装被Windows拒绝，不能声称已安装。
管理员安装脚本 ops/frp/install-windows-supervisor.ps1 已准备；未执行前只能是用户会话守护，Windows重启/未登录启动尚未验收。

## 待完成验收与发布

离线：串行FIFO/其他渠道并行、同事务回滚、租约/心跳/旧owner隔离、Redis故障、幂等409、丢响应找回、逐张结果、上传归属、有效尺寸/编辑画布、真实前端组件与菜单。
生产：先备份DB/env/媒体恢复链/旧镜像，保留FRP overlay/ODA/FFmpeg/Nano Banana差异；迁移生产副本先测，再发布。连续提交、多张、双图、尺寸、断线/worker重启真实验收，保存任务/资产/上游ID/SHA与审计证据；不修改旧失败任务以伪装成功。
