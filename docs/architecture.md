# Architecture

## 2026-05-25 Alignment Update

- This update overrides older historical references below when they conflict with current runtime behavior.
- The active permission model is now `admin` and `designer`.
- Admins can access backend management views such as `/admin/dashboard`, `/admin/models`, `/admin/users`, and `/admin/settings`.
- Admins can now manage shared studio prompt templates at `/admin/templates`.
- Designers use the studio and only see their own task and asset history.
- Prompt templates now have two scopes: `shared` templates are visible to all studio users, while `private` templates remain visible only to their owner.
- `/admin/projects` has been removed from the active frontend surface, and project-member management APIs/UI are no longer active product capabilities.
- Projects still exist in the data model, but they now act as personal or admin-managed task containers rather than shared-history collaboration spaces.

## 1. Purpose
本文档描述 QMDH-web 当前有效架构，用于帮助新 agent 快速理解：

- 系统入口在哪里
- 当前有哪些核心模块
- 模块边界是什么
- 当前任务主要影响哪里

本文档只写当前有效状态，不写长篇历史演化。

---

## 2. System Overview

QMDH-web 当前是一个前后端分离的原型项目：

- `frontend/`：React + Vite + TypeScript 前端，当前正在收束为图像生成工作台
- `backend/`：FastAPI + SQLAlchemy 后端，提供账号、项目、工作流、任务、资产、dashboard 等接口
- `docs/projects/`：项目阶段状态和里程碑记录

系统当前核心能力是“工作流驱动的任务系统”，图像生成、图像编辑、视频生成、文档生成等能力都被统一抽象为 workflow + task，而不是真正独立的业务服务。

MVP 1.0 当前还补充了一套单机服务器部署基线：

- `frontend` 容器：Nginx 托管前端静态文件并反代 `/api`、`/media`
- `backend` 容器：FastAPI API
- `worker` 容器：Redis 队列消费者
- `postgres` 容器：业务数据库
- `redis` 容器：异步任务队列

---

## 2.5 Version Direction

当前架构对版本方向的默认理解应保持一致：

- **1.0** 继续是稳定可用的设计生产平台
- **2.0** 是未来升级方向，面向研究型 / 协作型智能工作流
- 当前阶段不直接落地完整 Agent 平台，而是在现有 `workflow + task`、项目沉淀、媒体存储和审计能力上预留升级地基

## 3. Key Entry Points

- 仓库入口：
  - `README.md`
  - `qmdh-plan.md`
- 前端入口：
  - `frontend/src/main.tsx`
  - `frontend/src/App.tsx`
  - `frontend/src/router.tsx`
  - `frontend/src/api.ts`
- 后端入口：
  - `backend/app/main.py`
  - `backend/app/database.py`
  - `backend/app/core/config.py`
  - `backend/app/core/auth.py`
  - `backend/app/core/security.py`
- 账号与管理入口：
  - `backend/app/routers/auth.py`
  - `backend/app/routers/users.py`
  - `frontend/src/router.tsx` 中的 `/admin/users`、`/admin/dashboard`、`/admin/models`
- 部署入口：
  - `docker-compose.yml`
  - `DEPLOYMENT.md`
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
- 后端任务主链路：
  - `backend/app/routers/tasks.py`
  - `backend/app/services/task_executor.py`
  - `backend/app/services/model_registry.py`
- 模型配置入口：
  - `backend/app/routers/providers.py`
  - `backend/app/models.py` 中的 `ProviderProfile`
  - `frontend/src/pages/admin/ModelsPage.tsx`
- 项目状态入口：
  - `docs/projects/project-index.json`
  - `docs/projects/<project-code>/status.md`

---

## 4. Module Boundaries

### Module: Frontend Studio
- 路径：
  - `frontend/src/`
- 职责：
  - 展示图像生成工作台
  - 拉取项目、模型、工作流、任务、资产数据
  - 发起任务并展示最近任务与图库资产
- 依赖：
  - `backend/app/routers/*`
  - `frontend/src/api.ts`
- 不应负责：
  - 认证可信性
  - 真实模型适配
  - 资产落库规则
- 当前相关任务：
  - 生图工作台稳定化
  - 前端状态与任务反馈优化

### Module: API Surface
- 路径：
  - `backend/app/routers/`
  - `backend/app/core/auth.py`
- 职责：
  - 提供健康检查、登录、用户管理、项目、provider、workflow、task、asset、dashboard 接口
  - 通过数据库 session 认证派生可信用户和项目访问范围，短期保留旧 token 兼容
- 依赖：
  - `backend/app/schemas.py`
  - `backend/app/database.py`
  - 对应 service 模块
- 不应负责：
  - 大量业务逻辑堆积
  - 持久任务编排细节
- 当前相关任务：
  - 任务创建与状态查询稳定化
  - 账号、认证与权限补齐
  - provider profile 后台管理
  - 服务器部署联调

### Module: Deployment Baseline
- 路径：
  - `docker-compose.yml`
  - `DEPLOYMENT.md`
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
  - `frontend/nginx.conf`
- 职责：
  - 提供 MVP 1.0 单机服务器部署基线
  - 统一前端静态托管、API 反向代理、数据库、队列和 worker 的启动方式
- 依赖：
  - `backend/app/main.py`
  - `backend/app/worker.py`
  - `backend/app/core/config.py`
  - `frontend` 构建产物
- 不应负责：
  - 替代正式云平台编排
  - 替代 HTTPS、监控、对象存储等生产级能力
- 当前相关任务：
  - 单机部署验证
  - 后续生产化演进

### Module: Task Execution Layer
- 路径：
  - `backend/app/services/task_executor.py`
  - `backend/app/worker.py`
- 职责：
  - 执行 task
  - 记录 provider 调用摘要、耗时和成本
  - 支持 `background / sync / redis` 三种执行模式
- 依赖：
  - `backend/app/services/model_registry.py`
  - `backend/app/services/media_storage.py`
  - `backend/app/models.py`
- 不应负责：
  - 前端展示逻辑
  - 复杂资产治理
- 当前相关任务：
  - 真实 provider 接入
  - 结果结构设计
  - Redis 模式一致性改进

### Module: Provider Adapter Layer
- 路径：
  - `backend/app/services/provider_adapters/`
- 职责：
  - 承载真实 provider 的协议适配、请求构造、异步轮询和结果下载
  - 通过 capability strategy 选择具体执行路径，例如 `dashscope_async_video`, `volcengine_ark_video_tasks`, `volcengine_cv_jimeng_video`
  - 把上游临时媒体 URL 转存到统一 media storage 后再返回任务结果
- 依赖：
  - `backend/app/services/model_registry.py`
  - `backend/app/services/provider_strategy.py`
  - `backend/app/services/media_storage.py`
- 不应负责：
  - 决定任务权限、项目可见性或用户账本口径
  - 为不同业务页面另起任务 API
- 当前相关任务：
  - DashScope Wan / HappyHorse 视频 provider 接入
  - Volcengine Ark / Seedance 视频 provider 接入
  - Volcengine Jimeng native 视频 provider 接入
  - 后续 provider 协议继续新增 adapter，不回填到 `task_executor.py`

### Module: Usage Ledger / 运营账本
- 路径：
  - `backend/app/services/usage_ledger.py`
  - `backend/app/routers/dashboard.py`
  - `backend/app/models.py` 中的 `UsageLedger`, `TaskArchive`, `ProviderCallArchive`
- 职责：
  - 在 task 终态、task 软删除、project 归档时，为 task / provider_call 写入稳定账本
  - 为运营看板、成本趋势、失败原因、账号用量提供不依赖 live task 可见性的统计读口径
  - 将归档快照与运营统计解耦，避免“删除后报表回退”
- 依赖：
  - `backend/app/services/task_executor.py`
  - `backend/app/routers/tasks.py`
  - `backend/app/routers/projects.py`
  - `backend/app/models.py`
- 不应负责：
  - 决定任务调度或 provider 调用流程
  - 充当完整财务结算系统
- 当前相关任务：
  - 归档项目的只读查看需求评估
  - 后续历史导出 / 对账口径扩展

### Module: Bootstrap / Seed Layer
- 路径：
  - `backend/app/services/bootstrap.py`
- 职责：
  - 启动时初始化 schema 和种子数据
- 依赖：
  - `backend/app/models.py`
- 不应负责：
  - 长期迁移治理
  - 生产级 schema 变更策略
- 当前相关任务：
  - 从启动补列迁移到正式 migration 体系

### Module: Project Status Docs
- 路径：
  - `docs/projects/`
- 职责：
  - 记录项目阶段状态、目标、风险和里程碑
- 依赖：
  - `backend/app/services/project_status.py`
- 不应负责：
  - 任务执行状态存储
  - 前端模块实现细节
- 当前相关任务：
  - 保持状态文档与真实项目进展同步

### Module: Inspiration / 灵感页
- 路径：
  - `backend/app/routers/inspiration.py`
  - `backend/app/models.py` 中的 `InspirationPost`
  - `frontend/src/pages/inspiration/InspirationPage.tsx`
- 职责：
  - 灵感内容 CRUD（外部参考导入 + 用户分享生成结果）
  - 分类标签、卡片网格、点赞计数
- 依赖：
  - `backend/app/routers/assets.py`（资产关联）
  - `backend/app/core/auth.py`（ops 权限校验）
- 不应负责：
  - 直接调用外部图片源
  - 复杂推荐算法
- 当前相关任务：
  - 完善分享到灵感库的前端交互
  - 灵感页内容填充

### Module: Project Management / 项目管理
- 路径：
  - `backend/app/routers/projects.py`
  - `frontend/src/pages/admin/ProjectsPage.tsx`
  - `frontend/src/features/studio/GenerateStudioShell.tsx` 中的项目面板和成员编辑
- 职责：
  - 项目 CRUD（创建/重命名/删除）
  - 项目成员管理（添加/移除）
  - 项目级访问控制
- 依赖：
  - `backend/app/core/auth.py`（ops/admin 权限校验）
  - `backend/app/models.py` 中的 `Project`, `User`
- 不应负责：
  - 任务执行逻辑
  - 资产生命周期
- 当前相关任务：
  - 无（基础能力已完成）

### Module: Agent Governance Docs
- 路径：
  - `docs/protocol.md`
  - `docs/plan.md`
  - `docs/architecture.md`
  - `docs/decisions.md`
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/review.md`
- 职责：
  - 为多 agent 接手开发提供统一上下文
- 依赖：
  - 当前仓库事实
- 不应负责：
  - 替代代码事实本身
  - 替代 Git 历史
- 当前相关任务：
  - 初始化并持续维护

---

## 5. Data / Control Flow

### 主链路：图像生成任务
1. 前端通过 `frontend/src/router.tsx` 装配页面，并在 `frontend/src/pages/studio/GeneratePage.tsx` / `frontend/src/features/studio/GenerateStudioShell.tsx` 中读取项目、workflow、provider、task、asset 数据。
2. 前端在 `frontend/src/api.ts` 为 API 请求附带 `Authorization: Bearer <session token>`；旧 `X-QMDH-Auth` 仅作为兼容路径保留。
3. 用户在生图工作台填写业务字段，前端组装请求，但不再提交可信执行人字段。
4. `POST /api/v1/tasks` 进入 `backend/app/routers/tasks.py`。
5. 后端通过 `backend/app/core/auth.py` 校验数据库 session，派生当前用户、角色与可访问项目范围。
6. 后端校验 workflow、provider、project、项目访问权限和 capability 兼容性。
7. provider 校验来自静态模拟 provider、环境变量 provider 和数据库 `provider_profiles` 的合并结果；数据库同名配置优先。
8. 设计师页面使用的 `GET /api/v1/providers` 只返回真实 runtime provider，不返回静态模拟 provider。
9. 后端创建 `Task`、`AuditLog`，再根据执行模式触发：
   - `background`：FastAPI background task
   - `sync`：同步执行
   - `redis`：入队等待 worker
10. `task_executor.py` 根据 provider 选择真实适配器或模拟适配器，并在执行时读取数据库会话下的 provider profile。
11. 如果任务 payload 包含参考图，并且 provider profile 使用 `reference_mode=caption_prompt`，执行层会先调用视觉语言模型读取参考图，再把参考说明拼入真实文生图 prompt。
12. 如果 provider 是 FireRed 这类要求图片输入的图像编辑模型，执行层会在无参考图时自动补一张白底图作为 `image_url`，有参考图时直接转发参考图，从而兼容当前设计师文生图体验。
13. 若为图像任务，执行层会把真实返回图片或模拟预览落到 `media_root`，并将 `/media/...` 写入 `task.result.storage_path`。
14. 任务成功后，资产物化逻辑会把 `storage_path` 沉淀为 `Asset`，供图库和任务区复用。
15. 前端定时轮询 `GET /api/v1/tasks`，后端按当前用户可访问项目过滤任务列表。

### 辅助链路：模型与 Key 管理
1. 管理人员直接访问 `/admin/models`，设计师工作台不暴露该入口。
2. 管理视图调用 `GET /api/v1/providers/profiles` 读取数据库 provider profile。
3. 新增、编辑、删除通过 `POST /providers/profiles`、`PATCH /providers/profiles/{id}`、`DELETE /providers/profiles/{id}` 完成。
4. 后端保存真实 API key，但响应只返回 `has_api_key` 与 `masked_api_key`。
5. Provider profile 管理接口只允许 `admin / owner / ops` 角色访问。
6. `/api/v1/providers` 会合并静态 provider、环境变量 provider 与已启用的数据库 provider。
7. `/api/v1/providers/discover` + `/api/v1/providers/bulk-import` 支持从上游 `/v1/models` 显式探测并批量导入 provider profile；当前 runtime provider 以后台启用的 profile 为准，不再隐藏自动派生 ModelScope 变体。
8. 任务创建与执行都使用合并后的 provider 注册表，保证后台保存后可以真实参与生成。

### 辅助链路：账号与看板
1. 未登录用户访问前端时进入登录页，调用 `POST /api/v1/auth/login` 获取 session token。
2. `auth_sessions` 保存 token hash、过期时间和撤销时间，默认会话有效期 7 天。
3. `GET /api/v1/auth/me` 返回当前用户、角色、启停状态和项目授权。
4. `owner / admin` 可访问 `/admin/users`，通过 `/api/v1/users` 创建、编辑、停用账号和重置密码。
5. `owner / admin / ops` 可访问 `/admin/dashboard`，读取最近任务数、成功率、成本、用户/项目排行、provider/model 分布和失败原因。
6. `GET /api/v1/dashboard/stats` 现在以 `usage_ledgers` 为主读口径，在汇总指标之外返回 `daily_series` 与 `model_calls_by_day`（按 UTC 自然日、与查询参数 `days` 对齐），供运营看板绘制成本、失败次数与模型调用按日趋势。
7. `designer` 只使用设计师工作台，仍按 `project_codes` 过滤项目、任务、资产和模板。

### 辅助链路：项目状态
1. `GET /api/v1/projects` 调用 `project_status.py`
2. 后端从 `docs/projects/project-index.json` 和对应 `status.md`、`milestones.json` 读取状态
3. 状态摘要返回前端展示

### 辅助链路：图库资产
1. 前端读取 `GET /api/v1/assets`
2. 后端返回当前资产列表
3. 前端可调用 like/share 接口更新交互数据

### 部署链路：单机服务器
1. `frontend` 容器启动 Nginx，提供前端静态页面。
2. `/api` 与 `/media` 请求由 Nginx 代理到 `backend` 容器。
3. `backend` 连接 `postgres` 保存业务数据，连接 `redis` 投递任务。
4. `worker` 从 `redis` 消费任务并执行真实或模拟 provider。
5. 图像结果写入共享媒体卷，再通过 `/media` 暴露给前端。

---

## 6. Current Hot Spots

- 热点模块：`frontend/src/features/studio/GenerateStudioShell.tsx`
  - 原因：设计师工作台的大部分交互、状态与项目成员编辑仍集中在 4000+ 行单文件中
  - 风险：继续叠加功能会放大状态耦合、回归范围和接手成本

- 热点模块：`backend/app/services/task_executor.py`
  - 原因：图像/视频/文档执行能力都汇集在这里
  - 风险：现在已经同时承载模拟适配器、真实 provider 接入和参考图语义增强，若继续堆叠实现，容易把 provider 逻辑和任务逻辑缠在一起

- 热点模块：`backend/app/services/bootstrap.py`
  - 原因：启动时直接建表、补列、种子写入
  - 风险：继续演进会放大 schema 演进和并发启动问题

- 热点模块：`backend/app/routers/tasks.py`
  - 原因：任务创建牵涉用户、项目、provider、workflow、审计和执行模式
  - 风险：认证、权限和一致性问题集中暴露在这里

- 热点模块：`backend/app/routers/projects.py`
  - 原因：项目删除当前仍承担“清理项目下任务 / provider 调用 / 资产关系”的历史策略
  - 风险：项目归档现在同时承担 task 软删、archive snapshot 与 usage ledger 补账；若继续在这里叠加更多恢复 / 清理分支，容易让治理口径分叉

- 热点模块：`backend/app/core/auth.py` 与 `backend/app/routers/users.py`
  - 原因：数据库 session、旧 token fallback 和角色边界集中在这里
  - 风险：后续移除兼容认证或接入 SSO 时需要集中回归权限边界

- 热点模块：`docs/projects/` 与 `docs/*.md`
  - 原因：项目状态文档和协作文档同时开始建立
  - 风险：如果不明确维护边界，容易出现模板、事实、历史三者混杂

- 热点模块：`docker-compose.yml` 与部署文件
  - 原因：MVP 1.0 已开始考虑单机服务器部署
  - 风险：若不持续同步代码与部署配置，极易出现“本地能跑、容器起不来”的漂移

---

## 6.5 1.0 -> 2.0 Compatibility Guardrails

后续 1.0 中大型需求默认应遵守以下架构约束：

- 不绕开现有 `Workflow + Task` 主轴另起一套平行业务执行链
- 不把复杂能力继续无限堆进单一 `Task.payload / result`
- 新增的状态、来源、产物、审计信息尽量结构化，而不是只写入自由 JSON
- 新增图片、快照、摘要、导出物尽量走统一存储接口，视为未来“工件存储”的组成部分
- 新增沉淀类能力优先挂到项目维度，而不是散落在独立页面状态中
- 新增耗时或异步能力必须继续补状态、失败原因、来源与操作者

这些约束的目的不是现在就引入 2.0 编排层，而是避免 1.0 后续迭代把未来工作流升级路径封死。

---

## 7. Architecture Change Rule

若任务改变了以下任一内容，必须同步更新本文档：

- 关键入口文件
- 模块边界
- 主链路数据流
- 依赖关系
- 当前热点模块
