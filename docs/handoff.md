# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-16] CAD 布置按钮超时 — 已修复外层代理

- 浏览器缓存补救：用户刷新仍失败；日志证实 Chrome 继续请求 /extracts/?limit=20，返回 307 到 HTTP。前次 301 已被缓存。现在使用 rewrite ... break 内部去尾斜杠，查询参数保持，不向浏览器再跳转；六个列表/详情路由均直接 401、健康 200。只读脚本加入带尾斜杠/limit=20 覆盖。当前可连接浏览器无现有标签/登录态，不能宣称登录 UI 验收。
- 后续纠错：初版 location 尾斜杠让列表 /extracts 被 301 加斜杠，后端又 307 跳 HTTP 去斜杠，引发混合内容/循环跳转。已去掉 location 尾斜杠，列表含查询/详情均直接 401，健康 200；scripts/check-cad-proxy.sh 固定覆盖这些只读路径。旧版只查详情与健康，验收覆盖不足。
- ce_1e513e72a64e 两次 fitout 在后台耗时 74214/74956ms 并返回 200，但宝塔 60s 返回 504；正式库已存 floor 1 的三套方案/默认 104 家具。没有重跑/修改正式 CAD 数据。
- 新增 ops/nginx/cad-extracts.conf；安装到宝塔 extension/120.79.227.11/qmdh-cad-extracts.conf，仅 /api/v1/cad/extracts 前缀等待 300s，与内层一致。nginx -t/-T、平滑 reload、公开 CAD 未登录 401/健康 200 通过；未再次调用耗时写接口。
- 方案代码仍为沿墙/主家具/网格，生成成功后出现切换，按通过状态与 loss 选默认；刷新可读取已保存结果。
- 配置备份 /www/backup/qmdh-cad-timeout-20261016 与 E:/backups/QMDH-web/cad-timeout-20261016；回退移出新增 extension conf 后 nginx -t/reload。不改镜像/env/数据库/媒体/18010，原未提交样式等保护。
- 分支 codex/cad-proxy-timeout；Safe to hand off: Yes。

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
