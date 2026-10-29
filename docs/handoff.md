# Handoff

## 当前接手入口

2026-10-29 动效改造已提交、推送并部署。运行前端源码 `55a4ad6adc4daf82dccdddf7f12b5e4c14a4d6fd`，镜像 `0575fb19543b`（`qmdh-motion-frontend:20261029`）。先读 [发布记录](motion-release-2026-10-29.md)，再按需读 [动效交接](handoff-motion-2026-10-29.md) 与 [管理/生产交接](handoff-management-2026-10-27.md)。文档收尾提交不等于运行源码版本。

最终包统一 19 浏览器场景、3 状态测试、13 目标文件类型诊断零项、888 模块构建通过。线上 52 文件、12 个不同资源、26 地址和健康/鉴权/能力通过；其余容器未重启，无迁移、清理或生产测试写入。新第三 Compose `/opt/qmdh-frp/releases/motion-20261029/compose.release.yml`；27 文件配对备份两端 SHA 一致，数据库/媒体继承既有恢复链，非新快照。发布后盘余约 8.267 GiB 是本轮时点，后续发布须重查。

沿用 `bugfix/migration-bootstrap-001`，草稿 PR #5 不合并。既有 `checks.md`、`plan.md`、`review.md` 及无关未跟踪内容完整保留且未提交；72 待验收/25 冻结/R98 状态保持。聊天和折叠区动效暂缓，既有焦点恢复及未穷举边界详见发布记录。不重复执行本轮发布工具。

## Latest Handoffs（仅保留最新3条）

1. **2026-10-29 动效已上线**：A 管理浮层、B 新生成图片、C 导航、D 画布局部反馈，补齐图片状态复位和重复 decode 幂等。源码 `55a4ad6` / 镜像 `0575fb19543b`；最终包 19 场统一回归，27 文件配对备份。详见 [发布记录](motion-release-2026-10-29.md)。
2. **2026-10-28 短拖/日格对齐/两图反馈已上线**：前端dcce45a/5c627d5ca11a；6px内防误触后短拖按日响应，日期行/柱底精确对齐，屏幕下沿临时补日行；项目计划条内手柄/浮签/高亮/固定端/Esc恢复。24定向/23目标strict零新增/9实际Vite包+10交互回归、52文件/10资源/26地址通过。仅前端无清理。第三Compose：`/opt/qmdh-frp/releases/timeline-consistency-20261028/compose.release.yml`；26配对文件一致，继承此前纯前端轮→unit-access独立恢复链，盘余约8.231GiB为历史时点。见[记录](timeline-consistency-2026-10-28.md)。
3. **2026-10-28 底端跨视窗与平移误触已修复上线**：前端31027d0/f3cf6526e97e；真实日期不夹取视窗、裁切端始终保留、密集单日命中修正，柱体不放平移手柄，快捷卡片显式进入整项移动。23定向/23目标strict零新增/7新+11端点+10交互浏览器、52文件/10资源/25路由通过。仅前端无清理。第三Compose：`/opt/qmdh-frp/releases/pillar-handles-20261028/compose.release.yml`；26配对文件一致。见[记录](pillar-handles-2026-10-28.md)。前端/第三Compose已由timeline-consistency一轮替换。更早端点轮见[历史记录](pillar-resize-2026-10-28.md)。

## 使用规则

只保留最新三个交接入口；旧完整记录已逐字节移到[历史handoff](archive/handoff-before-2026-10-27-management.md)，其中相对链接按原docs目录解析。写给冷启动代理，WIP和未验收必须明确，不把旧版本号或定向通过当整套通过。后续只调整交接文档时不重复部署。
