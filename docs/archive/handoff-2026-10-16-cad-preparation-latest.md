### [2026-10-16] CAD 布置前确认第一阶段 — 已部署

- 新分支 codex/cad-layout-preparation，落实两点尺度校准、明确功能/保留空白、手动主通路家具禁放；原件/图像/既有方案/撤销历史保留。payload_json 存条件/签名，无迁移，新布置须确认，旧记录不自动重跑。
- 后端新增专项与原 CAD 测试通过，前端 32 项/0 新增类型错误/构建通过；隔离浏览器实际点选、填写、选择、画通路、保存/恢复成功，截图私有备份 preparation-ui-preview.png（模拟保存，真实 HTTP 持久/归属由隔离后端测试覆盖）。不声称正式登录 UI 验收。
- 备份 /www/backup/qmdh-release-20261016-cad-preparation 与 E:/backups/QMDH-web/release-20261016-cad-preparation 已配对校验；5773 媒体/9 文件增量 3050634 字节完整读取，旧媒体链与 ODA 包硬链接保留。production.env 与前次生产配置逐字节相同，旧三服务镜像标签保留。
- cfdccca 已提交/推送，生产运行合并 5ac68b6e；CI 38846063107 成功：Linux 173 passed/16 subtests，前端 32 项/23 既有、0 新增类型错误/构建通过。新镜像隔离 SQLite/临时媒体 HTTP 保存/读取/三方案生成/改宽后旧方案保留/跨账号拒绝通过，家具 44/29/55 件且全轮廓避让通路、原 mask 不变。
- backend healthy/3 worker/新前端已发布；公网六条 CAD 路由直接 401、健康 200、新 CadExtractPage-BYY76q7I.js 含新界面；ODA/Xvfb/FFmpeg 仍存在，Alembic 仍 f7g8h9i0j1k2，env SHA256 cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f 不变。原样式 13 行、比较文档、临时文件与生产历史差异保护。详见 archive/handoff-2026-10-16-cad-preparation.md。
- 边界：仅手动预留家具禁放带，墙体连通、门洞、核心筒识别、容量与目标型方案未实现；界面明确说明。
- Safe to hand off: Yes。
