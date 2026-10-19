### [2026-10-16] ComfyUI FRP 接入准备 — 未部署

- 新分支 codex/comfyui-frp-plan，起点 0fc630f；原 styles.css 与所有未跟踪文件保持。此前管理模块只读复核：生产 d7f14138、前端镜像仍 85b3652e、schema a16c9e74b821、六人授权启用、项目 0/名册 5；浏览器验收因控制工具无法识别 URL 停止，没有真实点击通过结论。
- 用户本轮改为准备自建 FRP 连接 Windows ComfyUI；已确认先文生图、后图生图。本机另一 agent 负责 frpc/工作流；未授权自动给其他 chat 发消息，交接文档由用户转交。
- ops/frp 提供固定 0.71.0 的 frps/visitor/windows 模板、scratch Dockerfile 与显式 Compose overlay。STCP 不发布 ComfyUI，拟用 120.79.227.11:7443/TCP；mTLS、tokenSource 与独立 STCP secret；visitor 只绑定专用 internal 网络接口，backend/worker 保留 default 网络，frontend 不接入。
- 生产只读无 7443/7000/8188 TCP 监听、无 frps 命令，拟用 172.30.218.0/28 未与当前路由重叠；安全组未核验。未开端口/启动服务/构建镜像/写业务数据/签发秘密。现有代码无 ComfyUI adapter，后续不得冒充 OpenAI 接口或声称网站已可生成。
- 验证：三份 TOML 解析通过，生产临时合并 Compose config --quiet 通过（未启动）；官方包下载超过约 150 秒未完成，仅中止本轮下载并清理临时目录，包哈希/二进制 verify/TLS/镜像/真实业务联调仍未完成。
- 详细地址、CSR/最小材料包、受限目录、签发/轮换、工作流白名单参数、prompt/history/view/结果持久化和验收在 docs/comfyui-frp.md。下一步接本机 windows.csr 与工作流包，再签发及安排网络联调；无须重问首批能力。当前无生产 token/证书可领取。Safe to hand off: Yes（方案可接手，功能尚未上线）。
