# 人员泳道上下端独立拖拽与实时反馈

原人员泳道只有顶部原生拖动手柄，执行整项改期/转交，因此两端一起移动且底部不可拖。现在上下端分别作为开始/结束日期手柄：拖哪端改哪端，另一端和参与人员固定。不能拖成负工期，最短保留含结束日的一天、最长约十年；多人共用工作会同步预览同一工作的所有泳道，保留暂停、交付物、推进记录及其他工作。真实端点不在当前视窗时不显示该端手柄，避免把裁切边界误当实际日期；可切换更大范围查看。

单独的 ⠿ 手柄仍用于整项平移或人员转交，起止一起移动，并明确提示用途；极短的密集日格优先保留上下端手柄，放大可用整项手柄。柱体划选暂停/支援、点击快捷卡片、双击空白新增及Ctrl缩放保留。

端点使用Pointer Capture，拖动中在固定轨道内按日吸附实时预览，显示阴影/描边和起止日期浮签，提示固定端及Esc取消；只在松手后应用并进入原自动保存队列，拖动中暂停自动保存。靠近上下边缘自动滚动，点击未移动不改日期。Esc、pointercancel、失焦、视窗变化或卸载取消预览并清理动画帧/定时器；箭头键调整一天、Shift+箭头调整一周。落点轻量回弹/高亮，整项移动显示源柱和目标格反馈，遵守减少动态效果偏好。

23项管理定向、23目标strict零新增、Vite构建（884模块、52文件、仅既有大块提示）通过。实际AppShell/管理页11新增浏览器场景及10原有交互回归通过，合成API并阻断外部请求，无页面错误/原生确认。新增覆盖共享泳道开始端实时预览/松手前零写入、结束端延长/缩短、最短一天/单击不写、Esc/指针取消/失焦、月视图自动滚动、裁切端点、跨年键盘、保存失败重试、手动撤销/Ctrl缩放后的落点、10并行细泳道、真实CDP触摸和减少动态效果；原有整项移动/改派/暂停/甘特/交付仍通过。

代码：PeopleSchedule呈现，usePillarResize持有本地预览/指针捕获/取消/自动滚动，staffPlanning.resizeWorkEndpoint只修改指定端点，PeoplePlanner仍复用项目CAS保存。证据：`docs/archive/pillar-resize-2026-10-28/`。私有测试/截图/候选：ignored 的 `local/pillar-resize-20261028/`；一次性发布脚本：`local/pillar_resize_runner.py`、`pillar_resize_preflight.py`、`pillar_resize_backup.py`、`pillar_resize_deploy.py`。本轮只改前端，不创建分支/worktree，不委派，保留既有WIP与冻结状态。

发布前核对前端e678de9b906f、后端dad05b8dc047、三worker fa3f8984f8a4、迁移b94de295f179、配置/8工作流/恢复基线，任务/派发/Redis/上游队列与GPU锁为空，盘余约8.332GiB。无清理；部署情况见下。

2026-10-28 已部署前端源码 `98c5735741addb62bbfe40ba9a99b4583c5c3e36`，镜像 `2ebc0b0b4992`。52文件逐字节、10公网资源、25页面地址、健康、Qwen输入数[1,2]及管理鉴权通过，旧hash资源保留。后端、三worker及其他容器ID/启动时间和env/挂载/网络/8工作流保持，无迁移或生产测试写入。

生效第三Compose：`/opt/qmdh-frp/releases/pillar-resize-20261028/compose.release.yml`；服务器 `/www/backup/qmdh-release-20261028-pillar-resize` ↔ 本机 `E:/backups/QMDH-web/release-20261028-pillar-resize` 的26文件SHA一致。DB/媒体硬链接经work-card-close→personnel-zoom→navigation-fixed继承unit-access独立恢复基线，非本轮新快照；回滚只切前端，不覆盖新业务数据。发布后盘余约8.311GiB，仍须后续复测8GiB门槛。本轮无清理。
