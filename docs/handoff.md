# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-16] CAD 布置前确认第一阶段 — WIP 待发布

- 新分支 codex/cad-layout-preparation，落实两点尺度校准、明确功能/保留空白、手动主通路家具禁放；原件/图像/既有方案/撤销历史保留。payload_json 存条件/签名，无迁移，新布置须确认，旧记录不自动重跑。
- 后端新增专项与原 CAD 测试通过，前端 32 项/0 新增类型错误/构建通过；隔离浏览器实际点选、填写、选择、画通路、保存/恢复成功，截图私有备份 preparation-ui-preview.png（模拟保存，真实 HTTP 持久/归属由隔离后端测试覆盖）。不声称正式登录 UI 验收。
- 备份 /www/backup/qmdh-release-20261016-cad-preparation 与 E:/backups/QMDH-web/release-20261016-cad-preparation 已配对校验；5773 媒体/9 文件增量 3050634 字节完整读取，旧媒体链与 ODA 包硬链接保留。production.env 与前次生产配置逐字节相同，旧三服务镜像标签保留。
- 后续：提交/推送、Linux CI、镜像构建后隔离验收，再发布与健康/路由/ODA 检查。原样式 13 行、比较文档、临时文件与生产历史差异继续保护。
- 边界：仅手动预留家具禁放带，墙体连通、门洞、核心筒识别、容量与目标型方案未实现；界面明确说明。
- Safe to hand off: Yes（已记录 WIP）。

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
