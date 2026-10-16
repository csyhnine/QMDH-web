### [2026-10-16] 系统通路建议与人工修改 — 已部署

- 分支 codex/cad-auto-circulation；新只读 route-suggestions 生成入口分区/接待/大分区起点至可达分区的通路树，完整宽度避让墙柱/已知核心筒；未识别入口、不可达、缺墙图明确提示，不自动保存或穿墙补线。
- 用户可预览采用、指定起点、手画、删除、修改折点/宽度；采用只换 system，manual/旧无来源保留，改后的系统通路转 manual。旧条件签名兼容，无迁移，尺度/用途确认保留。
- 本地后端 181 passed/1 skipped/16 subtests（新增 9 项），前端 34 项/23 既有、0 新增类型错误/构建通过。事件级组件测试覆盖移点/改宽/保留手画/取消；cua 连接因 kernel assets 路径报错，本轮无真实浏览器点击验收。
- 配对备份 release-20261016-cad-auto-route 两端校验、5773 媒体/空增量；restore-media-chain.json 引用前次完整包链，ODA 包仍在前次私有备份。env/key 不变，原文件/旧图/18010/数据卷保护。
- 23ccfa8 已提交/推送/部署，生产运行合并 f060300c。CI 38862908047 成功：Linux 182 passed/16 subtests，前端 34 项/0 新增类型错误/构建。隔离真实 HTTP 建议/不写记录/采用手画共存/保存/三方案避让/跨账号拒绝通过，家具 51/33/62。
- 真实 ce_1e513e72a64e 只读副本以既有估算比例与 1.2 米试跑：两平面均 partial，建议 2/1 条、连通 1/1 分区、未连通 4/2，6.6/3.52 秒；SQL READ ONLY＋媒体只读挂载，正式 payload 不变。不能宣称已生成完整交通系统，下一步需用户确认真实尺度/入口/门洞。
- backend healthy/三 worker/新前端运行；公网六条 CAD 路由直接 401、建议接口未登录 401、健康 200、CadExtractPage-CIOFm6h9.js 含新界面；ODA/Xvfb/FFmpeg 保留、迁移 f7g8h9i0j1k2、env/key 不变。详见 archive/handoff-2026-10-16-cad-auto-route.md。
- Safe to hand off: Yes。
