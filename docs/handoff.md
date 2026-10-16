# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-16] Linux ODA 转换器 — 已部署

- 用户新授权配置转换器，官方 Linux 27.9 已下载并校验；旧的等包限制由本次授权覆盖，其余旧图保护不变。
- 官方 ODA 27.9/Xvfb/Qt/OpenGL 已在后端与三个 worker 镜像持久接入，0346eee/b1532b1 已推送，生产运行合并 26095b9d；安全传参/超时进程组清理生效，无迁移/算法改动。
- 本地后端 161 passed/1 skipped/16 subtests + CAD 专项 31 passed；Linux CI 162 passed/16 subtests、前端 31 项/类型基线/构建通过。新公开 DWG 2018 转换保留 LINE/预览、隔离 HTTP 201/status=ok，运行后端转换复验通过；旧 ce_0abae8a9402f 仍 needs_conversion，未重跑/改正式记录。
- 配对备份 release-20261016-linux-oda 两端校验，5764 媒体/2 文件增量、官方包和日志保留；env 仅三个转换器键变化（key 不变），前端镜像不变，仅 nginx 平滑 reload。
- 分支 codex/linux-dwg-converter，详见 archive/handoff-2026-10-16-linux-oda.md；原样式/临时文件/生产四文件差异继续保护。
- Safe to hand off: Yes。

### [2026-10-15] GIF 原始与结果实际参数 — 已部署

- 新增只读测量接口，选文件后显示原始尺寸/平均 fps/实际用色等参数，结果并排对照。
- 新记录元信息复用 compression JSON；旧记录详情按需读取原件/结果，先验所有权、不改写历史，无迁移。
- 参数读取预算/并发受限、繁忙/不可读明确提示；详见 archive/handoff-2026-10-15-gif-media-info.md。原样式/临时文件/生产差异保护继续。
- 功能 1997c3f 已推送、生产运行合并 cd60dab3；无迁移，head 仍 f7g8h9i0j1k2。Linux CI 158 passed/16 subtests，前端 31 项/23 既有、0 新增类型错误/构建通过。
- 新镜像隔离媒体/SQLite 验证：720×720/25fps/256 色 → 344×344/12.5fps/63 色，320ms/无限循环保留，真实结果 488082 字节，元信息持久与旧历史补读通过。未向正式库/媒体写测试数据，公网新包/鉴权/健康通过。
- 配对备份 release-20261015-gif-info 两端校验、5762 媒体/零增量、旧镜像保留；生产 env/四文件历史差异和原样式等保护继续。
- Safe to hand off: Yes。

### [2026-10-15] 其他导航一致性与 GIF 复制 — 已部署

- 生成页独立侧栏漏改旧图纸名称，现与 AppShell 共用其他入口。
- 当前结果/历史详情可复制原件和参数到压缩区，用户改参后生成新记录，保留原记录；无后端/迁移。
- 前端 30 项/23 既有类型错误、0 新增/构建通过，详见 archive/handoff-2026-10-15-gif-copy-navigation.md。原样式/临时文件及生产差异保护。
- 功能 f18b5d6 已推送 main、生产合并 ce56c34d，仅前端镜像重建发布；后端/worker 镜像保持，正式迁移仍 f7g8h9i0j1k2。公网新包/入口/健康、nginx 检查通过，未宣称登录浏览器点击验收。
- 配对备份 release-20261015-gif-copy 两端校验，5762 媒体/本次增量 8 文件完整读取；旧前端镜像标签保留，生产 env 未改。
- Safe to hand off: Yes。
