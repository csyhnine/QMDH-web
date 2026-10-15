# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.

---

## Latest Handoffs

### [2026-10-15] 视频模板与目标体积 GIF 压缩 — 已提交、推送、部署

- 功能 a655596、构建 55bd284 已推送 main，生产运行代码合并 1dadfc50。后端/三个 worker/前端已更新，迁移 e6f7g8h9i0j1，FFmpeg 7.1.5 可用，21 个旧图片模板保留。
- GIF 默认目标 500000 字节、配置可调。隔离 PostgreSQL 与运行容器上传链均验证 1597553→453484 字节；未向正式库写测试模板/用户，临时媒体目录清理。
- Linux CI 142 passed+16 subtests；前端 19 项、23 既有/0 新增类型错误、构建通过。公网健康/页面/API/新 bundle 与匿名上传 401 通过；未宣称登录后浏览器交互通过。
- 配对备份/旧镜像保留，5743 媒体文件恢复链完整读取校验；生产 .env 前后相同。原四文件 Nano Banana 差异保留，本地 styles.css 13 行/比较文档/_tmp_* 未提交。
- 详见 archive/handoff-2026-10-15-video-gif-release.md；后续纯文档同步不重建镜像。此前实现交接中的“未部署”已被本条覆盖。
- Safe to hand off: Yes。下一步继续反馈客户端真实产物、浏览器视觉与 IP 信任链专项。

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
