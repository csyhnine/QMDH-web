# 管理工作台改版发布 — 2026-10-16

功能提交 514a8cba6f102c2ba4daf99fd98524148acf17b9；窄屏时间轴补充 ce3107585a9437147b1cbcd2b8698017d2dc340e。生产前端构建来自合并 787d23705980c6b853e388c33872057df15e3a38。不重启/部署后端，无迁移，schema 仍 a16c9e74b821。

## 产品和技术

- 管理总览默认展示在册项目、周一至周日未完成节点、延期阶段、已开票请款精确金额、关注节点、人员负荷和项目进展。所选年度和筛选范围明确，未知金额不计为零，未排期不推断实际空闲。
- 台账默认关键列，支持列显隐/分组/排序，全部原始字段可编辑与 CSV 导出；详情右侧抽屉有分区跳转、键盘焦点约束/返回、滚动锁定，人员搜索勾选。名册不增加网站权限。
- 项目计划引入 dhtmlx-gantt@10.0.3 Community，锁版本和完整性，MIT 原文保留于 frontend/public/licenses/dhtmlx-gantt-MIT.txt。Worklenz/OpenProject 仅作产品交互参考，未复制其 AGPL/GPL/商业代码。
- 甘特独立实例仅视图进入时懒加载，清理销毁；项目/阶段稳定 ID，父项目禁止拖动，阶段日期包含结束日和组件排他结束日双向转换，里程碑保持同日。移动、拉伸、进度调整先暂存与显示前后变化，确认后按项目原版本顺序保存。跨项目不是原子事务：成功项移除，失败和未尝试项仍保留，逐项成功提示带项目名。状态冲突可复制变化后刷新再应用，不自动覆盖。
- 归档计划只读；无依赖编辑/自动排程/PRO 资源 API，不调用外部在线导出。任务树/人员文本进入 HTML 模板前转义。人员 7/14 日视图独立计算日历日分配，超额提示保留，不假定周末/假期。
- 页内视图/筛选/刷新、侧栏离开与刷新关闭保护未保存内容；浏览器前进后退尚无全面拦截保证。移动端页面侧栏仅 management-shell 调整，不影响其他模块；甘特保留可读宽度在内部横向滚动。

## 验证

前端本地 43 项通过、23 既有/0 新增类型错误、构建成功。新增总览周界/逾期/精确金额、chart ID/结束日/HTML 转义、父项目/归档只读、部分成功后保留剩余写入测试。CI 38873245073 完成成功：Linux 后端 197 passed + 16 subtests，前端 43 项与类型/构建通过（最初 514a8cb CI 被后续窄屏提交自动取消，以 ce31075 完成项为准）。

实际本地 headless Chrome（独立上下文，无个人账号）：真实 DHTMLX 社区组件挂载、拖动预览、取消离开保持调整、失败保留、撤销、再拖动确认保存且 payload 无服务端元数据、人员图、抽屉和 390px 页壳/图内滚动，无浏览器 JS 错误。使用本地验收项目甲乙丙和测试人员、内存 transport，不调用正式写接口，样例不进 Git 或生产。截图六张和复测脚本/夹具在私有 local-browser-preview 备份；临时 Vite 5179 服务与 frontend/.management-preview 目录已清理。cua 工具仍有 kernel assets 路径故障；不声称已完成领导正式账号登录 UI 验收。

公网入口/health 200，管理三读接口未登录 401。新 ManagementProjectsPage-DELNWkYr.js 包含四视图及变更检查，懒包 dhtmlxgantt.es-DPXjonIM.js 200，MIT 许可文件含原版权。六条 CAD extracts 代理检查仍直接 401，health 200。SQL READ ONLY 核验当前六个授权账号（含 admin）与单位保持，正式管理项目 0，未建立假排期。

## 备份、运行与回退

服务器 /www/backup/qmdh-release-20261016-management-workbench 与本地 E:/backups/QMDH-web/release-20261016-management-workbench 私有配对。发布前数据库/config/媒体/旧镜像、Git、构建/公网结果、前后服务启动状态、浏览器证据共 30 份文件 SHA256 校验一致。5799 媒体，26 个增量共 122595063 字节，完整读取校验增量内容，restore-media-chain.json 引用前一管理发布备份链，未重复拷贝旧 14GB 包。Windows Admin/SYSTEM OI/CI ACL。

仅 docker compose build frontend 与 up -d --no-deps frontend。新 frontend 镜像 sha256:85b3652ed57b8ce9548d81940da1944d08fa7b538a795659f9b0fdede13ee7eb，nginx -t 成功。backend、worker1/2/3、postgres、redis 容器 ID、StartedAt、镜像前后文件 cmp 完全一致，后端 healthy。env SHA256 cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f 保持，原加密键不动。旧 frontend 保留 qmdh-release-backup-frontend:20261016-management-workbench，可仅回退前端，无数据库回滚。

原 styles.css +13 行、比较文档、用户临时脚本不提交；既有业务/媒体/CAD/18010/数据卷无操作，无授权扩大。源码与文档同步；Safe to hand off: Yes。
