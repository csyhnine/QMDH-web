# 2026-10-15 GIF 推荐预设与批量

- 用户要求以 500KB 为目标，参考 720×720→344×344、25→12.5fps、96 色调色板与抖动，加入批量。
- 默认最长边 344、帧率上限 12.5、颜色上限 96；保留 Lanczos 等比缩放/不放大，Bayer 抖动。自动上传设置默认值/手动 schema/界面/.env.example 对齐，显式服务器配置仍优先，不修改生产 .env。小于目标原件仍直接保留。
- 原有逐档颜色/帧率/尺寸适应目标、20 秒软预算、两并发限制、原件保留、动画/循环/时长/透明校验与最佳结果回退不变；降帧档位改为 12.5/10/8/质量下限。参数仍可改，复杂文件不保证在质量/时间限制内必达标。
- 手动工具最多 20 文件，单件 20MiB、总计 100MiB。批量逐个读文件/POST，失败续跑，逐件状态/选择预览/原件与结果下载；成功处理结果（含未达标）可 ZIP 打包，按序号避免同名覆盖，清理路径分隔符，fflate 按需加载、ZIP store 模式避免重复压缩 GIF。无新批量 API/服务/数据库表。
- 卸载后忽略在途响应、不再读取/上传后续文件；浏览器关闭不承诺后台继续。参数变化清空旧结果、处理/下载期间禁止替换输入；已有原件预览 URL 生命周期回收保留。
- 本地完整后端 152 passed、1 skipped、16 subtests。新增真实 FFmpeg 25fps 降帧测试在无限/有限/不循环三场景验证 720×360→344×172、8→4 帧、40→80ms、总时长不变、每帧不超过 96 色；原目标 500KB/透明/失败回退等回归通过。
- 前端 26 tests、23 个既有类型错误/0 新增、构建通过；新增批量边界、顺序执行/失败续跑、卸载阻断、ZIP 内容/重名/中文名/下载失败检查。
- 本地原 styles.css 13 行、比较文档/_tmp_* 均未覆盖/提交；CAD/key/卷/18010 保持。基于 8332a74，分支 codex/gif-batch-presets。

## 发布与验证

- 功能 1fc9174ec5c12b4a27f9713338ced3130410be1c 已推送 main；生产运行代码合并 0449ec4bd8ade6c0d7adb5852325b77cb7781679。后续纯文档合并不重建镜像。
- CI https://github.com/csyhnine/QMDH-web/actions/runs/38673930113 成功，Linux 153 passed、16 subtests；前端 26 tests、23 既有/0 新增类型错误、构建通过。
- 线上后端默认值确认 344/12.5/96、目标 500000；原 .env 未显式覆盖三个默认参数，无需改环境。前后 SHA256 均 9ee1cc783bbc975ab76106a43fe194af37e915cd832cf36cee277b5e6bd2a22e。
- 运行容器内临时媒体目录/仅该隔离进程鉴权覆盖的 TestClient 真实默认请求：720×720、8 帧/40ms、5707655 字节 → 344×344、4 帧/80ms、488082 字节，总时长同为 320ms、loop=0、target_met=true、原件保留；无正式用户/媒体测试数据遗留，不冒充浏览器登录上传交互。
- backend 镜像 sha256:fd199d7a2cb34c0cad7510a365f18019fde2bbfd5015ce7d11648e40d9707280；worker sha256:29f80fbe64216e0b92db54d5160f2d593e0f896f8d598d5589dd841bf09983cc；frontend sha256:a2024f48b94ade7bc5c2efa655fb05c626e0881e09a85bc70d032804ba9add3e。后端 healthy、三 worker/前端运行，nginx -t 通过。
- 公网健康及 /studio/gif、/studio/other、/studio/cad 均 200，匿名 POST 手动接口 401；实际 index-CT0w4HWv.js → OtherToolsPage-tTdqvoQM.js → GifCompressPage-s5giUmLH.js 含批量上传/打包下载/Lanczos/Bayer/默认参数。未进行登录浏览器视觉和点击验收。
- 备份目录：服务器 /www/backup/qmdh-release-20261015-gif-batch，本机 E:/backups/QMDH-web/release-20261015-gif-batch；配置/数据库/媒体增量 SHA256 两端一致，目录与配置权限受限。
- 数据库 dump c9c4640a89c746ee8f61cf975eb0b913aa66eabf97f6a4ad4b78e407e9aa2fad，经 pg_restore --list 检查，本次无迁移；媒体 5745 文件，本次增加 2 文件 14752007 字节，增量完整读取并匹配清单，SHA256 38a90613d15a0bf2360e8d47065ddb99b83a87c787f3be1e836185b75cfe665f。旧媒体链本机硬链接保留，恢复顺序为 video-gif-release 中四包 → other-gif 零增量包 → 本次 media-delta-gif-batch.tar.gz，再配对本次数据库/配置。
- 旧镜像 qmdh-release-backup-{backend,worker,frontend}:20261015-gif-batch 保留；发布前活动任务为 0，无迁移/数据服务重建；生产四文件历史差异及 CadExtractPage 相比 d0d099a3 未改，本地原 styles.css 13 行/比较文档/_tmp_* 仍保留。

Safe to hand off: Yes。

