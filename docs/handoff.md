# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-15] 新上传 GIF 自动压缩 — 本地完成，未部署

- 通用图片/聊天/Agent 内联上传复用 GIF 处理：默认以 500000 字节为目标，按颜色/帧率/尺寸逐档尝试，可配置目标和质量下限；上传响应返回实际大小及是否达标，保留原件；压缩更小且动画验证通过才返回派生路径，失败/超时/繁忙回退。
- 独立服务、20 秒软预算/两名额每 API 进程，Dockerfile/CI 安装 FFmpeg，无本功能迁移；当前生产后端仍需重建发布。
- 最终 GIF 专项 16 项（含真实 FFmpeg 的 500KB 目标达标测试）；后端全量 141 passed/1 skipped/16 subtests，前端 19 项/类型基线/构建通过，额外附件/存储 17 passed/6 subtests。详情见 archive/handoff-2026-10-15-gif-upload-compression.md。
- 保留原视频模板、反馈文档、styles.css、比较文档与 _tmp_*，无提交/push/部署。当前分支 feature/video-prompt-templates，整包发布仍需视频模板迁移。
- Safe to hand off: Yes。前次完整交接另存 archive/handoff-before-2026-10-15-gif-upload.md。

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
