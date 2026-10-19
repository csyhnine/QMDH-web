2026-10-19 图片渠道UI修复（01d6c11/13bbe74已部署，前端623a1841）：ModelsPage显式登记comfyui，未知adapter不回退视频；Studio图片可用性包含comfyui并保留能力检查，来源归本机ComfyUI，视频/未开放编辑不包含。带Haodeya/Grok字样的渠道也需video.generate才标视频分组；后端能力及数据未变。原API真实验收未覆盖该UI缺口，已加真实组件/菜单回归。

2026-10-19 文生图真实验收完成：id60/61启用；正常公网Task API→Redis/worker→Windows GPU→原Asset/ledger，任务8237/8238与图片SHA/归属通过。Windows仅127.0.0.1:8188，原自动重拉全网卡的启动器已停、listen=false保存，frpc仍前台；图生图/服务长稳未完成。代码仍621e2f1，详情docs/comfyui-frp.md；下方早前禁用/未验收描述是阶段历史。

2026-10-19 FRP 与 ComfyUI 文生图 adapter 已部署（621e2f1 / 0562244e）：详见 docs/comfyui-frp.md 最新段。STCP visitor 对 backend/三 worker 专网提供 8188，frps 仅发布公网 7443，mTLS/token 正反向验证通过；Windows 公网 TLS1.3/mTLS 已通过，CSR 已签发。适配器仅实现两个文生图模板、固定专网 URL、提交 checkpoint、全局 Redis GPU 锁及受限结果持久化；编辑图尚未启用，两个 provider id60/61 保持禁用，等待本机客户端/真实 API 联调。

2026-10-16 ComfyUI 接入准备（未部署/未新增 adapter）：方案见 [comfyui-frp.md](comfyui-frp.md)，公开模板位于 ops/frp。Windows→frps 使用 STCP/mTLS/token，服务器 visitor 仅向专用 Docker internal 网络的 backend/worker 暴露入口，无 ComfyUI 公网映射。现有三 worker 后续需共享 GPU 并发锁；工作流/结果以 Task、ProviderCall、Asset 归属持久化，当前仅契约，不代表已实现。

