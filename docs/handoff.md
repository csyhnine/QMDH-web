# Handoff

## 当前接手入口

2026-10-29 “台账信息”已移除并提交、推送、部署。运行前端 `d8e74d6f02ecfd850b5904d33623144ea159694e` / 镜像 `f612ab67ad00`（`qmdh-remove-report-meta-frontend:20261029`）；详情见[发布记录](remove-report-meta-2026-10-29.md)。文档SHA不等于运行源码。

移除按钮/弹窗/保存草稿/独立reports读取，页面底部和Excel不再显示编制/更新日期；DB历史字段及报表统计/导出保留。26定向、2目标类型零新增诊断、890模块构建和4页面交互通过。52文件/12不同资源/26地址/健康/鉴权/能力通过，27文件新配对备份两端SHA一致。第三Compose `/opt/qmdh-frp/releases/remove-report-meta-20261029/compose.release.yml`；备份服务器 `/www/backup/qmdh-release-20261029-remove-report-meta` ↔ 本机 `E:/backups/QMDH-web/release-20261029-remove-report-meta`。DB/媒体继承原恢复链、unit-access独立快照/本机基础包，非新快照；其他容器未重启，无清理、迁移或生产测试写入，盘余约8.198GiB为时点值。

原分支、草稿PR #5不合并，checks/plan/review及无关未跟踪WIP保留；冻结审查与聊天/折叠区暂缓保持。不原样重跑发布工具。此前滑杆稳定、池二次点击返回和名称高亮见[上一轮记录](viewport-stability-2026-10-29.md)。

## Latest Handoffs（仅保留最新3条）

1. **2026-10-29 移除台账信息已上线**：`d8e74d6` / `f612ab67ad00`；按钮、弹窗、编制/更新日期提示移除，历史数据及导出保留。见[记录](remove-report-meta-2026-10-29.md)。
2. **2026-10-29 滑杆稳定与入口反馈已上线**：`10a8527` / `ecfe01dadc63`，真实鼠标抖动复现修复、池二次点击返回、名称高亮编辑；新27文件配对备份。见[记录](viewport-stability-2026-10-29.md)。
3. **2026-10-29 人数/等级/人员池已上线**：`6a4937e` / `71fc60e537c6`，19 场浏览器与 26+17 定向测试通过；28 文件新配对备份。见 [记录](priority-pool-2026-10-29.md)。
## 使用规则

只保留最新三个交接入口；旧完整记录已逐字节移到[历史handoff](archive/handoff-before-2026-10-27-management.md)，其中相对链接按原docs目录解析。写给冷启动代理，WIP和未验收必须明确，不把旧版本号或定向通过当整套通过。后续只调整交接文档时不重复部署。
