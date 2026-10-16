# 2026-10-16 Linux ODA 转换器接入

- 用户明确要求配置服务器转换器，本次授权覆盖旧的等待用户安装包/不自行下载安装暂缓；旧图不重跑、CAD 算法不改等保护继续。
- 只读核实生产 x86_64、Debian 13/GLIBC 2.41，ezdxf 1.4.4/Pillow/numpy/shapely 已有，DXF 内存解析/预览正常，缺的是 DWG 转换器/命令；生产仅有 1 条 DWG needs_conversion，不自动处理。
- 官方下载来源 https://www.opendesign.com/guestfiles/oda_file_converter → DEB（guestfiles/get?filename=ODAFileConverter_QT6_lnxX64_11dll.deb），取得 ODAFileConverter_QT6_lnxX64_11dll_27.9.deb，amd64，版本 27.9.0.0，72706244 字节，SHA256 12f5e14c55c35176062f63e242d5390f732722213dd685fa3cd44a6555384cd0。只使用官方源，不提供第三方镜像/不提交二进制。
- Dockerfile 增可选 CAD_ODA_PACKAGE/CAD_ODA_SHA256；包位于 backend/vendor/oda/ 并由 .gitignore 排除，缺省普通构建不安装。安装到后端/worker 镜像，Qt 系统依赖和 Xvfb/xauth 随镜像持久，不在宿主机安装 ODA。Compose 从 QMDH_CAD_ODA_* 构建参数传入。
- 新 wrapper 在私有 XDG_RUNTIME_DIR 与自动分配虚拟 X 显示中运行 ODA，固定 ACAD2018/DXF/非递归/审计。DWG 临时源名固定 source.dwg，用户文件名不进入 CLI。
- 原转换模板改为先 shlex.split 后替换参数，shell=False；POSIX Popen 独立进程组，超时 killpg 防止 ODA/Xvfb 残留。Windows 直接 exe 识别与缺配置 needs_conversion 仍保留。
- 无数据库迁移、无 CAD 分区/布置改动、旧图不重跑；原 styles.css 13 行/比较文档/_tmp_* 与生产四文件差异保护。

- 本地完整后端 161 passed/1 skipped/16 subtests，CAD 专项 31 passed。

## 发布与实包验证

- 功能 0346eee7f9b8902a984020740f8c4f112c2c1a28、缺失 libOpenGL.so.0 的运行库修复 b1532b134cee7d0d0dfc66c167881ca4b54fb4f1 已推送 main。生产运行代码合并 26095b9d98368ca3b493e247d081a6b61903fed7；后续文档同步不重建镜像。
- 官方安装包版本 27.9.0.0，Qt/OpenGL/XCB/Xvfb/xauth 依赖均装在 backend/worker 镜像。后端 sha256:62822926808f881129bda923e6a7d096086e7ece841e5dd5d7985e86754d0549；worker sha256:ab147d77c250ef1871b31db50ad51c4cd689237758082c3caa87b45f31722310。前端仍 sha256:8c75553dafb13e82d9f055bbd6e4dd5e05a372eb5186c47fe35e1c28e8893e29，只平滑 reload nginx 重新解析 backend 地址。
- 验收使用新公开标准 DWG，不用任何旧用户图纸：LibreDWG 官方仓库 test/test-data/2018/Line.dwg，来源 https://github.com/LibreDWG/libredwg/blob/master/test/test-data/2018/Line.dwg；27982 字节，SHA256 1f4edd4c11aaf28b3295fd69fa59376f9cb911c637aa47a6073408ecac4797a3。快照在私有备份 reference-line-2018.dwg，不入 Git。
- 新镜像隔离 SQLite/临时媒体验证：DWG→DXF→既有解析保留 1 个 LINE 实体、生成 1 张楼层预览；真实 FastAPI TestClient POST /cad/extract 返回 201/status=ok，转换字段/楼层/记录齐全。测试 DB/媒体临时目录清理，无正式测试用户/记录/媒体写入。运行后端再用同份新公开 DWG 内存转换/解析验证通过。未宣称浏览器登录后真实业务图验收通过。
- ODA 生成 DXF 的恢复处理沿用既有 dxf_reader，不改几何/分区/布置逻辑；不把仅生成文件当验收。此标准样例通过不代表所有天正/中望自定义对象都能完整解析，原转 T3 提示保留。
- CI https://github.com/csyhnine/QMDH-web/actions/runs/38841810410 成功：Linux 后端 162 passed/16 subtests，前端 31 项/23 既有类型错误、0 新增/构建通过。CAD 专项本地 31 passed，新增安全模板/超时/缺省/虚拟显示测试进入统一后端检查。
- 备份服务器 /www/backup/qmdh-release-20261016-linux-oda；本机 E:/backups/QMDH-web/release-20261016-linux-oda。含旧 production.env、新 production-after.env、配对数据库、媒体清单/增量、旧镜像/git、官方 .deb、公开样例与 verify-oda.py/log，两端 SHA256 校验、增量完整读取通过、权限受限。
- 数据库 dump SHA256 31cca1464b1cf2cc71e2f28e98efdd6f7122e9f4cc4c79e2e9cf3213319d1212，pg_restore --list 检查通过；无迁移，正式 head 仍 f7g8h9i0j1k2。媒体快照 5764 文件，相比 gif-info 增加 2 文件/14746579 字节，增量 SHA256 f3a629e82bb2fc636b6f6acbd8d48e6d76c3fefdcc85043435aa944b98e88099；恢复顺序为 gif-info 既有链 → media-delta-linux-oda.tar.gz，再配对相应 DB/环境。
- 环境仅添加/更新 QMDH_CAD_ODA_PACKAGE、QMDH_CAD_ODA_SHA256、QMDH_CAD_DWG_CONVERTER_CMD；本机与服务器都逐行确认排除三键后与旧 env 完全一致，含 QMDH_ENCRYPTION_KEY。旧 env SHA256 9ee1cc783bbc975ab76106a43fe194af37e915cd832cf36cee277b5e6bd2a22e，新 env cca2d6f79f121cd430fbc5b1c81d1cb45fdea49c488fb590d62b2afc1772a59f。本次有授权配置变化，不能再把 env 完全不变当验收要求。
- 回退标签 qmdh-release-backup-{backend,worker}:20261016-linux-oda 保留；回退必须旧镜像与旧 production.env 配对（老镜像无新 wrapper），不重置 DB/媒体、不降级迁移。官方包另存 /www/backup/qmdh-cad-packages，项目 vendor/oda 下包由 Git 忽略。
- 发布前 active tasks=0，后端 healthy、3 worker 运行，后端/worker 均确认转换器已配置且可执行；公网 /api/v1/health、/studio/cad、/studio/gif 为 200，启动四类错误均 0。正式 CAD 仍仅 ce_0abae8a9402f/dwg/needs_conversion；旧记录未自动转换或修改。
- 生产四文件 Nano Banana 历史差异与 CAD UI 保持；原 styles.css 13 行、比较文档/_tmp_* 未覆盖/提交；18010/加密 key/历史媒体/数据卷未动。宿主机未安装 ODA，没有重建数据库/Redis/前端镜像。

Safe to hand off: Yes。
