# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-15] 其他导航一致性与 GIF 复制 — 本地完成，待发布

- 生成页独立侧栏漏改旧图纸名称，现与 AppShell 共用其他入口。
- 当前结果/历史详情可复制原件和参数到压缩区，用户改参后生成新记录，保留原记录；无后端/迁移。
- 前端 30 项/23 既有类型错误、0 新增/构建通过，详见 archive/handoff-2026-10-15-gif-copy-navigation.md。原样式/临时文件及生产差异保护。
- Safe to hand off: Yes（待发布）。

### [2026-10-15] GIF 持久历史与资产库 — 已部署

- 旧压缩仅写媒体/React state 未入库，现新增账号归属记录、最近历史/详情、资产库 GIF 分类和回链；未达标/无需处理结果同样登记。
- 迁移 f7g8h9i0j1k2 新增独立表，旧业务表不变；旧未知归属媒体不自动补录。详见 archive/handoff-2026-10-15-gif-history.md。
- 功能 9b89b53 已推送，生产运行合并 e6d98efa，迁移 f7g8h9i0j1k2；CI Linux 156 passed/16 subtests、前端 27 项/23 既有、0 新增类型错误/构建通过。
- 配对备份 release-20261015-gif-history 下载/校验；完整恢复的隔离 PostgreSQL 验证迁移与真实压缩入库/新 session 回读/资产库/跨账号隔离，随后删除隔离库，未向正式库写测试记录。公网新包/历史鉴权/库分类/健康通过，无登录浏览器交互声明。
- 分支 codex/gif-persistent-history，原样式/比较文档/_tmp_* 与生产四文件差异保护继续。
- Safe to hand off: Yes。

### [2026-10-15] GIF 推荐预设与批量 — 已部署

- 默认 344 像素/12.5fps/96 色，Lanczos 与 Bayer 抖动，目标 500KB、单次参数可改；新上传自动与手动默认对齐，显式环境配置优先。
- 批量 20 件/100MiB，顺序复用单件接口、失败续跑、逐件预览/状态、ZIP 下载；卸载不再提交后续文件，无迁移或后台任务。
- 本地后端 152 passed/1 skipped/16 subtests，前端 26 项/23 既有类型错误、0 新增/构建通过。详见 archive/handoff-2026-10-15-gif-batch.md。
- 分支 codex/gif-batch-presets；原 styles.css/比较文档/_tmp_* 与生产四文件差异保护继续有效。
- 功能 1fc9174 已推送，生产运行合并 0449ec4b；Linux CI 153 passed + 16 subtests、前端 26 项通过。运行容器真实 GIF 默认请求 5707655→488082 字节，344×344/4 帧/80ms/总时长 320ms/无限循环均正确；公网新包/入口/健康/匿名 401 通过，未宣称浏览器登录交互验收。
- 配对备份 release-20261015-gif-batch 两端校验，5745 媒体文件/本次增量 2 文件完整读取验证，旧镜像保留；生产 env 不变，图纸解析与四文件历史差异保留。
- Safe to hand off: Yes。
