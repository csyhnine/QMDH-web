# 2026-10-15 GIF 原始与结果实际参数

- 用户反馈看不到原始 GIF 参数。此前仅显示字节大小和可编辑初始上限，未回传真实媒体参数。
- 新增鉴权只读 POST /assets/gif-inspect，校验 data_url/20MiB，复用 Pillow 全帧检查、5 秒预算/帧与解码像素限制及两处理名额；无媒体文件或 DB 记录写入。繁忙 503、无效/预算 422。选中当前文件后异步显示原始信息，切换/卸载忽略旧响应。
- GifInfo 可选统计每帧 RGBA 实际颜色数上界（超过 256 显式返回 null 表示超过），不是调色板容量/请求颜色上限；帧率按帧数/单轮总时长计算并标记可变帧率，单帧显示静态；循环区分不循环/无限/有限，保留透明标记。
- 手动压缩 response 增 source_info/output_info，并写入原 compression JSON，既有表/迁移不变。新记录 GET 直接返回已存测量；旧记录详情 inspect_metadata=true 在 owner 检查后读已有原件/结果补响应，不改写旧 DB、列表不批量解码。参数读取失败显示不可用，不使已验证结果丢失。
- 结果区并排显示原始/结果实际尺寸、平均 fps、每帧最多用色、帧数、单轮时长、循环/透明；输入区选文件即可读原始值。说明实际用色可能少于设置上限。
- 自动上传压缩既有行为保留，基础 _inspect 默认不额外统计颜色；最小延迟初始值修正为允许时长上界，以正确处理慢于 1fps 的 GIF。
- 覆盖变帧率 40/80ms→16.67fps、实际 256 色、有限循环、只读不存、繁忙/无效文件、元信息持久、旧详情按需/不写回与跨账号不读文件；前端实际参数/循环/静态/不可用渲染回归。
- 分支 codex/gif-media-parameters，基于 74e58ba；原 styles.css 13 行/比较文档/_tmp_*，生产四文件与 CAD/key/卷/18010 保护继续。

- 本地后端全量 157 passed/1 skipped/16 subtests；前端 31 项、23 既有类型错误/0 新增、构建通过。

## 发布与验证

- 功能 1997c3fbd54dea858169d7396976cd154733d4c0 已推送 main；生产运行代码合并 cd60dab3cd98d8b718a94e2a2a71053284f02467。无 DDL 迁移，正式 head 仍 f7g8h9i0j1k2；后续文档同步不重建镜像。
- CI https://github.com/csyhnine/QMDH-web/actions/runs/38716496139 成功，Linux 158 passed/16 subtests，前端 31 tests/23 既有类型错误/0 新增/构建通过。本地补跑新只读接口未登录 401 断言通过。
- 新镜像独立 TestClient、临时媒体与 SQLite 验证：读取参数不登记文件/历史；真实原件 720×720、8 帧、25fps、256 色、320ms、loop=0；压缩结果 344×344、4 帧、12.5fps、63 色、320ms、loop=0，5707655→488082 字节且达标；新历史读回元信息一致，移除旧记录元信息后按原件/结果补读一致。未使用或写入正式 DB/媒体，日志 verify-info.log 两端保留。
- backend 镜像 sha256:631700241b653d9584ee1d06c713be4181a435e4a7f6cfba3805ca019c61e6c8；worker sha256:4658618d2ca0937c6fb68366a89405f59373253f6f585008f041ead74ce5c635；frontend sha256:8c75553dafb13e82d9f055bbd6e4dd5e05a372eb5186c47fe35e1c28e8893e29。后端 healthy、三个 worker/前端运行，nginx -t 通过，四类启动错误均 0。
- 公网健康及 /studio/gif、/studio/library、/studio/cad 均 200，匿名 POST /api/v1/assets/gif-inspect 为 401；实际 index-BqQOPG_C.js、GifCompressPage-IPokoQPO.js 含原始/结果参数、平均帧率、每帧最多用色与 source_info/output_info、新只读接口。未宣称浏览器登录点击验收。
- 备份服务器 /www/backup/qmdh-release-20261015-gif-info；本机 E:/backups/QMDH-web/release-20261015-gif-info，配置/DB/媒体增量下载并与服务器 SHA256 清单一致、权限受限。数据库 SHA256 47a75702bfa8c19ff65c5aeff4daca8079dc44391c1d51a63f08b83fde5072b1；pg_restore --list 通过（本次无迁移未重复完整恢复）。
- 媒体 5762 文件，比 gif-copy 无变化；零增量 SHA256 304a8e295c341e90182bd1ca4532c016dbfac5e54198ebeb14547a6b10120fef，完整读取检查通过。旧链本机硬链接保留，恢复沿用 gif-copy 链后覆盖 media-delta-gif-info.tar.gz，再配对本次 DB/配置。
- 旧镜像 qmdh-release-backup-{backend,worker,frontend}:20261015-gif-info 保留；回退代码保留新增 JSON 元信息，不删除业务记录。生产 env 前后 SHA256 都是 9ee1cc783bbc975ab76106a43fe194af37e915cd832cf36cee277b5e6bd2a22e。更新前活动任务为 0，数据服务不重建，生产四文件及 CAD 相对 de87cb84 保持；本地原 styles.css 13 行/比较文档/_tmp_* 未覆盖/提交。

Safe to hand off: Yes。
