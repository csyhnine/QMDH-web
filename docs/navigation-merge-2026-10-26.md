# Studio 入口归并（2026-10-26）

按用户要求，两套Studio左栏统一为生成/其他/资产库/对话，公司项目管理继续按原授权显示。灵感、反馈、导航归入其他；无限画布归入生成。管理后台菜单及公司权限未改，原URL/ProtectedRoute/画布功能开关保留。

/studio/other改为集中入口，不再直接重定向CAD；五个入口为灵感/反馈/导航/图纸解析/GIF压缩。各页使用共享子菜单，灵感/反馈/导航的原页面仍保留自身状态与API，只把左栏高亮映射到其他。生成工作台及无限画布顶部增加生成方式子菜单，画布左栏高亮生成；功能关闭时不提供画布子入口。

共享STUDIO_PRIMARY_NAV避免两套侧栏漂移；AppShell按页面归属高亮，原CAD/GIF按需懒加载，其他首页不挂载两工具。移动端子菜单换行、主栏横向收容，画布保持可用高度。没有搬迁账号/项目/任务/媒体或触发生成。

定向18项通过（导航/Other/CAD/GIF/管理权限入口），8目标strict前后0诊断，离线Vite通过（既有大块提示）。Chromium4场景通过：其他首页五入口/收拢侧栏、三个旧地址与父级高亮、生成画布切换及画布高度、390px无页面横溢；真实导航及组件配合合成内容，无生产账号/业务写入。首次夹具缺PNG loader/env定义，补齐后通过，不改产品逻辑。已前端发布并通过公网核对。72待验收/25冻结/R98保持，无全套/GPU/付费/补账/业务清理。


功能39aa6fd/手机按钮宽度补强7a31b8c已推送，当前前端源码7a31b8c74e114058b4e24eb2ac1176a4f76753be，镜像01a2fb29f9dfada1ed988925b1f2199587fe50eb3465f9550ce7ea7da149409b。51容器文件与公网首页/主JS/公共CSS/管理JS/生成JS和CSS/其他JS与CSS一致；other/inspiration/feedback/nav/canvas/generate/cad/gif八个路径返回当前首页（HTTP200），原客户端鉴权保持。非前端容器ID及启动时间不变，后端/三worker仍8080b23对应镜像，迁移f62不变，无生产业务写入。

当前三Compose为主文件 + /opt/qmdh-frp/compose.frp.yml + **/opt/qmdh-frp/releases/navigation-merge-20261026/compose.release.yml**，保留management-categories-20261026/workflows只读绑定和依赖目录。只替换前端，回退使用本目录compose.rollback.yml，不降迁移或覆盖业务库，不用旧服务器Git重建。

配对备份/www/backup/qmdh-release-20261026-navigation-merge ↔ E:/backups/QMDH-web/release-20261026-navigation-merge，最终23文件SHA一致，含DB/env/原配置及镜像/源bundle/媒体链。5843媒体/0增量，30归档恢复链仍需本机两基础包；27既有服务器包SHA重新核对，最终盘余8.44GiB。私密内容不入Git，脱敏结果见归档RELEASE.json。草稿PR #5未合并；72待验收/25冻结/R98保持。
