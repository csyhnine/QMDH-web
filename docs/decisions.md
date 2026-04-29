# Decisions

## Purpose
本文档只记录顶层技术决策、重要约束和当前不应反复横跳的问题。
不记录零散实现细节。

---

## Active Decisions

### Decision: 仓库文档而非聊天记录作为长期上下文
- 状态：Accepted
- 日期：2026-04-17
- 背景：
  - QMDH-web 计划由多 agent 接力开发，聊天上下文无法稳定继承
- 决策内容：
  - 项目连续性依赖 Git 仓库、代码事实和 `docs/` 下正式文档
- 影响：
  - 所有 agent 接手前都必须优先阅读 `docs/protocol.md`、`docs/tasks.md`、`docs/handoff.md`
- 禁止事项：
  - 不允许把聊天内容当成唯一真相源

### Decision: 当前阶段以图像生成 MVP 为前台主焦点
- 状态：Accepted
- 日期：2026-04-17
- 背景：
  - 项目虽然已有图像、视频、文档等 workflow，但当前最成熟、最适合验证价值的是图像生成
- 决策内容：
  - 前端近期优先围绕图像生成工作台组织，而不是继续做泛平台门户
- 影响：
  - 前端任务优先级向 image workflow 倾斜
  - 视频与其他模块保留，但不作为近期产品打磨中心
- 禁止事项：
  - 未经明确授权，不将当前前台重新扩展回“大而全门户”

### Decision: 工作流驱动是当前业务抽象主轴
- 状态：Accepted
- 日期：2026-04-17
- 背景：
  - 当前代码结构已经将图像生成、图像编辑、视频生成等统一抽象为 workflow + task
- 决策内容：
  - 继续沿用 workflow + task 抽象，不为每个场景单独构建一套后端主链路
- 影响：
  - 新能力优先表现为 workflow 扩展和 provider capability 扩展
- 禁止事项：
  - 在没有充分理由的情况下，绕开 task 体系直接新增平行业务执行链

### Decision: 开发环境允许 SQLite，生产目标仍指向更稳定的数据库方案
- 状态：Accepted
- 日期：2026-04-17
- 背景：
  - 当前仓库默认使用 SQLite，适合单机原型和快速启动
  - 但迁移、并发和可靠性要求决定它不应成为长期稳定形态
- 决策内容：
  - 当前开发可继续使用 SQLite
  - 生产级路线应迁移到更稳定的数据库和 migration 体系
- 影响：
  - 文档必须明确“当前现实”和“后续目标”两层，不混写成已完成事实
- 禁止事项：
  - 不把当前 SQLite 默认值写成已经达成的生产终态

### Decision: 模拟 provider 只用于当前原型验证，不视为功能完成
- 状态：Accepted
- 日期：2026-04-17
- 背景：
  - 当前 `task_executor.py` 主要依赖 `SimulatedProviderAdapter`
- 决策内容：
  - 模拟执行仅用于验证任务链路、UI 流程和审计结构
  - 真实 provider 接入属于当前高优先级待完成工作，而不是可无限延期的优化项
- 影响：
  - 前端不能假装已有真实文件产物返回
  - 后端后续设计必须为真实结果结构和资产沉淀留接口
- 禁止事项：
  - 不能把模拟结果当成“真实生图能力已完成”

### Decision: 首个真实图像 provider 以新增明确名称接入，不覆盖既有 mock provider
- 状态：Accepted
- 日期：2026-04-20
- 背景：
  - 当前 `jimeng`、`nano_banana` 等 provider 名称已用于模拟执行、旧任务记录和种子数据
  - 若直接把旧 mock provider 名称切换成真实外呼，历史审计和问题排查会很难区分“模拟执行”和“真实执行”
- 决策内容：
  - 首个真实图像 provider 以独立名称接入，例如 `openai_image`
  - 既有 mock provider 保留，继续承担原型和演示用途
- 影响：
  - Provider 注册表与执行器工厂需要支持真实适配器和模拟适配器并存
  - 前端、任务记录和审计日志可以明确区分真实外呼与模拟执行
- 禁止事项：
  - 不在没有迁移方案的前提下，直接把旧 mock provider 名称替换成真实执行实现

### Decision: MVP 1.0 采用单机 Docker Compose 作为服务器部署基线
- 状态：Accepted
- 日期：2026-04-20
- 背景：
  - 当前目标已从“仅本地可跑原型”推进到“基础生图功能 + 可部署到服务器”
  - 项目现阶段仍不适合直接上复杂云原生编排
- 决策内容：
  - MVP 1.0 的服务器部署以单机 Docker Compose 为基线
  - 前端通过 Nginx 托管，并统一代理 `/api` 与 `/media`
  - 后端采用 `backend + worker + postgres + redis` 组合
- 影响：
  - 仓库需要维护 Dockerfile、compose、部署文档和环境变量模板
  - 开发时应尽量避免只适用于本地开发服务器的假设
- 禁止事项：
  - 不把“本地 `npm run dev` + `uvicorn --reload`”误当成服务器部署方案

### Decision: 参考图 MVP 先采用语义参考模式，不伪装成直接图生图
- 状态：Accepted
- 日期：2026-04-23
- 背景：
  - 当前 ModelScope 免费文生图链路主要围绕文本 prompt 调用
  - 项目已经支持参考图真实上传，但直接 `img2img / image.edit` 仍需要后续接入支持该能力的 provider
- 决策内容：
  - MVP 1.0 先使用 `reference_mode=caption_prompt`
  - 有参考图时，后端先调用视觉语言模型读取参考图，再把参考说明拼入真实文生图 prompt
  - 该能力对用户明确表述为“参考图语义参与生成”，不称为完整图生图
- 影响：
  - 使用参考图会多一次视觉语言模型调用，增加延迟并消耗 provider 额度
  - 后续接入直接图生图 provider 时，应新增专用 adapter 或 provider mode，而不是复用当前语义参考说法
- 禁止事项：
  - 不把 `caption_prompt` 模式宣传为直接 `img2img / image.edit`

### Decision: MVP 1.0 先用配置型 token 建立最小用户边界
- 状态：Accepted
- 日期：2026-04-29
- 背景：
  - 任务和模板原先依赖前端传入 `user_name`，执行人与模板归属都可被客户端随意伪造
  - 当前阶段需要先补可信执行人与项目访问边界，但还不适合引入完整账号、密码、会话或 SSO 体系
- 决策内容：
  - MVP 1.0 使用 `QMDH_AUTH_USERS_JSON` 配置用户、token、角色和可访问项目
  - 前端通过 `X-QMDH-Auth` / `X-QMDH-User` 发送认证信息
  - 后端以 token 派生用户身份和 `project_codes`，不把任务或模板 payload 中的 `user_name` 当作事实源
- 影响：
  - 任务、模板、项目和资产接口需要使用认证依赖
  - 生产部署必须替换默认开发 token
- 禁止事项：
  - 不把当前 token 方案描述为完整账号体系
  - 不重新让前端 payload 决定可信执行人

### Decision: provider 配置从纯环境变量扩展为后台可管理记录
- 状态：Accepted
- 日期：2026-04-29
- 背景：
  - 真实生图模型需要频繁验证不同 provider、model 和 key
  - 只依赖 `.env` / `QMDH_IMAGE_PROVIDER_PROFILES_JSON` 会导致每次切换都需要改配置和重启，不利于排查提示词不跟随的问题
- 决策内容：
  - MVP 先新增数据库表 `provider_profiles` 和独立管理入口 `/admin/models`
  - 后端 provider 注册表合并静态模拟 provider、环境变量 provider 与数据库 provider
  - 同名数据库 provider 优先，便于运行中替换模型配置
  - 前端只展示脱敏 key，不返回明文 key
  - 设计师创作台不暴露模型与 key 管理入口，provider profile 接口只允许 `admin / owner / ops` 角色访问
- 影响：
  - 任务创建和任务执行必须读取数据库会话下的 provider 注册表
  - 生产部署还需要补密钥加密、轮换和操作审计
- 禁止事项：
  - 不在前端存储或回显明文 API key
  - 不把当前数据库明文保存描述为生产级密钥管理
  - 不把模型管理能力放进设计师日常创作导航

### Decision: 任务必须拆到可单次提交完成的粒度
- 状态：Accepted
- 日期：2026-04-17
- 背景：
  - 多 agent 协作中，大任务极易导致越界修改和交接失败
- 决策内容：
  - `docs/tasks.md` 中的任务默认拆到一次 commit 或一组紧邻 commits 可完成
- 影响：
  - review、handoff 和分支策略都围绕小任务组织
- 禁止事项：
  - 不允许用“重做前端”“接入全部模型”这类模糊任务直接开工

### Decision: 不允许 force push 作为常规协作手段
- 状态：Accepted
- 日期：2026-04-17
- 背景：
  - 多 agent 并行或串行接手时，force push 会直接破坏可审计性
- 决策内容：
  - 冲突默认停下并记录，不通过强推掩盖分支状态
- 影响：
  - 冲突处理、handoff 和 review 都必须留痕
- 禁止事项：
  - 非紧急且无明确授权时禁止强推
