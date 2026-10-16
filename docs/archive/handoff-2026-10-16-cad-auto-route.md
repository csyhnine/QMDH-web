# 系统通路建议与人工修改（2026-10-16）

- 用户要求系统先生成，同时保留手画和修改权。功能 23ccfa8c3701541f4680b18ffbccee99170faf09，生产运行合并 f060300c5d7cb2b941349b6bbd44f9fcce8616d2。
- 新只读 POST /cad/extracts/{id}/route-suggestions 按账号归属验证，复用尺度/功能检查在深拷贝上计算；不保存建议或改正式媒体/记录。请求需两点校准、各区用途、宽度 0.8–4 米，可指定入口内侧起点。
- mask 微小分割缝做 5 像素闭合，原线图墙柱不闭合跨越；已知楼梯/电梯 bbox 排除；积分图做完整宽度方形净空侵蚀（保守），连通分量和四邻域 BFS 路径树连接可达分区。未知入口/缺图/太窄/不可达明确提示，未用穿墙直线补接。方形净空与线图可能保守拒绝实际可行门洞，需要实际图验收，非法规验证。
- 建议橙色预览→用户选择采用→保存条件→生成家具。采用只替换未修改 system，保留 manual/旧无来源；修改折点或宽度后转 manual。支持手画、删除、取消修改、点选起点/恢复系统建议；12 条/每条 30 点，不静默丢弃人工通路。宽度/起点输入作用于下一次建议或绘制，已有通路单独修改。
- 建议/提醒复用既有 preparation JSON，旧签名兼容；新 entry 非空才加入签名。保存 route_warnings，提示不等于实际门洞/疏散认证；三种家具策略仍共用用户确认网络。不自动覆盖旧条件或重算旧图。
- 本地完整 181 passed/1 skipped/16 subtests；新后端 9 项覆盖开口连接、封墙不可达、完整宽度、柱/核心筒避让、坏起点、入口未知、缺图、只读/归属。CI https://github.com/csyhnine/QMDH-web/actions/runs/38862908047 成功：Linux 182 passed/16 subtests，前端 34 项/23 既有类型错误、0 新增/构建。
- 组件事件测试覆盖只预览不替换手画、采用保留手画、改宽度、移动折点、取消。cua 因 kernel assets 路径缺失无法连接，本轮未宣称真实浏览器拖点/生产登录点击验收。临时预览 HTML 和自建 Vite 进程已清理，不碰 18010。
- 新镜像临时 SQLite/临时媒体真实 HTTP：建议→检查 DB 原样→采用手画共存→保存仍保留旧方案→三家具方案完整轮廓避让→跨账号拒绝通过，wall/anchor/grid 家具 51/33/62。verify-auto-routes.py/log 在私有配对备份。
- ce_1e513e72a64e 在新镜像内以 SQL READ ONLY/媒体只读挂载查询后深拷贝试跑，使用既有估算尺度和 1.2 米宽，未写正式数据：平面 1 用 6.6 秒、2 条建议、1 分区连通/4 未连通；平面 2 用 3.52 秒、1 条建议、1 连通/2 未连通，均 partial/入口分区建议起点。benchmark-auto-routes.py/log 保留。不能把这个结果描述成完整交通系统；仍需校准/确认入口和门洞，可手动修改。
- 运行镜像 backend b2b9e7d756d88eda9dd0ed7ddcab226f5bfca3074a59abe79451bab4045f47b2；worker 90ee213f60ec4fddc0856588a4cca65b12db74529ec3061ac4e6c805b098f645（三副本）；frontend 06ef118d52a1d76d054a888ff3aad9196d8c7567e805ce0a8e05ce8d57cc8e10。公网 CAD 新 chunk CIOFm6h9、列表/详情/建议鉴权、健康/启动日志通过；ODA/Xvfb/FFmpeg 保留。
- 无迁移，Alembic f7g8h9i0j1k2，env SHA256 cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f 不变。部署前 active tasks=0；原 styles.css 13 行/比较文档/_tmp_*、生产历史四文件差异、旧图/18010/数据卷保护。
- 配对备份 /www/backup/qmdh-release-20261016-cad-auto-route 与 E:/backups/QMDH-web/release-20261016-cad-auto-route，DB/config/5773 媒体清单/零增量两端 SHA256 校验；本次硬链接因旧受限文件 ACL 无子项继承失败，改为 restore-media-chain.json 显式引用 cad-preparation 下既有全链，ODA 官方包 SHA 再验通过。两个目录 ACL 修正为仅 Admin/SYSTEM (OI)(CI)F，旧包保留，不重新读取 14GB 基线或删除数据。
- 恢复顺序：restore-media-chain.json 的 cad-preparation 既有链 → media-delta-cad-auto-route.tar.gz，配对本次 database.dump/production.env；ODA 包仍在前次私有备份。旧三服务镜像标签 qmdh-release-backup-{backend,worker,frontend}:20261016-cad-auto-route 保留；回退不删/重置 DB/媒体/迁移。

Safe to hand off: Yes。
