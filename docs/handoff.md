# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-16] 系统通路建议与人工修改 — 已部署

- 分支 codex/cad-auto-circulation；新只读 route-suggestions 生成入口分区/接待/大分区起点至可达分区的通路树，完整宽度避让墙柱/已知核心筒；未识别入口、不可达、缺墙图明确提示，不自动保存或穿墙补线。
- 用户可预览采用、指定起点、手画、删除、修改折点/宽度；采用只换 system，manual/旧无来源保留，改后的系统通路转 manual。旧条件签名兼容，无迁移，尺度/用途确认保留。
- 本地后端 181 passed/1 skipped/16 subtests（新增 9 项），前端 34 项/23 既有、0 新增类型错误/构建通过。事件级组件测试覆盖移点/改宽/保留手画/取消；cua 连接因 kernel assets 路径报错，本轮无真实浏览器点击验收。
- 配对备份 release-20261016-cad-auto-route 两端校验、5773 媒体/空增量；restore-media-chain.json 引用前次完整包链，ODA 包仍在前次私有备份。env/key 不变，原文件/旧图/18010/数据卷保护。
- 23ccfa8 已提交/推送/部署，生产运行合并 f060300c。CI 38862908047 成功：Linux 182 passed/16 subtests，前端 34 项/0 新增类型错误/构建。隔离真实 HTTP 建议/不写记录/采用手画共存/保存/三方案避让/跨账号拒绝通过，家具 51/33/62。
- 真实 ce_1e513e72a64e 只读副本以既有估算比例与 1.2 米试跑：两平面均 partial，建议 2/1 条、连通 1/1 分区、未连通 4/2，6.6/3.52 秒；SQL READ ONLY＋媒体只读挂载，正式 payload 不变。不能宣称已生成完整交通系统，下一步需用户确认真实尺度/入口/门洞。
- backend healthy/三 worker/新前端运行；公网六条 CAD 路由直接 401、建议接口未登录 401、健康 200、CadExtractPage-CIOFm6h9.js 含新界面；ODA/Xvfb/FFmpeg 保留、迁移 f7g8h9i0j1k2、env/key 不变。详见 archive/handoff-2026-10-16-cad-auto-route.md。
- Safe to hand off: Yes。

### [2026-10-16] CAD 布置前确认第一阶段 — 已部署

- 新分支 codex/cad-layout-preparation，落实两点尺度校准、明确功能/保留空白、手动主通路家具禁放；原件/图像/既有方案/撤销历史保留。payload_json 存条件/签名，无迁移，新布置须确认，旧记录不自动重跑。
- 后端新增专项与原 CAD 测试通过，前端 32 项/0 新增类型错误/构建通过；隔离浏览器实际点选、填写、选择、画通路、保存/恢复成功，截图私有备份 preparation-ui-preview.png（模拟保存，真实 HTTP 持久/归属由隔离后端测试覆盖）。不声称正式登录 UI 验收。
- 备份 /www/backup/qmdh-release-20261016-cad-preparation 与 E:/backups/QMDH-web/release-20261016-cad-preparation 已配对校验；5773 媒体/9 文件增量 3050634 字节完整读取，旧媒体链与 ODA 包硬链接保留。production.env 与前次生产配置逐字节相同，旧三服务镜像标签保留。
- cfdccca 已提交/推送，生产运行合并 5ac68b6e；CI 38846063107 成功：Linux 173 passed/16 subtests，前端 32 项/23 既有、0 新增类型错误/构建通过。新镜像隔离 SQLite/临时媒体 HTTP 保存/读取/三方案生成/改宽后旧方案保留/跨账号拒绝通过，家具 44/29/55 件且全轮廓避让通路、原 mask 不变。
- backend healthy/3 worker/新前端已发布；公网六条 CAD 路由直接 401、健康 200、新 CadExtractPage-BYY76q7I.js 含新界面；ODA/Xvfb/FFmpeg 仍存在，Alembic 仍 f7g8h9i0j1k2，env SHA256 cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f 不变。原样式 13 行、比较文档、临时文件与生产历史差异保护。详见 archive/handoff-2026-10-16-cad-preparation.md。
- 边界：仅手动预留家具禁放带，墙体连通、门洞、核心筒识别、容量与目标型方案未实现；界面明确说明。
- Safe to hand off: Yes。

### [2026-10-16] CAD 布置按钮超时 — 已修复外层代理

- 浏览器缓存补救：用户刷新仍失败；日志证实 Chrome 继续请求 /extracts/?limit=20，返回 307 到 HTTP。前次 301 已被缓存。现在使用 rewrite ... break 内部去尾斜杠，查询参数保持，不向浏览器再跳转；六个列表/详情路由均直接 401、健康 200。只读脚本加入带尾斜杠/limit=20 覆盖。当前可连接浏览器无现有标签/登录态，不能宣称登录 UI 验收。
- 后续纠错：初版 location 尾斜杠让列表 /extracts 被 301 加斜杠，后端又 307 跳 HTTP 去斜杠，引发混合内容/循环跳转。已去掉 location 尾斜杠，列表含查询/详情均直接 401，健康 200；scripts/check-cad-proxy.sh 固定覆盖这些只读路径。旧版只查详情与健康，验收覆盖不足。
- ce_1e513e72a64e 两次 fitout 在后台耗时 74214/74956ms 并返回 200，但宝塔 60s 返回 504；正式库已存 floor 1 的三套方案/默认 104 家具。没有重跑/修改正式 CAD 数据。
- 新增 ops/nginx/cad-extracts.conf；安装到宝塔 extension/120.79.227.11/qmdh-cad-extracts.conf，仅 /api/v1/cad/extracts 前缀等待 300s，与内层一致。nginx -t/-T、平滑 reload、公开 CAD 未登录 401/健康 200 通过；未再次调用耗时写接口。
- 方案代码仍为沿墙/主家具/网格，生成成功后出现切换，按通过状态与 loss 选默认；刷新可读取已保存结果。
- 配置备份 /www/backup/qmdh-cad-timeout-20261016 与 E:/backups/QMDH-web/cad-timeout-20261016；回退移出新增 extension conf 后 nginx -t/reload。不改镜像/env/数据库/媒体/18010，原未提交样式等保护。
- 分支 codex/cad-proxy-timeout；Safe to hand off: Yes。
