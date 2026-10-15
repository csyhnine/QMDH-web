# 2026-10-15 视频模板库与 GIF 自动压缩发布

用户明确要求“提交并部署”。本档覆盖此前视频模板/GIF 交接中的“本地、未提交/未部署”状态。

## 提交与运行版本

- 功能 a655596ef7ee46219c378285930703dae808215d 已推送 GitHub main：视频模板类型/入口/管理及 500000 字节目标 GIF 压缩、回执与配置。
- 构建调整 55bd2842791cf6d2adc325eceb0dd3a47d7d8c29 已推送 main：Dockerfile 支持可选 DEBIAN_MIRROR 构建参数，并为 apt 增加重试/超时。默认 Debian 源在服务器下载缓慢，生产用 https://mirrors.aliyun.com 构建；没有修改宿主机源或生产 .env。
- 生产功能合并 d7e07fa1a7bc34ae5fb2422a22416cef6eb5420b；构建调整合并 1dadfc5097e73c68dad2fbf60a08c70c692731a6。前端镜像来自前者，后端/worker 镜像来自后者；后续纯文档合并不重建镜像。
- backend：sha256:adc151847514e0f800b94701464e36924ae278f84e6f0da2a8634d40588f15d1。
- worker：sha256:45927972005dffa023a45e60e0de2ecfe37d31070aacc44b88652efca52a2995（3 个实例）。
- frontend：sha256:010a38a1fcad750abbfcce8510bc4e6fb4cd86fa4c1725443a887783d5ae2c32。
- 正式迁移 e6f7g8h9i0j1；原有 21 个公共图片模板全部保留并标 image。视频模板库入口已上线，视频公共内容仍需管理员自行添加；本次没有向正式库写入模板夹具。
- FFmpeg 7.1.5-0+deb13u1 已在运行后端中可用。默认 GIF 目标 500000 字节，初始不限制尺寸/帧率，按配置允许自适应降低；参数可由服务器环境变量调整，暂无后台选项面板或独立达标提示。

## 备份、恢复与保护

- 服务器 /www/backup/qmdh-release-20261015-video-gif，本机 E:/backups/QMDH-web/release-20261015-video-gif；目录限制 Admin/SYSTEM 或服务器 700，配置 600。
- 配对 production.env 与 database.dump 已下载并校验 SHA256。生产环境文件前后完全一致：9ee1cc783bbc975ab76106a43fe194af37e915cd832cf36cee277b5e6bd2a22e；数据库 c49958aa1d3aaa51720457caaedb6bc119567309efa91c543a12ffdb0441da1d。
- dump 经 pg_restore --list 及隔离 PostgreSQL 完整恢复验证。隔离库 qmdh_verify_20261015_video_gif 已在验收后删除，临时连接 env 文件移除；未碰正式库凭证。
- 媒体快照 5743 文件，较 10-13 新增 1 文件、1097090 字节，无旧文件缺失。增量 media-delta-20261015.tar.gz 两端 SHA256 一致：2ac0180159a62298f3f76aac8e1ad88b84be0eb30f26bf887a6ac6fb1cb6b6a2。
- 本机硬链接复用此前媒体包，并完整读取全部四个 gzip/tar 包；5743 个当前文件的大小/mtime 恢复覆盖核验通过，结果 media-verification.json。
- 恢复顺序：media.tar.gz → media-delta.tar.gz → media-delta-20261013.tar.gz → media-delta-20261015.tar.gz，再配对数据库/配置。注意服务器未重复存放旧整包，本机保留完整链。
- 旧镜像标签 qmdh-release-backup-{backend,worker,frontend}:20261015-video-gif 保留。代码回退可沿用新增 media_type 列，不因回退删除业务数据或降级迁移。
- 原生产四文件 Nano Banana 历史差异与 0a41ad8c 逐项 git diff 验证未变；生产 git 用 admin 合并，无 reset/force push。
- 原 frontend/src/styles.css 13 行、比较文档及全部 _tmp_* 未提交、未覆盖。未改 CAD/key/数据卷/18010，未删除历史媒体；未中断生成任务（重启前再次确认 active tasks=0）。

## 验收证据

- GitHub CI 38668955243（功能）、38669341615（构建调整）均成功。后者 Linux 后端 142 passed + 16 subtests；前端 19 tests、23 个既有类型错误/0 新增、Vite 构建通过。
- https://github.com/csyhnine/QMDH-web/actions/runs/38669341615。
- 备份恢复的隔离 PostgreSQL 上先迁移，检查 21 个旧图片模板保留，视频个人模板创建/局部修改、公共模板创建成功；测试数据均只在隔离库。
- 新镜像及运行后端分别在临时媒体目录执行两条真实上传处理链：assets/reference-upload、chat/attachments/upload；合成 GIF 原 1597553 字节 → 453484 字节，两者 target_met=true，动画多帧可读。没有向正式媒体卷遗留测试文件或创建正式管理凭证/用户；这属于容器内上传处理验证，不冒充浏览器登录后的公网上传交互。
- 正式后端 healthy，3 worker/frontend running；nginx -t 通过，PostgreSQL/Redis healthy。
- 公网 /api/v1/health、/studio、/admin/templates、/studio/cad 均 200。公开模板 API 返回 21 个 image 模板，匿名 POST 上传仍 401。
- 公网实际 PromptTemplatesPage-buvMR1ve.js、GeneratePage-CHA7Kg7N.js 核对用途/media_type 等新功能；未声称完成已登录浏览器点击。
- 运行后端/三个 worker 最近启动日志的 Traceback、UndefinedColumn、UndefinedTable、ImportError 均 0。原反馈测试事件 2 not_required、3/4 accepted 且同 issue_id=1 未变化。

Safe to hand off: Yes。视频模板库与 GIF 上传压缩已上线。后续继续真实平台反馈验收、浏览器视觉与 IP 信任链专项，不自动扩展或执行新的生产采集。
