# Tasks

## Usage Rules
- 本文件只保留当前迭代和下一步任务
- 更早历史迁移到 `docs/archive/`
- 每个任务必须细化到“一次 commit 或一组紧邻 commits 可完成”
- 状态仅使用：`TODO / IN_PROGRESS / BLOCKED / DONE`

---

## Current Iteration Goal

在不扩大范围的前提下，把 QMDH-web 从“能跑的原型”推进到“可持续接手开发的图像生成 MVP”，优先完成图像生成工作台、真实 provider 接入准备和正式协作文档落地。

---

## Priority Queue

### Task: [task-001] 整理并定稿当前生图工作台改动
- 状态：IN_PROGRESS
- 目标：
  - 确认当前 `frontend/src/App.tsx`、`frontend/src/styles.css`、`frontend/src/api.ts` 的工作台重构是否满足 MVP 预期
- 边界：
  - 仅处理 `frontend/src/App.tsx`
  - `frontend/src/styles.css`
  - `frontend/src/api.ts`
- 禁止修改：
  - 不扩大到视频模块重做
  - 不引入新 UI 框架
  - 不在本任务内改后端 schema
- 验收标准：
  1. 图像生成页面可作为专用工作台使用
  2. 本地构建通过
  3. 文档和 handoff 反映当前工作区存在未提交前端改动
- 依赖项：
  - 无
- 文档同步：
  - `docs/tasks.md`
  - `docs/handoff.md`
  - 如前台定位变化，更新 `docs/decisions.md`
- 分支建议：`feature/task-001-image-studio-finalize`

### Task: [task-002] 接入至少一个真实图像 provider
- 状态：IN_PROGRESS
- 目标：
  - 用真实 provider 替换 `SimulatedProviderAdapter` 的图像生成路径
- 边界：
  - `backend/app/services/task_executor.py`
  - `backend/app/services/model_registry.py`
  - 必要的配置文件与文档
- 禁止修改：
  - 不同时改视频与文档能力
  - 不在本任务内顺带重构全部任务系统
- 验收标准：
  1. `image-generate` 可调用一个真实外部模型
  2. 失败路径可见且可追踪
  3. 配置项与使用方式写入文档
- 依赖项：
  - Provider 凭据和接入规则
- 文档同步：
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/architecture.md`
  - `docs/decisions.md`
- 分支建议：`feature/task-002-real-image-provider`

### Task: [task-003] 打通任务结果到图库资产的闭环
- 状态：DONE
- 目标：
  - 让成功任务能沉淀为真实可浏览资产，而不仅是模拟摘要
- 边界：
  - `backend/app/models.py`
  - `backend/app/services/task_executor.py`
  - `backend/app/routers/assets.py`
  - 前端相关展示代码
- 禁止修改：
  - 不在本任务内做复杂权限系统
  - 不一次性做完整素材管理后台
- 验收标准：
  1. 已完成任务具备可关联资产的结果结构
  2. 前端能展示新增资产
  3. 图库不再只依赖种子数据
- 依赖项：
  - 无
- 文档同步：
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/architecture.md`
- 分支建议：`feature/task-003-task-to-asset-flow`

### Task: [task-004] 增加最小认证与项目级访问控制
- 状态：TODO
- 目标：
  - 解决任务创建和审计目前完全依赖前端传参的问题
- 边界：
  - 后端认证入口
  - 任务和项目访问控制
  - 前端最小身份接入
- 禁止修改：
  - 不实现完整企业账号体系
  - 不顺带重做所有管理后台
- 验收标准：
  1. 前端不能再随意伪造执行人
  2. 项目访问边界具备最小约束
  3. 审计日志来源更可信
- 依赖项：
  - 明确当前认证策略
- 文档同步：
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/architecture.md`
  - `docs/decisions.md`
- 分支建议：`feature/task-004-auth-minimum`

### Task: [task-005] 利用 storage_path 增强资产预览体验
- 状态：DONE
- 目标：
  - 当资产存在可展示的 `storage_path` 时，在前端提供更清晰的缩略图或预览入口
- 边界：
  - `frontend/src/App.tsx`
  - `frontend/src/styles.css`
- 禁止修改：
  - 不引入新的媒体服务层
  - 不在本任务内重做图库模块结构
- 验收标准：
  1. 自动生成的资产不再只表现为元数据卡
  2. 用户能更直观地把任务结果与图库资产关联起来
- 依赖项：
  - `task-003`
- 文档同步：
  - `docs/tasks.md`
  - `docs/handoff.md`
- 分支建议：`feature/task-005-asset-preview`

### Task: [task-006] 补齐 MVP 1.0 服务器部署基线
- 状态：DONE
- 目标：
  - 为 MVP 1.0 提供一套可在单机服务器上直接启动的最小部署方案
- 边界：
  - `docker-compose.yml`
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
  - 部署文档与环境变量模板
- 禁止修改：
  - 不在本任务内引入 Kubernetes、Helm 或云厂商专属编排
  - 不顺带重做认证、监控和对象存储
- 验收标准：
  1. 仓库具备前端、后端、worker、Postgres、Redis 的最小部署编排
  2. 前端生产构建可通过反向代理访问 `/api` 与 `/media`
  3. 部署步骤与环境变量说明写入文档
- 依赖项：
  - `task-002`
- 文档同步：
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/architecture.md`
  - `docs/decisions.md`
- 分支建议：`feature/task-006-mvp-deployment-baseline`

---

## In Progress

### Task: [task-001] 整理并定稿当前生图工作台改动
- 状态：IN_PROGRESS
- 当前分支：`main`
- 当前执行角色：Integration
- 已完成：
  - 生图工作台前端重构已存在于工作区
  - 图像任务表单已改为业务字段驱动
  - 正式协作文档第一版已建立
  - 任务卡已增加“已入图库”的最小提示
  - 顶部预览区、最近任务和图库卡片已开始利用 `storage_path` 展示更直观的结果信息
  - 模拟图像任务现在会落地本地 SVG 预览文件，并通过 `/media/...` 直接提供给前端展示
  - 生图模块前端已重排为“左侧导航 + 项目工作区 + 中间结果流 + 底部创作条”的逻辑布局
  - 默认创作已改为按当前项目名称展示，不再固定显示“默认创作”
  - 已把比例、分辨率、模型、创作类型等高频配置收进底部下拉菜单，主界面只保留项目切换、结果流和核心提示词输入
  - 历史记录流已修正为“旧任务在上，新任务在下”，更符合持续创作的时间线阅读方式
  - 同一生图任务现在会按 `source_task_id` 归组展示多张结果，不再拿其它历史资产错误补位
  - 底部创作栏已增加“张数”配置，下拉可选 1 到 4 张
- 未完成：
  - 当前前端改动尚未进入明确提交状态
  - 仍需决定 1.0 前是否继续做视觉微调，还是以当前简洁工作台直接作为 MVP 定稿
- 风险：
  - 工作区当前不干净，接手人必须先识别“文档初始化”和“前端重构”是同轮未提交改动
  - 旧的 `nas://` 类历史占位资产如果未被种子更新覆盖，仍会以前端 fallback 预览呈现
- 下一步：
  - 评审当前生图工作台是否可以和本轮后端预览能力一起收敛提交
  - 在确认提交边界后转入 `task-002` 的真实 provider 接入

### Task: [task-002] 接入至少一个真实图像 provider
- 状态：IN_PROGRESS
- 当前分支：`main`
- 当前执行角色：Integration
- 已完成：
  - provider 注册表已改为“静态 mock provider + 动态真实 provider profile”组合，后续新增真实生图平台可通过 `QMDH_IMAGE_PROVIDER_PROFILES_JSON` 直接挂载
  - 后端已支持通过环境变量配置 OpenAI-compatible 图像接口的 API key、base URL、模型名、超时、质量和输出格式
  - `task_executor.py` 已加入真实图像适配器，能够把外部返回的图片内容落到本地 `media_root`，再写回 `/media/...` 或远程 URL 预览路径
  - 新增 `.env.example` 和 backend README 说明，降低接手成本
  - 前端默认 provider 已调整为优先选择 `modelscope_free_image`，在未配置时再回退到可用 provider
  - 真实图像适配器已抽象为可复用的 OpenAI-compatible 执行链路，不再把单一 provider 写死在主流程里
  - 已接通 `modelscope_free_image / MAILAND/majicflus_v1`，并兼容 ModelScope 的异步出图轮询模式
  - 已支持一次任务请求多张图，真实链路可返回并落库 1 到 4 张图片
  - 已通过单元测试、API 级冒烟验证和真实实网生图验证，确认“provider 列表 -> 创建任务 -> 出图 -> 资产入库 -> 访问预览”链路可用
  - 已完成 `docker compose up` 容器级联调，确认 `frontend + backend + worker + postgres + redis` 可协同运行
- 未完成：
  - 暂未实现图像编辑能力的真实 provider 适配
  - 暂未接入第二个真实生图 provider 作为兜底或对比选择
- 风险：
  - 当前真正可用的真实 provider 只有 `modelscope_free_image`，其余图片 provider 仍是模拟能力
  - 当前真实 provider 仅覆盖 `image.generate`，价格信息未做真实核算，`cost` 暂记为 `0.0`
- 下一步：
  - 评估是否补第二家真实生图 provider
  - 若需继续扩展，再补 `image.edit` 或统一 provider 管理界面

---

## Blocked

### Task: [task-sec-001] 明确涉密项目的可出域边界
- 状态：BLOCKED
- 阻塞原因：
  - `QMDH-SEC` 的数据边界和外部闭源模型使用规则尚未确认
- 需要谁 / 什么解除阻塞：
  - 业务或管理侧给出明确的数据分级和出域规则
- 临时处理建议：
  - 保持涉密项目仅记录状态，不开放前台执行入口

---

## Done This Iteration

### Task: [task-000] 初始化多 agent 正式协作文档
- 状态：DONE
- 完成说明：
  - 已在 `docs/` 根目录建立正式的 protocol / plan / architecture / decisions / tasks / handoff / review
  - 已明确 `docs/ai-agent-project-docs/` 仅为模板来源
- 相关提交：
  - 尚未提交，当前处于工作区改动阶段
- 是否已更新文档：Yes

### Task: [task-003] 打通任务结果到图库资产的闭环
- 状态：DONE
- 完成说明：
  - 后端在图像/视频任务完成后会按 `source_task_id` 幂等创建资产
  - `AssetOut` 和前端类型已补充 `source_task_id`
  - 前端任务卡会显示“已入图库”提示
  - 已通过后端冒烟验证“创建任务 -> 完成任务 -> 生成资产”链路
- 相关提交：
  - 尚未提交，当前处于工作区改动阶段
- 是否已更新文档：Yes

### Task: [task-005] 利用 storage_path 增强资产预览体验
- 状态：DONE
- 完成说明：
  - 前端新增基于 `storage_path` 的预览逻辑，可对可访问资源直接展示，对非可访问路径提供稳定 fallback 预览
  - Hero 区、任务卡和图库卡现在都能更直观表达“任务产出了什么”
  - 后端新增本地媒体目录和模拟 SVG 产物落地，`image-generate` 新任务会返回可直接访问的 `/media/...` 预览路径
  - 种子图库中的图像样例已切换为本地可访问 SVG 预览，便于开箱即看
- 相关提交：
  - 尚未提交，当前处于工作区改动阶段
- 是否已更新文档：Yes

### Task: [task-006] 补齐 MVP 1.0 服务器部署基线
- 状态：DONE
- 完成说明：
  - 新增前后端 Dockerfile、Nginx 反向代理配置和 `docker-compose.yml`
  - 部署基线包含 `frontend + backend + worker + postgres + redis`
  - 增加根目录 `.env.example` 与 `DEPLOYMENT.md`，明确服务器启动方式和环境变量
  - 后端依赖已补充 PostgreSQL 驱动，满足容器内数据库连接
  - 已实际完成 `docker compose config`、镜像构建与 `docker compose up` 联调，确认 mock 生图任务可经由 worker 执行并通过 `/media` 访问预览
- 相关提交：
  - 尚未提交，当前处于工作区改动阶段
- 是否已更新文档：Yes

### Task: [task-002] 接入至少一个真实图像 provider
- 状态：IN_PROGRESS
- 完成说明：
  - 新增 `openai_image` 作为首个明确命名的真实图像 provider
  - 接入 OpenAI Images API 的最小后端适配，并复用现有资产落盘与媒体预览链路
  - 增加 provider 相关环境变量说明和 `.env.example`
  - 已通过 mock 响应方式完成单测和 API 冒烟验证，但仍缺真实 key 的外呼确认
- 相关提交：
  - 尚未提交，当前处于工作区改动阶段
- 是否已更新文档：Yes
