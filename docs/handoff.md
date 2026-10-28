# Handoff

## 当前接手入口

先读[开发交接](handoff-management-2026-10-27.md)。人员泳道上下端独立拖拽/另一端固定/实时动效已于2026-10-28上线，前端98c5735/2ebc0b0b4992；⠿保留整项平移/转交，松手应用、Esc取消、边缘滚动、键盘和手机触摸。此前工作卡片/人员缩放/固定导航保持。后端仍c45fd00对应镜像，后续按新需求继续。旧缓存链早已清理，不重跑或扩大授权。

保留`bugfix/migration-bootstrap-001`，草稿PR #5不合并；72待验收/25冻结/R98状态保持。`docs/checks.md`、`docs/plan.md`、`docs/review.md`是既有未提交文档，不覆盖或顺带提交。完整工作区保护、线上基线、备份链、CI已知失败、代码导航和验证方式均在新交接文件。

## Latest Handoffs（仅保留最新3条）

1. **2026-10-28 人员泳道独立端点拖拽已上线**：前端98c5735/2ebc0b0b4992；上下端分别改起止，另一端固定，实时按日预览/浮签/阴影/落点反馈，松手应用，Esc取消、边缘滚动、键盘和触摸；⠿单独平移/转交。23定向/23目标strict零新增/11新+10回归浏览器、52文件/10资源/25路由通过。仅前端、无清理。第三Compose：`/opt/qmdh-frp/releases/pillar-resize-20261028/compose.release.yml`；26配对备份文件一致，经工作卡片轮继承unit-access恢复链，盘余约8.311GiB。见[记录](pillar-resize-2026-10-28.md)。
2. **2026-10-28 工作卡片保存关闭与删除泳道已上线**：前端1528a44/e678de9b906f；页头相邻“不保存关闭”/蓝色“保存关闭”，遮罩空白保存成功后关闭，失败保留输入；快捷卡片确认后删除整项stage。22定向/21目标strict零新增/9新+10回归浏览器、52文件/10资源/25路由通过。仅替前端，无清理。第三Compose：`/opt/qmdh-frp/releases/work-card-close-20261028/compose.release.yml`；26文件配对备份一致，数据恢复基线继承personnel→navigation→unit-access，盘余约8.332GiB。见[记录](work-card-close-2026-10-28.md)。 前端及第三Compose已由最新一轮替换。
3. **2026-10-28 人员排期缩放与并行泳道已上线**：前端050053f/d15c5aebca10；Ctrl+滚轮调整一页日期、双击预填人员/日期新增、10项并行在固定列内压窄。22定向、21目标strict零新增、7新+10回归浏览器、52文件/10资源/25路由通过。仅前端替换，无清理。第三Compose为`/opt/qmdh-frp/releases/personnel-zoom-20261028/compose.release.yml`；26文件配对备份一致，数据继承navigation-fixed→unit-access恢复基线，盘余约8.354GiB。见[记录](personnel-zoom-2026-10-28.md)。 前端及第三Compose已由最新一轮替换。

## 使用规则

只保留最新三个交接入口；旧完整记录已逐字节移到[历史handoff](archive/handoff-before-2026-10-27-management.md)，其中相对链接按原docs目录解析。写给冷启动代理，WIP和未验收必须明确，不把旧版本号或定向通过当整套通过。后续只调整交接文档时不重复部署。
