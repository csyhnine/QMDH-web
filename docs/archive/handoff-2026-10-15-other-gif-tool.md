# 2026-10-15 其他模块与手动 GIF 压缩

## 需求与实现

- 用户明确要求侧栏“图纸”改为“其他”，保留原图纸解析，并把 GIF 压缩放进该模块。
- 侧栏使用 other，入口 /studio/other 默认转 /studio/cad。OtherToolsPage 提供“图纸解析 / GIF 压缩”两页签；原 /studio/cad 及其查询参数不变，仍直接挂载原 CadExtractPage；未改 CAD 组件/算法/持久数据。
- /studio/gif 是独立交互页：选择/拖放 GIF、默认目标 500KB、自定义目标/初始最长边/帧率/颜色/自动降帧和缩图，压缩进度与错误提示、原件/结果双预览、大小与压缩率、达标状态、结果及原件下载。尺寸与帧率 0 表示从原始值开始。KB 展示统一十进制，避免目标和结果单位不一致。
- 新 POST /api/v1/assets/gif-compress 需要登录，仅接受有效且预算内的 GIF（20MiB 原件上限），参数校验。服务禁用或无 FFmpeg 返回 503，无效输入/超出处理预算 400/422，未登录 401。
- 请求使用不可变 GifOptions，从默认设置复制后应用当前参数；不 patch settings，不影响原有自动上传压缩或并发请求。沿用原件保留/派生文件、20 秒压缩预算与最小有效结果策略；新文件在 gif-tools/，无新数据库表或迁移。
- CSS 放入 otherTools.css，原 styles.css 13 行未覆盖。页面宽屏双列、窄屏单列，处理时禁用输入，切换参数后清空旧结果，卸载后忽略旧响应并释放本地预览 URL。

## 验证与状态

- GIF 相关后端专项 23 passed：原自动压缩 16 项、手动工具 7 项，含请求参数隔离、原件/派生路径、参数与文件拒绝、服务不可用、登录要求。
- 本地完整后端 148 passed、1 skipped、16 subtests passed。
- 前端统一检查加入页面空态、达标/未达标结果与下载、工具页签选择等 3 项渲染回归；共 22 项，23 既有类型错误/0 新增，构建通过。
- 实现阶段在 feature/other-gif-001-ui，基于 b09e892；原样式、比较文档及 _tmp_* 保护继续有效。未触碰 CAD/key/卷/18010。
- 2.0 兼容：工具页仅组织导航和参数，复用已有服务/存储，以请求配置隔离执行；没有新增编排引擎或覆盖历史内容。

## 发布与运行验证

- 功能提交 52276de49edd0fd590f6d9da7c45b0b2722bd612 已推送 main；生产运行代码合并 6c09498ec055b90bada79c1b808425d5b2eff6fd。后续纯文档合并不重建镜像。
- GitHub CI https://github.com/csyhnine/QMDH-web/actions/runs/38672209449 成功：Linux 后端 149 passed、16 subtests；前端 22 项、23 既有类型错误/0 新增、构建通过。
- 生产 backend 镜像 sha256:f231fb404f6a7b9a297a9caa01ee4e8431ef327d34fceebd2e7f1f7466a174f9；worker sha256:827d81580edf1ac6b3963f37ce54682cee3489579536b7fb376912ef48c79eeb；frontend sha256:c7b80438eacc7b88ea49e07e05dd09b30cfac7c159f07a89997437e0a82e9970。后端 healthy、三 worker 运行；nginx -t 通过，四进程启动日志 Traceback/UndefinedColumn/UndefinedTable/ImportError 均 0。
- 新镜像内真实手动 HTTP 接口（TestClient、仅该隔离进程覆盖鉴权/临时媒体目录）验证：1597553 字节 GIF，以 300000 字节为目标，输出 258959 字节、target_met=true；原件保留、两个文件均动画多帧可读，全局默认仍为 500000 字节。无正式用户/测试数据/媒体写入；这不等于浏览器登录后公网上传验收。
- 公网 /api/v1/health、/studio/other、/studio/cad、/studio/gif 均 200；匿名手动接口 401；公开模板 API 200。实际 index-DugxzFow.js / OtherToolsPage-DkIMv4t5.js / GifCompressPage-DE_145Si.js 含新入口与压缩页面文案。未执行登录浏览器视觉验收。
- 备份：服务器 /www/backup/qmdh-release-20261015-other-gif；本机 E:/backups/QMDH-web/release-20261015-other-gif。production.env/database.dump/清单/零增量媒体已下载；旧四个媒体包本机硬链接复用此前已完整读取验证的链，5743 文件无变化；恢复顺序沿用 video-gif-release 记录，再覆盖本次零增量包。
- 本次数据库 dump SHA256 7705f67935885bb1c90929eea531adc05bb6e65d4f25b416f00820db60daa736，经 pg_restore --list 检查（未重复完整恢复）；env 前后 SHA256 均 9ee1cc783bbc975ab76106a43fe194af37e915cd832cf36cee277b5e6bd2a22e；媒体零增量包 a7017484d7c81cbde85c20051c4986dd898258dcbf1cab80dfd432cb53ef9b66。
- 旧镜像 qmdh-release-backup-{backend,worker,frontend}:20261015-other-gif 保留。发布前活跃任务 0；无迁移、不重建数据服务；原生产四文件 Nano Banana 差异及 CadExtractPage 与 f499e6b1 相比无变化，配置/key/卷/18010 未动。本地原 styles.css 13 行和未跟踪文件不混入提交。

Safe to hand off: Yes。此前视频/GIF 服务发布记录见 handoff-2026-10-15-video-gif-release.md。
