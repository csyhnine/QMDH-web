# 管理导航固定与组织隔离核对（2026-10-26）

用户要求分院人员/项目不能混池，四个子菜单固定位置，并解释页面逻辑。本次核对现有服务端unit作用域，不变更权限或业务数据；补充一/二/三院人员、项目、台账、修订、删除/回收站恢复及跨院分配拒绝的定向用例。按分院逻辑隔离，数据库基础设施共享，不是每院独立数据库；已有公司授权的admin可逐院切换，院管理者仅本院，原二/四院合并为同一新二院。

截图左右跳动来自容器width:auto随内容内在宽度变化；management-page固定width:100%/min-width:0，沿用1660px最大宽度。四个菜单sticky top:0，窄屏祖先overflow-x改clip避免生成阻止吸顶的滚动容器。四页宽度/菜单坐标一致，滚动时菜单吸顶；每页加入固定位置的用途说明，展示当前分院管理边界。

四页复用同一分院、年度和项目资料：总览看本周重点/延期风险/负荷；台账维护资料、分工和合同费用；计划以项目为主线排阶段/里程碑/日期/进度；人员排期以人为主线看跨项目占用、分配与冲突。台账录资料→计划排工作→人员排期平衡投入→总览追踪，任一保存后其他视角使用同一数据。

验证：管理后端22 passed/5既有warning；前端15 passed；4目标TS strict0；Chromium实际5场景（真实外层样式，1920px四页菜单坐标一致、滚动吸顶、三院切换、删除恢复/冲突、390px无横溢）；离线Vite构建通过，既有大块提示保持。首次吸顶夹具未等待平滑滚动，改瞬时滚动后验证通过。浏览器合成人员不是真实业务验收。

本次仅前端发布，backend/3worker/PG/Redis/FRP/模板/迁移保持；72待验收/25冻结/R98状态保持。不跑全套/GPU/付费/历史补账或业务清理。已上线，结果如下。


已部署前端源码85c4650800c55e2b94c8ca26afcdfe8f80dacfb9，镜像3b65e290098a8bb80dc4dd7d89da8361966b37d9382a8cc9603f9fc7ef4b35e5；后端/三worker仍8080b23对应镜像，所有非前端容器ID及启动时间保持。51前端文件与公网首页/主JS/管理JS和CSS逐字节一致，健康200；无迁移/业务数据写入。构建首次直接FROM镜像ID解析失败，正式切换前改为已核本地镜像标签后构建成功，失败未改变线上服务。

当前三Compose：主文件 + /opt/qmdh-frp/compose.frp.yml + **/opt/qmdh-frp/releases/management-navigation-20261026/compose.release.yml**。该文件保留原backend/worker镜像和/opt/qmdh-frp/releases/management-categories-20261026/workflows绑定，两发布目录均须保留；禁止用旧服务器Git重建。仅前端回退使用新目录compose.rollback.yml；不会降迁移或重置业务数据。

配对备份/www/backup/qmdh-release-20261026-management-navigation ↔ E:/backups/QMDH-web/release-20261026-management-navigation，23文件SHA一致；包括已含42人/f62迁移的DB、env、原配置/镜像、源码bundle与媒体链。媒体5843/0增量，27归档链继承前次，本机两份基础包仍必需。原数据库和密钥等私有内容不入Git。最终盘余约8.53GiB。见[脱敏发布证据](archive/management-navigation-2026-10-26/RELEASE.json)。草稿PR #5未合并。
