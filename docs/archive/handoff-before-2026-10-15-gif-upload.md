# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-14] 视频提示词模板库 — 本地完成，未部署

- 分支 feature/video-prompt-templates，基于 f1e2122；原反馈文档改动、styles.css 13 行、比较文档与 _tmp_* 保留，无提交/push。
- 视频模式开放模板库，按 media_type 区分图片/视频，公共浏览/搜索/套用和个人保存/编辑/删除复用原实现；后台新增用途选择与筛选。
- 视频模板只套用文字/风格/说明，保留当前视频模型、SKU/时长、画幅、分辨率及参考图；旧模板默认图片。迁移 e6f7g8h9i0j1，新增列不改旧内容。
- 验证及发布要求见 archive/handoff-2026-10-14-video-templates.md。未调用视频生成、未操作生产。前后端需同时发布并先迁移。
- Safe to hand off: Yes。此前三条完整交接另存 archive/handoff-before-2026-10-14-video-templates.md。

### [2026-10-13] 新对话继续开发交接与只读验收复核

- 最新只读验收详档：archive/handoff-2026-10-13-feedback-live-verification.md；冷启动红线与部署记录仍见 archive/handoff-2026-10-13-next-conversation.md。三个正式 ID 已独立确认启用，当前外部配置版本 0.2.4/0.2.5/0.1.1。
- 时间展示已部署（b619413），发布记录 cf9cf22；生产 git 0a41ad8c，运行前端 c994f59a，health/database/redis healthy。本次只留档，不重建镜像。
- skill-feedback-004 继续 IN_PROGRESS：最新真实事件 13/14/15（run_id=6）自报 23 张已查看图片、评测通过，尚缺实际产物/调用记录独立核验。当前客户端离线 14 tests OK；事件 13 缺 outcome=completed，未计完成次数。已通过 SSH 调用现有核实逻辑将测试 3/4 accepted，聚合到 issue_id=1（2 证据/1 匿名会话/0 实名），独立只读复查与审计通过。
- 下一步检查时间 UI（已登录标签可见，但工具读取超时）与 WorkBuddy 真实产物。服务器事件仅存摘录/指纹，无原文件地址。不要再次核实已 accepted 的 3/4，不重复登记/实现接口；真实 IP 信任链仍待专项核验。
- 保护原 styles.css 13 行、比较文档及 _tmp_*；不打印秘密，不改 CAD/key/卷/18010。完整红线和备份恢复链见详档。
- Safe to hand off: Yes。

### [2026-10-13] 反馈时间展示 — 已提交、推送、部署

- 聚合问题列表和详情补创建/更新时间；事件补发生/接收时间，复用 datetime 工具转换为北京时间并显示年月日时分秒。缺值显示未记录。
- API 已返回 created_at/updated_at/occurred_at/received_at，本轮仅补前端类型和展示，无后端或迁移。
- 文件：frontend/src/pages/admin/SkillFeedbackPanel.tsx、frontend/src/api.ts、frontend/scripts/test-feedback-security.mjs；测试夹具改为真实 UTC 格式，适配日期工具导入。
- 验证：npm run check，16 项通过，23 项既有类型错误、0 新增，Vite 构建通过。
- 只读生产查询发现最新事件 10/11/12 是大岗镇检索交付/文字评测/图片评测；发生北京时间 10-13 10:54:56，接收约 10:55:10；图片自评 pass=false、仅元数据核验。测试问题 3/4 仍 pending，未进行核实。
- 功能 b619413 已推送 main，生产合并 b04ffb53，仅更新前端。nginx、公网新包时间标签和健康检查通过；后端/迁移/key 未变。备份与详情见 archive/handoff-2026-10-13-feedback-time-release.md。原访客样式/比较文档/_tmp_* 保留；后台浏览器验收待续。
- Safe to hand off: Yes。
