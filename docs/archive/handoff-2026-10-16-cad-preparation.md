# CAD 布置前确认第一阶段（2026-10-16）

- 用户“按你想法做”，本阶段落实尺度确认、功能确认、手动主通路预留；自动核心筒/入口识别、通路连通/门洞/疏散校核、人数容量、目标型方案与综合评分重做仍属后续阶段，不声称已实现。
- 功能 cfdccca38870c91d823e3e5e5c9695eba5b8300e；服务器运行合并 5ac68b6e66ba6323d5abb9ee9529f53532194d0c。新 API POST /cad/extracts/{id}/preparation 按账号归属写既有 payload_json，无迁移；每层独立 calibration/room_kinds/routes。
- 两点至少 10 像素、实际米制长度与可支持比例限制；九种明确用途含 empty；最多 12 条通路、2–30 点、宽 0.8–4 米。面积/geometry/polygon/usable/撤销快照比例同步，原 DWG/DXF、mask、线图不变；保存不自动生成。
- 签名覆盖房间/几何/mask 与准备参数；读接口派生 current 不写 DB。房间编辑/撤销后条件失效须重确认；只改通路也会让旧方案与新签名不一致。旧方案仍保留展示，用户明确点击布置后更新；清除旧方案无需准备条件。
- 新布置不再自动 split_interior_walls；已确认的边界由用户修改后再确认。placeable grid 先清除通路带，三套家具生成后再按完整像素轮廓过滤，未确认隐藏小区域不推断用途。评分排除主动留空房间和通路占用面积；参考分不表示设计验收。
- 前端使用独立 CSS，未混入原 styles.css 13 行。CadPreparationPanel 隔离浏览器真实点选两点/输入长度/选用途/画通路/保存/恢复通过；预览保存用 mock，实际 HTTP 用新镜像临时 SQLite/临时媒体验证，未向正式库/媒体写测试数据。
- 后端新 11 项及原 CAD 31 项通过；CI https://github.com/csyhnine/QMDH-web/actions/runs/38846063107 成功，Linux 173 passed/16 subtests，前端 32 项、23 既有类型错误、0 新增/构建通过。
- 新镜像隔离真实 HTTP 保存/读取/生成三方案、全轮廓不侵通路、原 mask 不变、改宽后旧方案保留/标旧与跨账号拒绝通过；家具 wall/anchor/grid 为 44/29/55。verify-preparation.py/log 与 preparation-ui-preview.png 保存在私有配对备份，不入 Git。不宣称已登录生产 UI 点击。
- 部署：backend a8d2210edcd666cdb327348ac90f599b4dcaada936c61e8a962571bfe59a8268；worker 2cfde075b18d64e88aa1742506dfae425d940bdb383b3e4f3ffb066d458e2853（三副本）；frontend 3b01af097934c84780fe1b4e751b12c89724d8036ac7fcf3391fc59fbd543cc2。健康/六条 CAD 无重定向路由/公网新包通过；ODA/Xvfb/FFmpeg 保留。
- 无迁移，Alembic f7g8h9i0j1k2 不变；env SHA256 cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f 与备份逐字节一致，key 不动。原未提交文件、生产历史四文件差异、18010 和数据卷保护。
- 备份服务器 /www/backup/qmdh-release-20261016-cad-preparation，本机 E:/backups/QMDH-web/release-20261016-cad-preparation；5773 媒体、相对 linux-oda 增量 9 文件/3050634 字节，两端 SHA256 + 增量完整读取通过。恢复顺序：linux-oda 既有媒体链 → media-delta-cad-preparation.tar.gz，配对本次 database.dump/production.env，原官方 ODA 包硬链接保留。回退旧镜像 qmdh-release-backup-{backend,worker,frontend}:20261016-cad-preparation，不删除业务记录/媒体、不降迁移。

Safe to hand off: Yes。
