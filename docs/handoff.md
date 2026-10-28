# Handoff

## 当前接手入口

先读[开发交接](handoff-management-2026-10-27.md)。人员排期Ctrl+滚轮缩放、双击新增及10项并行压窄已于2026-10-28上线，前端050053f/d15c5aebca10；此前固定导航与后台归组保持。后端仍c45fd00对应镜像，后续按新需求继续。此前授权的旧缓存链已清理，不重跑或扩大授权。

保留`bugfix/migration-bootstrap-001`，草稿PR #5不合并；72待验收/25冻结/R98状态保持。`docs/checks.md`、`docs/plan.md`、`docs/review.md`是既有未提交文档，不覆盖或顺带提交。完整工作区保护、线上基线、备份链、CI已知失败、代码导航和验证方式均在新交接文件。

## Latest Handoffs（仅保留最新3条）

1. **2026-10-28 人员排期缩放与并行泳道已上线**：前端050053f/d15c5aebca10；Ctrl+滚轮调整一页日期、双击预填人员/日期新增、10项并行在固定列内压窄。22定向、21目标strict零新增、7新+10回归浏览器、52文件/10资源/25路由通过。仅前端替换，无清理。第三Compose为`/opt/qmdh-frp/releases/personnel-zoom-20261028/compose.release.yml`；26文件配对备份一致，数据继承navigation-fixed→unit-access恢复基线，盘余约8.354GiB。见[记录](personnel-zoom-2026-10-28.md)。
2. **2026-10-28 导航固定与后台归组已上线**：前端a8dfe6e/746b3bff23e3；后端/3worker未重启。25前端定向、20目标strict零新增、5实际浏览器场景、52文件/10资源/25路由通过。用户授权的同一旧构建缓存链释放约492MiB，镜像/服务保持。第三Compose为`/opt/qmdh-frp/releases/navigation-fixed-20261028/compose.release.yml`；26文件配对备份一致，DB/媒体继承unit-access恢复基线，盘余约8.350GiB。见[记录](navigation-fixed-2026-10-27.md)。 前端及第三Compose已由最新一轮替换。
3. **2026-10-27 规范名称与分院隔离核验已上线**：前后端源码c45fd00、backend dad05b8dc047/frontend 69e51190c586，worker保持；仅规范分院名称，不改授权。22后端定向/20前端/13目标strict零新增/3浏览器场景，18运行路由鉴权/授权聚合前后一致，52文件/10资源/9路由通过。新独立DB快照+媒体既有恢复链，28文件两端SHA一致。当前第三Compose为`/opt/qmdh-frp/releases/unit-access-20261027/compose.release.yml`；盘余8.021GiB须后续复测。见[记录](unit-access-2026-10-27.md)。 后端保持，前端已由最新一轮替换。

## 使用规则

只保留最新三个交接入口；旧完整记录已逐字节移到[历史handoff](archive/handoff-before-2026-10-27-management.md)，其中相对链接按原docs目录解析。写给冷启动代理，WIP和未验收必须明确，不把旧版本号或定向通过当整套通过。后续只调整交接文档时不重复部署。
