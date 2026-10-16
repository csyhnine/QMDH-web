# 2026-10-16 Linux ODA 转换器接入

- 用户明确要求配置服务器转换器，本次授权覆盖旧的等待用户安装包/不自行下载安装暂缓；旧图不重跑、CAD 算法不改等保护继续。
- 只读核实生产 x86_64、Debian 13/GLIBC 2.41，ezdxf 1.4.4/Pillow/numpy/shapely 已有，DXF 内存解析/预览正常，缺的是 DWG 转换器/命令；生产仅有 1 条 DWG needs_conversion，不自动处理。
- 官方下载来源 https://www.opendesign.com/guestfiles/oda_file_converter → DEB（guestfiles/get?filename=ODAFileConverter_QT6_lnxX64_11dll.deb），取得 ODAFileConverter_QT6_lnxX64_11dll_27.9.deb，amd64，版本 27.9.0.0，72706244 字节，SHA256 12f5e14c55c35176062f63e242d5390f732722213dd685fa3cd44a6555384cd0。只使用官方源，不提供第三方镜像/不提交二进制。
- Dockerfile 增可选 CAD_ODA_PACKAGE/CAD_ODA_SHA256；包位于 backend/vendor/oda/ 并由 .gitignore 排除，缺省普通构建不安装。安装到后端/worker 镜像，Qt 系统依赖和 Xvfb/xauth 随镜像持久，不在宿主机安装 ODA。Compose 从 QMDH_CAD_ODA_* 构建参数传入。
- 新 wrapper 在私有 XDG_RUNTIME_DIR 与自动分配虚拟 X 显示中运行 ODA，固定 ACAD2018/DXF/非递归/审计。DWG 临时源名固定 source.dwg，用户文件名不进入 CLI。
- 原转换模板改为先 shlex.split 后替换参数，shell=False；POSIX Popen 独立进程组，超时 killpg 防止 ODA/Xvfb 残留。Windows 直接 exe 识别与缺配置 needs_conversion 仍保留。
- 无数据库迁移、无 CAD 分区/布置改动、旧图不重跑；原 styles.css 13 行/比较文档/_tmp_* 与生产四文件差异保护。

- 本地完整后端 161 passed/1 skipped/16 subtests，CAD 专项 31 passed。

实包验证与发布待续。
