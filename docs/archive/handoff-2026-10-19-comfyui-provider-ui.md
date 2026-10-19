# Handoff archive

### [2026-10-19] ComfyUI 图片渠道显示修复 — 已发布

- 用户反馈图片模型显示视频；数据库/API能力image.generate正确。漏掉前端comfyui登记，后台getAdapterOption把未知类型落到首项Haodeya视频；Studio图片白名单也缺ComfyUI，原API真实生成验收没有覆盖前端入口。这是本轮修复范围。
- 新分支codex/comfyui-image-channel-fix：登记ComfyUI本机图片；未知adapter保留原标识/规划中；支持文生图列表且本机ComfyUI独立来源分组，保留能力检查，视频/未开放编辑不显示。Haodeya/Grok名称只有同时具备video.generate才可分到视频组，避免图片渠道因名称被误标。真实ModelsPage组件与Studio derived菜单回归已加入，原styles13行不提交。46项前端回归通过、23既有TS错误/0新增、构建通过；01d6c11/13bbe74已发布，生产合并ae2901af，仅frontend镜像623a1841；backend/worker/FRP/DB/cache/search ID/启动时间与env保持，未重跑GPU。公网ModelsPage-CTuUDlVF.js及studioTaskSubmissionActions-DBF-XrvR.js与容器SHA一致，入口index-Ll-Dz75_.js，health/六CAD路由通过。

- 发布备份 /www/backup/qmdh-release-20261019-comfyui-provider-ui 与本机 E:/backups/QMDH-web/release-20261019-comfyui-provider-ui：DB/env/5802媒体清单、0媒体增量及完整恢复链引用、运行快照/公网证据，13文件SHA一致；旧frontend镜像qmdh-release-backup-frontend:20261019-comfyui-provider-ui可回退。原styles13行、比较文档与_tmp_*保留。Safe to hand off: Yes。

