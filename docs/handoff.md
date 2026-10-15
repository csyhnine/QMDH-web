# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-15] GIF 原始与结果实际参数 — 本地完成，待发布

- 新增只读测量接口，选文件后显示原始尺寸/平均 fps/实际用色等参数，结果并排对照。
- 新记录元信息复用 compression JSON；旧记录详情按需读取原件/结果，先验所有权、不改写历史，无迁移。
- 参数读取预算/并发受限、繁忙/不可读明确提示；详见 archive/handoff-2026-10-15-gif-media-info.md。原样式/临时文件/生产差异保护继续。
- Safe to hand off: Yes（待发布）。

### [2026-10-15] 其他导航一致性与 GIF 复制 — 已部署

- 生成页独立侧栏漏改旧图纸名称，现与 AppShell 共用其他入口。
- 当前结果/历史详情可复制原件和参数到压缩区，用户改参后生成新记录，保留原记录；无后端/迁移。
- 前端 30 项/23 既有类型错误、0 新增/构建通过，详见 archive/handoff-2026-10-15-gif-copy-navigation.md。原样式/临时文件及生产差异保护。
- 功能 f18b5d6 已推送 main、生产合并 ce56c34d，仅前端镜像重建发布；后端/worker 镜像保持，正式迁移仍 f7g8h9i0j1k2。公网新包/入口/健康、nginx 检查通过，未宣称登录浏览器点击验收。
- 配对备份 release-20261015-gif-copy 两端校验，5762 媒体/本次增量 8 文件完整读取；旧前端镜像标签保留，生产 env 未改。
- Safe to hand off: Yes。

### [2026-10-15] GIF 持久历史与资产库 — 已部署

- 旧压缩仅写媒体/React state 未入库，现新增账号归属记录、最近历史/详情、资产库 GIF 分类和回链；未达标/无需处理结果同样登记。
- 迁移 f7g8h9i0j1k2 新增独立表，旧业务表不变；旧未知归属媒体不自动补录。详见 archive/handoff-2026-10-15-gif-history.md。
- 功能 9b89b53 已推送，生产运行合并 e6d98efa，迁移 f7g8h9i0j1k2；CI Linux 156 passed/16 subtests、前端 27 项/23 既有、0 新增类型错误/构建通过。
- 配对备份 release-20261015-gif-history 下载/校验；完整恢复的隔离 PostgreSQL 验证迁移与真实压缩入库/新 session 回读/资产库/跨账号隔离，随后删除隔离库，未向正式库写测试记录。公网新包/历史鉴权/库分类/健康通过，无登录浏览器交互声明。
- 分支 codex/gif-persistent-history，原样式/比较文档/_tmp_* 与生产四文件差异保护继续。
- Safe to hand off: Yes。
