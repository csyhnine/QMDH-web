# Tasks

## 2026-05-25 Alignment Update

- This section overrides older historical notes below when they conflict with current code.
- Runtime roles are now effectively `admin` and `designer`.
- Legacy `owner` and `ops` inputs are normalized to `admin` at auth boundaries for compatibility, but they are no longer an active product role model.
- Studio history is now account-owned for every role. Same-project membership no longer implies shared history visibility, and admin-role accounts no longer get global history cards through the studio surface.
- `/admin/projects` and project-member management are no longer part of the active product surface.
- Projects remain as personal or admin-managed task containers, not collaboration spaces with shared history cards.

## Usage Rules
- 本文件只保留当前迭代和下一步任务
- 更早历史迁移到 `docs/archive/`
- 每个任务必须细化到“一次 commit 或一组紧邻 commits 可完成”
- 状态仅使用：`TODO / IN_PROGRESS / BLOCKED / DONE`

---

补充规则：

- 若任务属于中大型需求，立项或评审时必须先做 `docs/roadmap-2.0-prep.md` 中定义的 2.0 兼容性检查。

## Current Iteration Goal

在不扩大范围的前提下，把 QMDH-web 从“能跑的图像生成 MVP”推进到“可由管理人员运营设计师账号和用量的生产化内测版本”，优先完成：

- 数据库账号系统与用户名密码登录
- 设计师账号管理与项目授权
- 使用、成本、模型调用和失败原因看板
- 保留模型与 Key 后台为运维配置入口

上述 1.0 主线能力已基本完成（见下方 Priority Queue 中 DONE 任务）。当前迭代重心转为：**合并 Studio 结构重构 → 合并视频后端 → 再开设计师视频 UI → 穿插生产化补强**。

---

## Development Sequence (2026-06)

本章节是 **当前推荐的开发顺序**，优先级高于下方散落的 `Next Suggested Step` 旧条目。接手 agent 应以此为准。

### 总原则

- **`main` 是唯一集成主线**；feature 分支 review 通过后再合并，避免长期并行大改。
- **合并 ≠ 部署**；每次上生产需单独 smoke，且未经用户明确批准不 deploy WIP 分支。
- **Studio 前端大改与视频后端可分开交付**，但两者都会触及 `task_executor.py`、`providers.py`、`config.py`、`api.ts`；合并顺序固定为 **Studio PR 先于 Video 后端**，以减少冲突和返工。
- **`E:\projects\QMDH-web-pr1-review`** 是主仓库的 git worktree，用于隔离 review PR #1（Studio 重构）；与 `E:\projects\QMDH-web` 共享同一 Git 对象库，不在此重复 clone。

### 活跃分支与本地 worktree（2026-06-12 更新）

| 路径 | 分支 / HEAD | 用途 |
|------|-------------|------|
| `E:\projects\QMDH-web` | `main` @ `eb1057f` | 集成主线（Studio + Video + Grok + 域名 HTTPS） |
| GitHub `origin/main` | `eb1057f` | 已同步（2026-06-12）；dev push 可能需要代理 `127.0.0.1:7897` |
| 生产服务器 | `c41778e` | **已 deploy**（`https://cityusbdisk.cn`）；`eb1057f` 仅文档 |
| 已删除远程分支 | — | `codex/prod-001-studio-refactor`、`codex/production-readiness-release`（已合并） |

### 阶段 0：确认基线（在 `main` 或当前生产 HEAD 上）

| 步骤 | 事项 | 状态 |
|------|------|------|
| 0.1 | 对齐本地 / GitHub `main` / 服务器 HEAD 与健康检查 | DONE（2026-06-12：GitHub `eb1057f`；生产 `c41778e`；health OK） |
| 0.2 | 本地 smoke：`npm run smoke:studio` 8/8 | DONE |
| 0.3 | 若仍复现：`gpt-image-2` 参考图真实上传修复 | TODO |
| 0.4 | 若需要：灵感库 seed bundle 导入 | TODO |
| 0.5 | urgent 小补丁直接进 `main`，不与 Studio / Video 大 PR 捆绑 | — |

### 阶段 1：合并 Studio 重构 PR #1（P1）

对应 backlog **`prod-001`** 首轮交付。

| 步骤 | 事项 | 状态 |
|------|------|------|
| 1.1 | PR #1 review | DONE（build + 55 pytest + smoke 8/8） |
| 1.2 | composer CSS fix 提交 | DONE（`c237d93`） |
| 1.3 | Merge 到本地 `main` | DONE（2026-06-11 fast-forward） |
| 1.4 | Push `main` 并关闭 PR #1 | TODO |
| 1.5 | 可选：deploy 到服务器 | TODO（需用户批准） |

### 阶段 2：收口并合并 Video Provider 后端（P1，当前进行中）

| 步骤 | 事项 | 状态 |
|------|------|------|
| 2.1 | video WIP 应用到含 Studio 的 `main` 上 | DONE |
| 2.2 | 解决重叠文件冲突 | DONE |
| 2.3 | 跑 migration 与 video pytest | DONE（32 passed；alembic `4d5e6f7a8b9c`） |
| 2.4 | Commit + merge 到 `main` | DONE（`411c719`） |
| 2.5 | Push + 有真实 Key 时 live smoke | DONE（Haodeya Grok，2026-06-12 生产验证） |

**范围边界**：
- ✅ 后台 `/admin/models` 视频 adapter 配置；后端 adapter 执行与 mp4 资产落库
- ❌ 仍不做设计师 Studio 视频 UI
- ❌ 未经用户批准不 deploy

### 阶段 3：设计师 Studio 视频 UI（P2）

**前置条件**：阶段 1、2 均已 merge 到 `main`。

| 步骤 | 事项 | 状态 |
|------|------|------|
| 3.1 | 在拆分后的 Studio 组件上增加视频模式 / 参数 / 结果展示 | DONE（2026-06-11） |
| 3.2 | 复用现有 `video-generate` workflow，不新开平行任务 API | DONE |
| 3.3 | 端到端 live smoke：提交 → 轮询 → mp4 预览 → 资产入库 | DONE（Haodeya Grok；纯文生 ~2–3 min，带图 ~6 min） |

立项 task：**`video-002`**（见 Priority Queue）。

### 阶段 4：生产化补强（与功能并行，小步进 `main`）

见下方 **Production Readiness Backlog**。推荐穿插顺序：

| 优先级 | ID | 说明 |
|--------|-----|------|
| P1 | prod-002 | `.env.production.example` |
| P1 | prod-001 续 | Studio 拆分收尾（PR #1 之后） |
| P2 | prod-004 | `/health` 增强 DB / Redis |
| P2 | prod-008 | OSS/S3 静态资源 |
| P2 | — | `image.edit` 专用 workflow（FireRed 等） |
| P3 | prod-006 / prod-007 | Rate limit、Session 清理 |

### 明确暂缓

- 微服务拆分、换消息队列、多租户（见 Production Readiness Backlog）
- 2.0 Agent / 协作工作流完整落地（见 `docs/roadmap-2.0-prep.md`）
- 在未 merge 的 monolithic Studio 上先做视频 UI
- 未经批准的 video / Studio WIP 分支 deploy

### 依赖关系（简图）

```text
阶段0 基线 smoke ──► 阶段1 Studio PR #1 ──► 阶段2 Video 后端 ──► 阶段3 Video UI
                         │
                         └──► 阶段4 生产化小项（可并行）
```

---

## Priority Queue

### Task: [task-001] 收口当前生图工作台并清理遗留逻辑
- 状态：DONE
- 目标：
  - 稳定当前图像生成工作台交互
  - 清理 `frontend/src/App.tsx` 中的冗余分支、历史兜底逻辑和异常文案
- 当前进展：
  - 已修复模板面板在空白页状态下向上顶出容器的问题，改为可控高度、内部滚动、向下展开
  - 已把热门预设切换为“建筑效果图氛围增强一 / 建筑效果图氛围增强二 / 景观效果图氛围增强”
  - 已清理 `frontend/src/App.tsx` 中未使用的旧热门模板、模板保存死分支和旧本地兜底逻辑，模板保存统一走后端持久化接口
  - 已把前端工作台入口收束到 `image-generate`，移除视频“待开发”展示分支和对应提交拦截逻辑
  - 已移除仅剩单项的工作流选择菜单，前端提交固定使用图像工作流键，减少表单状态分支
  - 已修复任务提交后的历史流刷新与最新任务定位：提交成功后强制刷新，避免被轮询中的请求跳过
  - 已优化参考图上传 input 重置，失败或重复选择同一文件时可重新触发上传
  - 已为前端数据刷新增加最新请求写入保护，避免强制刷新与轮询并发时旧响应覆盖新历史流
  - 已区分“项目无历史”和“当前筛选无结果”，筛选为空时保留顶部筛选栏并显示空结果提示
- 边界：
  - `frontend/src/App.tsx`
  - `frontend/src/styles.css`
  - `frontend/src/api.ts`
- 验收标准：
  1. 历史流、模板、参考图上传、张数选择都可稳定使用
  2. “最近优先 / 最早优先”不影响最新任务定位
  3. 前端 build 通过
- 备注：
  - 生图链路已实测可用，后续 `frontend/src/App.tsx` 拆分降级为技术债，不再压在当前主线上。

### Task: [task-002] 把参考图接入真实生成链路
- 状态：DONE
- 目标：
  - 让已上传参考图不只是进入 payload，而是真正参与生成
- 边界：
  - `backend/app/services/task_executor.py`
  - `backend/app/services/model_registry.py`
  - 必要的前后端配置与文档
- 完成说明：
  - ModelScope profile 默认支持 `reference_mode=caption_prompt`
  - 有参考图时，后端会先调用视觉语言模型读取参考图，再把参考说明拼入真实文生图 prompt
  - 当前实现是“参考图语义参与文生图”，不是直接的 `img2img / image.edit`
- 验收标准：
  1. 参考图在至少一个真实 provider 下参与生成
  2. 失败路径有明确错误信息
  3. 使用方式写入文档

### Task: [task-004] 增加最小认证与项目级访问控制
- 状态：DONE
- 目标：
  - 避免任务和模板完全依赖前端传入的用户标识
- 完成说明：
  - 已新增 `QMDH_AUTH_USERS_JSON` 配置和 `X-QMDH-Auth` / `X-QMDH-User` 请求头认证
  - 后端任务与模板接口改为从认证 token 派生可信用户，不再接受前端 payload / query 中的执行人作为事实源
  - 项目、任务、资产按认证用户的 `project_codes` 做最小访问过滤或拒绝
  - 前端统一附带 MVP 认证头，任务与模板创建请求不再发送 `user_name`
  - 前端会在认证后的可见项目列表变化时自动切到首个可访问项目，避免默认项目越权提交
  - 前端切换项目或重置创作时会同步项目分级，避免沿用旧项目的 `classification`
- 边界：
  - 后端认证入口
  - 任务、模板与项目访问边界
- 验收标准：
  1. 前端不能再随意伪造执行人：已完成
  2. 模板、任务至少具备最小用户边界：已完成
  3. 审计来源更可信：已完成

### Task: [task-006] 完成 MVP 1.0 服务器部署基线
- 状态：DONE
- 完成说明：
  - 已具备 `frontend + backend + worker + postgres + redis` 的部署编排
  - 已补充 Dockerfile、Nginx 反代和部署文档
  - 已补充 Windows 本地一键开发启动脚本 `start-dev.cmd` 和 npm 别名 `dev:all` / `dev:check`
  - 当前仍需继续补生产环境参数与运维说明

### Task: [task-007] 增加后台模型与 Key 管理入口
- 状态：DONE
- 目标：
  - 允许在前端后台面板维护真实生图 provider、model、base URL、API key 和能力记录
  - 让后台保存的 provider 配置真实参与 `/providers` 列表、任务创建校验和任务执行
- 完成说明：
  - 后端新增 `provider_profiles` 数据表、CRUD 接口和脱敏 key 返回
  - `model_registry` 支持合并 `.env` provider 与数据库 provider；同名数据库配置可覆盖环境配置
  - 模型管理已支持 `/providers/discover` + `/providers/bulk-import` 的显式探测/导入链路；当前 runtime provider 以后台启用的 provider profile 为准，不再依赖隐藏自动派生
  - `FireRedTeam/FireRed-Image-Edit-1.1` 已确认要求图片上传；当前通过后端白底图兼容桥接进入设计师文生图列表，后续仍建议补专用 `image.edit` workflow / adapter
  - 设计师页面的模型列表只读取真实 runtime provider，不再显示 `jimeng`、`nano_banana` 等模拟占位项
  - 任务创建与执行都改为读取数据库会话下的 provider 注册表
  - 模型管理已从设计师工作台侧栏拆出，独立放在 `/admin/models`
  - Provider profile 管理接口只允许 `admin / owner / ops` 角色访问
  - 已补充后端 provider profile 单测
- 验收标准：
  1. 前端 build 通过：已完成
  2. 后端单测通过：已完成
  3. 前端不展示明文 API key：已完成
  4. 设计师工作台不暴露模型管理入口：已完成
  5. 设计师模型列表不显示模拟 provider：已完成

### Task: [task-008] 上线数据库账号系统与使用看板
- 状态：DONE
- 目标：
  - 用数据库用户、密码登录和 session 替代纯 `.env` token 用户
  - 让管理员维护设计师账号、角色和项目授权
  - 给管理人员提供使用、成本、模型调用和失败原因看板
- 完成说明：
  - 已扩展 `users` 表，新增密码哈希、显示名、启停状态、项目授权、月度额度、最后登录时间和更新时间
  - 已新增 `auth_sessions` 表，使用 PBKDF2 密码哈希和 7 天会话 token
  - 已新增 `/api/v1/auth/login`、`/api/v1/auth/logout`、`/api/v1/auth/me`
  - 已新增 `/api/v1/users` 用户管理接口，`owner / admin` 可创建、编辑、停用和重置密码
  - 后端认证优先读取 `Authorization: Bearer <token>`，短期保留 `X-QMDH-Auth` 兼容路径
  - `/admin/users` 提供账号管理页，`/admin/dashboard` 提供使用与成本看板
  - `/admin/models` 保留为运维配置入口，不再作为设计师侧能力
  - 看板面向 `owner / admin / ops`，统计任务数、成功率、失败数、成本、用户排行、项目排行、provider / model 分布和失败原因
  - 已补充管理页互跳：`/admin/users`、`/admin/dashboard`、`/admin/models` 之间可直接跳转
  - 已将成本口径改为真实计费配置：模型后台维护 `pricing_currency / pricing_unit / unit_price`，成功任务按实际输出张数或请求次数写入 `tasks.cost`
  - 已移除模拟 provider 的随机成本；历史模拟成本在 schema 刷新时归零，避免看板继续显示虚假支出
  - 已补充失败原因 Top 展示，失败项会带出相关 provider、用户和项目，方便排查类似 `jimeng` 未配置导致的调度失败
  - 已新增账号级监管：看板按账户显示月度额度、已用额度、剩余额度、任务成功/失败、provider 调用和模型调用
  - 已预置本地开发账号包，并生成本机忽略清单 `local/qmdh-dev-accounts.md`，可通过 `open-accounts.cmd` 打开
- 验收标准：
  1. 后端账号与权限单测通过：已完成
  2. 前端 build 通过：已完成
  3. 设计师账号无法访问用户管理、模型运维和看板：已完成
  4. `ops` 可访问看板和模型运维但不可管理用户：已完成
  5. `owner / admin` 可管理用户：已完成

### Task: [task-admin-ui-001] 统一后台管理面板样式与信息结构
- 状态：DONE
- 目标：
  - 按后台面板参考图统一运营看板、项目管理、模型管理、账号管理和设置中心的信息结构与视觉风格
  - 基于现有后端能力轻量补齐 `/admin/projects` 和 `/admin/settings`，不做空壳账单、告警和日志页面
- 完成说明：
  - 后台侧栏已统一为运营看板、项目管理、模型管理、账号管理、设置中心
  - `/admin/projects` 已使用现有项目、任务和看板数据提供只读项目监控页与右侧详情面板，不提供项目 CRUD
  - `/admin/settings` 已提供轻量设置中心概览，展示系统信息、功能开关说明、资源使用和现有管理入口，不写入真实配置
  - `/admin/users` 已改为统计卡、工具条、账号表格和右侧创建/编辑面板，保留现有账号保存、停用和重置密码能力
  - `/admin/models` 已改为统计卡、工具条、模型表格和右侧模型配置面板，保留现有新增、编辑、删除、启停和计费配置能力
  - `/admin/dashboard` 本轮只做样式与信息结构延续，不接入真实时间序列
- 边界：
  - `frontend/src/App.tsx`
  - `frontend/src/styles.css`
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/projects/QMDH-001/status.md`
- 验收标准：
  1. 前端 build 通过：已完成
  2. 新增 `/admin/projects` 和 `/admin/settings` 前端路由：已完成
  3. 不推进 `task-009`，真实时间序列仍保持 TODO：已确认

### Task: [task-009] 运营看板接入真实时间序列
- 状态：DONE
- 目标：
  - 让 `/admin/dashboard` 中的成本趋势、模型调用趋势、失败趋势从后端真实时间聚合生成
  - 替换当前前端静态示意图形
- 完成说明：
  - `GET /dashboard/stats?days=N` 响应新增 `daily_series`（按 UTC 自然日的任务数、成功/失败、成本）与 `model_calls_by_day`（按日 + Top 模型切片的调用次数，含「其他」）；统计窗口与序列同为「自今日起向前 N 个 UTC 自然日」
  - 前端运营看板用上述字段绘制成本/失败双折线与模型堆叠柱，支持 7/30 天切换与无数据空状态
- 边界：
  - `backend/app/routers/dashboard.py`
  - `backend/app/schemas.py`
  - `frontend/src/App.tsx`
  - `frontend/src/styles.css`
- 验收标准：
  1. 支持按天聚合最近 7 / 30 天的任务、成本、模型调用和失败数据：已完成
  2. 图表为空时有清晰空状态：已完成
  3. 后端单测与前端 build 通过：已完成

### Task: [task-010] 生产化安全与数据迁移补强
- 状态：DONE
- 目标：
  - 补 provider key 加密、操作审计和正式 migration
- 边界：
  - 后端配置、数据库 schema、provider profiles、审计日志
- 完成说明：
  - **API key 加密**：已使用 `cryptography.fernet` 对称加密，`ProviderProfile.api_key` 存储加密值
  - **操作审计**：已扩展 `AuditLog` 模型支持管理操作，为用户 CRUD 和 provider CRUD 添加审计日志
  - **正式 migration**：已引入 Alembic，配置 `migrations/env.py`，生成初始 schema migration
  - 已移除 `bootstrap.py` 中的 `ensure_schema` ALTER TABLE 逻辑，schema 变更改由 Alembic 管理
- 验收标准：
  1. API key 不再以明文业务字段保存：已完成
  2. 用户、模型、价格配置等管理操作有审计记录：已完成（用户/Provider）
  3. schema 变更不再只依赖启动时 `ALTER TABLE`：已完成

### Task: [task-011] 设计师工作台主页重设计
- 状态：DONE
- 目标：
  - 参考外部设计图，重新整理设计师主页的信息结构
  - 减少历史流长提示词占屏，强化图片结果、复用、当前创作输入区
- 边界：
  - `frontend/src/App.tsx`
  - `frontend/src/styles.css`
- 完成说明：
  - 生成页已回收过度扩张的信息卡片，恢复为以生成结果与创作输入为主的更简洁结构
  - 保留并强化了历史记录中的长提示词摘要/折叠能力，避免单条记录占满首屏
  - 生成区、历史流和输入区的层级已重新收敛，不再额外引入“历史摘要 / 创作资源 / 当前输入”大卡片
- 验收标准：
  1. 1920x1080 下首屏保持生成结果与创作输入优先，不出现多余总览卡片：已完成
  2. 长提示词折叠或摘要化：已完成
  3. 前端 build 通过：已完成

### Task: [task-012] 模型管理页"探测并批量导入"功能
- 状态：DONE
- 完成说明：
  - 探测/批量导入功能已实现并验证
  - 已移除 ModelScope 自动派生逻辑（`_add_modelscope_image_variants`），改为所见即所得：管理页有什么模型，设计师工作台就展示什么模型

### Task: [task-013] 账号批量导入与项目成员管理
- 状态：DONE
- 完成说明：
  - 批量创建 62 个员工账号（拼音首字母用户名 + 手机号后4位密码）
  - 角色映射：联席院长/负责人→admin，所长/主任/项目负责人→ops，设计师/行政→designer
  - 项目成员管理：`GET/PATCH /projects/{code}/members`，支持批量添加/移除
  - 前端项目面板显示成员列表，ops+ 可编辑成员（左侧全体成员勾选 + 右侧浮动参与人面板 + 保存）
  - 项目 CRUD：`POST /projects`（创建）、`PATCH /projects/{code}`（重命名）、`DELETE /projects/{code}`（删除，含任务清理）
  - 管理后台 `/admin/projects` 支持重命名和删除项目
  - 从 bootstrap 种子数据中移除 QMDH-SEC 项目

### Task: [task-014] 灵感页与标记功能
- 状态：DONE
- 完成说明：
  - 新增 `asset_bookmarks` 表和 `POST /assets/{id}/bookmark` toggle 接口
  - FeedCard "点赞"改为"标记"（收藏），支持标记/取消标记
  - 新增 `inspiration_posts` 表和 `/api/v1/inspiration` CRUD 接口
  - 灵感页独立视图：分类标签栏（建筑/景观/室内/城市/构图/材质/光影/色彩）+ 卡片网格
  - 支持管理员导入外部参考和用户分享生成结果
  - 灵感页全屏布局，隐藏项目面板和生成输入框
  - FeedCard 新增"删除"按钮，支持删除单条生成记录（含关联资产和 provider 调用）
  - **已填充 12 条建筑参考案例**：Moriyama House、Villa Savoye、宁波博物馆、Luum Temple、红砖美术馆、Fallingwater、绩溪博物馆、Tama Library、龙美术馆、Thermal Baths Vals、阿那亚艺术中心、House NA（来源标注 ArchDaily / 古德设计网）

### Task: [task-015] 任务软删除与基础运营留痕
- 状态：DONE
- 目标：
  - 避免设计师删除任务后直接抹掉运营看板、账号用量和模型调用统计
  - 为后续 PostgreSQL/生产化部署保留稳定的数据留痕口径
- 完成说明：
  - `DELETE /tasks/{id}` 已改为软删除，写入 `tasks.deleted_at`
  - `/api/v1/tasks` 和任务详情默认隐藏已删除任务，设计师前台不再看到被删除任务
  - `/api/v1/dashboard/stats` 与账号额度统计继续纳入已软删除任务的成本、成功/失败和调用历史
  - 删除理由与删除时间写入 `task.soft_deleted` 审计日志
  - 已补 `deleted_at` migration 与后端测试，覆盖列表隐藏、额度不回退与审计留痕
- 验收标准：
  1. 删除已完成任务后，`/admin/dashboard` 与账号用量不回退：已完成
  2. 运营侧能追溯任务删除前的 provider/model/cost 口径：已完成（保留 task + provider call + audit）
  3. 前后端单测与 build 通过：已完成

### Task: [task-016] 项目级删除归档与用量账本补强
- 状态：DONE
- 目标：
  - 避免项目删除或后续清理流程再次硬删任务与 provider 调用，绕过已建立的软删除口径
  - 为未来 PostgreSQL/生产化/2.0 升级预留更稳定的 `usage_ledger / archive` 口径
- 边界：
  - `backend/app/routers/projects.py`
  - `backend/app/routers/dashboard.py`
  - 新增或扩展任务归档 / 用量账本数据表
  - 必要的删除策略说明与文档同步
- 首轮 2.0 Compatibility Check：
  - 这个改动不应绕开现有 `Workflow + Task` 主轴；项目删除策略应复用 task 侧已建立的软删除 / 归档口径
  - 数据结构需要能继续扩展 `provider / model / cost / operator / project snapshot / artifact`，不把历史再塞回自由 JSON
  - 删除后的历史结果应继续沉淀到项目或项目归档维度，而不是随页面状态一起消失
  - 归档与清理过程必须可追踪、可恢复、可审计，至少保留删除动作、操作者、时间和影响范围
  - 未来研究型 / 协作型工作流若引入 run / step / artifact，应该能复用同一层 `usage_ledger / archive` 口径
- 拟定方案：
  - 保留现有 task 软删除，不回退为硬删除
  - 为项目删除、批量清理或后续历史回收设计 `usage_ledger / task_archive` 一类结构化留痕
  - 明确项目删除时 `task / provider_call / asset` 的保留、解绑或归档策略
- 当前进展：
  - 已完成第一阶段实现：`DELETE /projects/{code}` 不再硬删 `project / task / provider_call`
  - 当前项目删除已改为“项目归档语义”：`projects.archived_at` 标记归档、前台项目列表隐藏、成员解绑、资产解除 `project_id`
  - 项目归档时会批量软删该项目下仍可见的 task，保留 provider call、成本、失败原因与 dashboard / quota 统计口径
  - 已补第二阶段基础归档层：新增 `task_archives` 与 `provider_call_archives`，在 task 软删与 project 归档时写入结构化快照
  - 已新增独立 `usage_ledgers` 账本表，并在 task 执行终态、task 软删、project 归档路径补齐 task / provider_call 级记账
  - `/api/v1/dashboard/stats` 已切换为账本读口径；新增 migration 会为历史 `tasks / provider_calls` 回填账本，避免新旧数据断层
- 验收标准：
  1. 删除项目或做批量清理后，运营统计与账号用量不回退：已完成（项目归档 + task 软删 + 账本读口径）
  2. 运营侧仍能追溯 provider/model/cost/operator/project snapshot：已完成（usage ledger + archive snapshot + project.deleted audit）
  3. 方案符合 `docs/data-governance.md` 与 `docs/roadmap-2.0-prep.md`：已完成

### Task: [video-001] Video provider execution path
- Status: DONE
- Goal:
  - Add real `video.generate` provider execution paths without extending the Studio refactor PR or putting new video protocol logic into the large Studio file.
  - Support DashScope async video providers such as Wan / HappyHorse, Volcengine Ark / Seedance, and Volcengine Jimeng native through provider profile configuration.
- Boundary:
  - Backend provider strategy, task execution, provider probing, media storage result persistence, focused tests, migration, and `/admin/models` configuration affordances.
  - No designer Studio video UI in this task.
  - No Anthropic runtime, no upload protocol change, no deploy.
- Current progress:
  - Added a provider adapter layer under `backend/app/services/provider_adapters/`.
  - Added `dashscope_async_video`, `volcengine_ark_video_tasks`, and `volcengine_cv_jimeng_video` strategies for `video.generate`.
  - Implemented DashScope async submit / poll / video download / media storage persistence.
  - Implemented Volcengine Ark / Seedance content-generation task submit / poll / video persistence.
  - Implemented Volcengine Jimeng native CV OpenAPI signed submit / poll / video persistence.
  - Added encrypted `api_secret` and JSON `adapter_config` fields for provider profiles, with Alembic migration and bootstrap compatibility.
  - Kept `POST /tasks` + `workflow_key=video-generate` as the task creation path.
  - Stored video results in existing `Task.result.storage_path/storage_paths` and reused existing `AssetType.video` materialization.
  - Added admin model configuration support for `dashscope_native`, `volcengine_ark`, `jimeng_native`, `mp4`, `per_video`, `api_secret`, and `adapter_config`.
  - Added focused backend tests for strategy/profile configuration, safe probe behavior, DashScope adapter execution, Volcengine video adapters, and video asset materialization.
- Acceptance criteria:
  1. `video.generate` provider profile with `{"video.generate":"dashscope_async_video"}` can execute a mocked DashScope task and persist an mp4 result.
  2. `video.generate` provider profile with `{"video.generate":"volcengine_ark_video_tasks"}` can execute a mocked Ark / Seedance task and persist an mp4 result.
  3. `video.generate` provider profile with `{"video.generate":"volcengine_cv_jimeng_video"}` can execute mocked signed CV submit / poll requests and persist an mp4 result.
  4. Completed video tasks materialize a video asset.
  5. Provider probe for async video profiles is configuration-only and does not create a live upstream video task.
  6. Existing OpenAI image execution tests still pass.
- Verification:
  - `backend/.venv/Scripts/python.exe -m pytest tests/test_task_executor_dashscope_video.py tests/test_task_executor_volcengine_video.py -q`
  - `backend/.venv/Scripts/python.exe -m pytest tests/test_provider_profiles.py -q`
  - `backend/.venv/Scripts/python.exe -m pytest tests/test_task_executor_openai.py tests/test_task_error_reporting.py tests/test_model_registry_profiles.py -q`
  - `backend/.venv/Scripts/python.exe -m alembic heads`
  - `frontend`: `npm run build`
- Remaining follow-up:
  - Add a guarded live smoke checklist once real provider credentials are available.
  - Designer Studio video UI tracked separately as **`video-002`**.

### Task: [video-002] Designer Studio video generation UI
- Status: DONE (UI); live E2E smoke TODO
- Goal:
  - Expose `video-generate` in the refactored Studio composer without a parallel task API.
  - Let designers submit video tasks, poll history, preview mp4 assets, and reuse completed runs.
- Boundary:
  - `frontend/src/features/studio/*` only; reuse existing `POST /tasks` + backend adapters from `video-001`.
- Completion notes (2026-06-11):
  - Added **视频生成** creation mode alongside 文生图 / 图像编辑.
  - Provider list filters runtime `video.generate` profiles; submission uses `workflow_key=video-generate` and `buildVideoPayload`.
  - History feed scopes to video tasks/assets in video mode; feed cards render `<video>` previews and lightbox playback.
  - Template / 张数 menus hidden in video mode; optional reference images supported; share-to-inspiration disabled for video assets.
- Acceptance criteria:
  1. Frontend build passes with video mode wired through existing Studio controller/submission path.
  2. Video mode submits `video-generate` tasks when a video provider is selected.
  3. Completed video tasks show playable mp4 in history cards/lightbox.
  4. Live provider E2E smoke completed on production for Haodeya Grok (2026-06-12).

### Task: [video-grok-001] Haodeya Grok Imagine Video four-SKU integration
- Status: DONE
- Goal:
  - Integrate Haodeya Grok four SKUs through `haodeya_grok_video` adapter and Studio SKU switcher.
- Completion notes (2026-06-12):
  - Submit / poll / `/content` download aligned with upstream final doc
  - i2v `frame_images` uses `type: image_url` + `frame_type: first_frame`
  - Production verified on `https://cityusbdisk.cn` for text-only and reference-image i2v
  - Typical latency: 2–6+ minutes per task (upstream async)
- Archive: `docs/archive/handoff-2026-06-12-grok-video-production.md`

---

## Next Suggested Step

> **以 `Development Sequence (2026-06)` 为准；Grok 生产验证已完成。**

1. **修复服务器 deploy key**，恢复 `git pull`（部署仍可用 git bundle）。
2. 继续 Production Readiness backlog（`prod-002`、`prod-004` 等）。
3. 可选：清理本地 worktree `E:\projects\QMDH-web-pr1-review`。

---

## Previous Suggested Step

1. 优先处理 `gpt-image-2` 参考图真实上传修复：提交并部署当前本地补丁，然后在服务器复测一条带参考图的任务，确认上游实际收到图片输入而不是纯文本请求
2. 如果当前目标是稳定服务器灵感库，优先上传并导入本地 `tmp/seed-inspiration-bundle.zip`，不要继续依赖服务器直接重抓 ArchDaily
3. 若导入后仍要求“标题与封面严格一一对应”，为默认 seed 图补一版人工钉死映射，再重新构建并导入 bundle
4. 回到 `prod-001`：继续拆分 `frontend/src/features/studio/GenerateStudioShell.tsx`，降低当前前端最大热点文件的维护风险
5. 评估项目归档后的管理端可见性需求：是否需要 `/admin/projects` 增加“已归档项目”只读视图

---

## Production Readiness Backlog

以下为生产化部署前应完成的准备工作，按优先级排列。

### 近期可做（低风险、不影响现有数据）

| ID | 任务 | 说明 | 优先级 |
|----|------|------|--------|
| prod-001 | GenerateStudioShell 拆分 | 将 `frontend/src/features/studio/GenerateStudioShell.tsx` 继续拆为更小的 hooks / panels，降低 4000+ 行热点维护成本 | P1 |
| prod-002 | 环境变量规范化 | 新增 `.env.production.example`，标注必填/可选/默认值 | P1 |
| prod-003 | 后端日志结构化 | 统一 JSON 格式日志输出，方便 ELK/Loki 采集 | P2 |
| prod-004 | 健康检查增强 | `/health` 检查 DB 连接、Redis 连接，支持 k8s 存活探针 | P2 |

Current `prod-001` WIP:
- Status: IN_PROGRESS
- Phase 1 checkpoint completed on 2026-06-09:
  - WIP was moved onto local protection branch `codex/prod-001-studio-refactor`; no commit, push, or deploy was performed.
  - Local HEAD remains `005e25d`; GitHub `origin/main` was rechecked at `005e25d33e3a99ba4501c46428d19fee522ab91a`.
  - Current largest TSX hotspots after recount are `StudioWorkspacePane.tsx` 52 lines, `StudioHistoryFeedItem.tsx` / `StudioSharedTemplatePreviewImages.tsx` / `StudioShareConfirmLightbox.tsx` 49 lines, and `StudioComposerCollapsedBar.tsx` 47 lines.
  - Current largest TS hotspots after the twenty-third Phase 2 chunk are `studioDerivedState.ts` 107 lines, `useSharedTemplateBrowser.ts` 107 lines, `useStudioGalleryActions.ts` 106 lines, `useSharedTemplatePreview.ts` 106 lines, and `useStudioTemplates.ts` / `useStudioReferenceUploads.ts` 103 lines; `useGenerateStudioController.ts` is 93 lines, `useStudioTaskActions.ts` is 91 lines, `useStudioTaskSubmission.ts` is 96 lines, `useCustomStudioTemplateMutations.ts` is 100 lines, and `useCustomStudioTemplates.ts` is 78 lines.
  - Five-stage continuation Stage 1 was rechecked and recorded at 2026-06-09 01:31 +08:00: branch `codex/prod-001-studio-refactor`, local HEAD `005e25d`, recent commits `005e25d` / `6ae35b1` / `ceda88e` / `c9a9161` / `57d134c`, same broad uncommitted WIP, and the same current hotspot snapshot above.
- Phase 2 first chunk completed on 2026-06-09:
  - `useStudioReferenceUploads.ts` now delegates the base64 upload transport loop to `uploadReferenceFiles` in `studioReferenceUtils.ts`.
  - Behavior kept unchanged: reference upload still uses base64 data URLs, `api.uploadReferenceImage`, per-file size validation, object URL preview creation, and failure-time preview cleanup.
  - Verification passed: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 second chunk completed on 2026-06-09:
  - `useCustomStudioTemplates.ts` now delegates custom template save/delete API orchestration to new `customStudioTemplateActions.ts`.
  - Behavior kept unchanged: private template validation, create/update/delete calls, success/error feedback, sorted upsert/remove, and edit-state reset behavior are preserved.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 third chunk completed on 2026-06-09:
  - `studioCanvasProps.ts` now delegates composer/history prop construction to `studioComposerCanvasPropsBuilder.ts` and `studioHistoryCanvasPropsBuilder.ts`.
  - Behavior kept unchanged: `StudioDesignerView` still calls the same `buildStudioCanvasProps` entrypoint and receives the same composer/history prop shape.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 fourth chunk completed on 2026-06-09:
  - `useStudioTaskSubmission.ts` now delegates task payload construction, pending/created submission tracker derivation, and shared-template submit-success tracking to `studioTaskSubmissionActions.ts`.
  - Behavior kept unchanged: provider validation, requested-provider correction, in-flight guard, `api.createTask` payload shape, forced data reload, and failure feedback remain in the same submit flow.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 fifth chunk completed on 2026-06-09:
  - `useStudioGalleryActions.ts` now delegates gallery asset replacement, gallery preview replacement, deleted-task state filtering, share-confirm state construction, and error-message fallback handling to `studioGalleryActionUtils.ts`.
  - Behavior kept unchanged: bookmark/share/delete API calls, feedback messages, pending-action state, share confirmation gating, and gallery preview cleanup still happen in the same action flow.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 sixth chunk completed on 2026-06-09:
  - `useSharedTemplateBrowser.ts` now delegates category expansion, category/subcategory availability checks, active heading derivation, and category toggle state to `sharedTemplateBrowserState.ts`.
  - Behavior kept unchanged: shared-template filtering, quick-filter/category/subcategory activation, hover preview wiring, impression tracking, and apply tracking remain in the same browser flow.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 seventh chunk completed on 2026-06-09:
  - `studioComposerExpandedContentProps.ts` now delegates leading/body/reference-input/toolbar prop partitioning to `studioComposerExpandedContentPropBuilders.ts` and `studioComposerToolbarPropsBuilder.ts`.
  - Behavior kept unchanged: `StudioComposerExpandedContent` still calls the same `getStudioComposerExpandedContentProps` entrypoint and receives the same prop groups.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 eighth chunk completed on 2026-06-09:
  - `studioTaskUtils.ts` now re-exports focused task helper modules: `studioTaskTitleUtils.ts`, `studioTaskFailureUtils.ts`, `studioTaskReferenceUtils.ts`, and `studioTaskProgressUtils.ts`.
  - Behavior kept unchanged: existing `studioUtils.ts` re-export and direct `studioTaskUtils` import paths still work, with the same title/summary, failure, reference-image, virtual-progress, requested-count, and result-string helpers.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 ninth chunk completed on 2026-06-09:
  - `useCustomStudioTemplates.ts` now delegates custom-template draft/edit/feedback React state to `useCustomStudioTemplateEditorState.ts`.
  - Custom-template error feedback and edit-clear predicates now live in `customStudioTemplateState.ts`.
  - Behavior kept unchanged: private-template draft sync, edit snapshot restore, template-menu focus, save completion feedback, delete cleanup, and error propagation remain wired through the same custom-template flow.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 tenth chunk completed on 2026-06-09:
  - `useStudioReferenceUploads.ts` now delegates storage-path extraction, indexed upload removal, uploading tracker construction, and transient tracker cleanup checks to `studioReferenceUtils.ts`.
  - Behavior kept unchanged: reference uploads still use base64 data URLs, `api.uploadReferenceImage`, image filtering, size validation, preview URL release, input reset, and the same upload/submission tracker lifecycle.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 eleventh chunk completed on 2026-06-09:
  - `useStudioTaskActions.ts` now delegates history-task composer application and regenerate feedback derivation to `studioTaskActionUtils.ts`.
  - Behavior kept unchanged: task-to-form derivation, reference upload replacement, composer menu closing, scroll-back behavior, in-flight guard, pending action state, submit call, success/error feedback, and cleanup remain wired through the same task-action flow.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 twelfth chunk completed on 2026-06-09:
  - `useGenerateStudioController.ts` now delegates selected reference-upload provider-name derivation, submission-progress construction, and controller return-object assembly to `studioControllerProps.ts`.
  - Behavior kept unchanged: React hook call order, controller hook orchestration, data/template/project/reference/gallery/view/task wiring, and returned controller shape remain the same.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
  - Next Phase 2 target should be another very small controller/helper split only if hook call order remains untouched, or a deeper browser visual smoke pass before any commit/deploy decision.
- Phase 2 thirteenth chunk completed on 2026-06-09:
  - `useGenerateStudioController.ts` now delegates hook option construction to focused pure helper modules: `studioControllerDataOptions.ts`, `studioControllerReferenceOptions.ts`, `studioControllerViewOptions.ts`, and `studioControllerTaskOptions.ts`; `studioControllerHookOptions.ts` is an 8-line re-export shim.
  - Behavior kept unchanged: hook invocation order, controller state/setter/ref wiring, selected-provider fallback, reference upload tracker inputs, view-effect inputs, task-action inputs, submission progress, and returned controller shape remain the same.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 fourteenth chunk completed on 2026-06-09:
  - `useStudioReferenceUploads.ts` now delegates reference-upload list state, form reference-image sync, preview URL cleanup, list removal/replacement, and restored-upload construction to `useStudioReferenceUploadState.ts`.
  - Behavior kept unchanged: uploads still use base64 data URLs and `api.uploadReferenceImage`; `replaceReferenceUploads` still replaces only the local preview list because history-task reuse sets the full form separately.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 fifteenth chunk completed on 2026-06-09:
  - `studioTaskActionUtils.ts` now delegates historical task-to-form derivation and provider compatibility fallback to `studioTaskFormUtils.ts`.
  - Behavior kept unchanged: task reuse/regenerate still derives the same edit/generate mode, prompt/style/aspect/resolution/deliverable/notes, image count, provider, form reference image paths, and restored reference-upload previews.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 sixteenth chunk completed on 2026-06-09:
  - `studioReferenceUtils.ts` now delegates the base64 reference-upload transport loop to `studioReferenceUploadTransport.ts`.
  - Behavior kept unchanged: uploads still use base64 data URLs and `api.uploadReferenceImage`; per-file size validation, object URL previews, failure-time preview cleanup, and existing file-preparation validation remain in the same flow.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 seventeenth chunk completed on 2026-06-09:
  - `useCustomStudioTemplates.ts` now delegates custom-template save/delete React callbacks to `useCustomStudioTemplateMutations.ts`.
  - Behavior kept unchanged: private-template save/delete still uses the same API helper functions, validation, sorted upsert/remove state updates, edit-state cleanup, template feedback, and global error handling.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 eighteenth chunk completed on 2026-06-09:
  - `useStudioTaskSubmission.ts` now delegates requested-provider sync, in-flight begin guard, failure tracker/error state, and final cleanup to `studioTaskSubmissionState.ts`.
  - Behavior kept unchanged: submit flow still closes the composer menu, clears template feedback, resolves and validates provider, builds the same payload/tracker, calls `api.createTask`, tracks shared-template submit success, resets auto-positioning, reloads data, and returns the same success/failure booleans.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 nineteenth chunk completed on 2026-06-09:
  - `studioControllerProps.ts` now delegates Studio controller return-object assembly to `studioControllerResult.ts`.
  - Behavior kept unchanged: `useGenerateStudioController.ts` still imports `buildStudioControllerResult` from `studioControllerProps.ts`, receives the same controller return shape, and keeps the same React hook call order.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 twentieth chunk completed on 2026-06-09:
  - `useSharedTemplateBrowser.ts` now delegates shared-template apply, quick-filter, category, and subcategory action handlers to `useSharedTemplateBrowserActions.ts`.
  - Behavior kept unchanged: apply still tracks the `apply` event before calling `onApplyTemplate`; quick-filter/category/subcategory actions still reset the same state and preserve category expansion behavior.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 twenty-first chunk completed on 2026-06-09:
  - `useStudioTaskActions.ts` now delegates its cross-hook options/type contract to `studioTaskActionsTypes.ts`.
  - Behavior kept unchanged: apply-to-composer, regenerate, submit hook wiring, feedback, and form submit flow still run through the same helpers and React hook order.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 twenty-second chunk completed on 2026-06-09:
  - `useStudioTaskSubmission.ts` now delegates its cross-hook options/type contract to `studioTaskSubmissionTypes.ts`.
  - Behavior kept unchanged: provider resolution, validation, requested-provider sync, in-flight guard, tracker creation, `api.createTask`, shared-template tracking, reload, failure state, and cleanup order still run through the same callback.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Phase 2 twenty-third chunk completed on 2026-06-09:
  - `useStudioGalleryActions.ts` now delegates its cross-hook options/type contract to `studioGalleryActionsTypes.ts`.
  - Behavior kept unchanged: bookmark/share/delete API calls, pending action state, gallery preview replacement, task removal, share confirmation gating, feedback messages, and error propagation still run through the same hook functions.
  - Verification passed again: `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
- Five-stage continuation Stage 1 rechecked at 2026-06-09 01:54 +08:00:
  - Current largest TS hotspot is `studioReferenceUtils.ts` 128 lines.
  - The selected Stage 2 target was a behavior-preserving utility split in `studioReferenceUtils.ts`, keeping base64 upload transport unchanged; this was completed in the Phase 2 sixteenth chunk.
- Five-stage continuation Stage 4/5 refreshed after the selected reference utility split:
  - Current largest TS hotspots are now `useCustomStudioTemplates.ts` 125 lines, `useStudioTaskSubmission.ts` 122 lines, `useSharedTemplateBrowser.ts` 120 lines, and `studioControllerProps.ts` 120 lines.
  - Next Stage 2 target should be a small hook/helper split in one of those files, or final WIP review/staging preparation if the refactor is judged sufficiently small.
- Five-stage continuation Stage 4/5 refreshed after the custom-template mutation split:
  - Current largest TS hotspots are now `useStudioTaskSubmission.ts` 122 lines, `useSharedTemplateBrowser.ts` 120 lines, `studioControllerProps.ts` 120 lines, `useStudioTaskActions.ts` 116 lines, and `useStudioGalleryActions.ts` 112 lines.
  - Next Stage 2 target should be a small hook/helper split in `useStudioTaskSubmission.ts`, `useSharedTemplateBrowser.ts`, `studioControllerProps.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
- Five-stage continuation Stage 4/5 refreshed after the task-submission state split:
  - Current largest TS hotspots are now `studioControllerProps.ts` 120 lines, `useSharedTemplateBrowser.ts` 120 lines, `useStudioTaskActions.ts` 116 lines, and `useStudioTaskSubmission.ts` 113 lines.
  - Next Stage 2 target should be a small hook/helper split in `studioControllerProps.ts`, `useSharedTemplateBrowser.ts`, `useStudioTaskActions.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
- Five-stage continuation Stage 4/5 refreshed after the controller-result split:
  - Current largest TS hotspots are now `useSharedTemplateBrowser.ts` 120 lines, `useStudioTaskActions.ts` 116 lines, `useStudioTaskSubmission.ts` 113 lines, and `useStudioGalleryActions.ts` 112 lines.
  - Next Stage 2 target should be a small hook/helper split in `useSharedTemplateBrowser.ts`, `useStudioTaskActions.ts`, `useStudioGalleryActions.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
- Five-stage continuation Stage 4/5 refreshed after the shared-template browser action split:
  - Current largest TS hotspots are now `useStudioTaskActions.ts` 116 lines, `useStudioTaskSubmission.ts` 113 lines, `useStudioGalleryActions.ts` 112 lines, `studioDerivedState.ts` 107 lines, and `useSharedTemplateBrowser.ts` 107 lines.
  - Next Stage 2 target should be a small hook/helper split in `useStudioTaskActions.ts`, `useStudioGalleryActions.ts`, `studioDerivedState.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
- Five-stage continuation Stage 4/5 refreshed after the task-actions type-contract split:
  - Current largest TS hotspots are now `useStudioTaskSubmission.ts` 113 lines, `useStudioGalleryActions.ts` 112 lines, `studioDerivedState.ts` / `useSharedTemplateBrowser.ts` 107 lines, `useSharedTemplatePreview.ts` 106 lines, `useStudioReferenceUploads.ts` / `useStudioTemplates.ts` 103 lines, and `useCustomStudioTemplateMutations.ts` 100 lines.
  - Next Stage 2 target should be a small hook/helper split in `useStudioTaskSubmission.ts`, `useStudioGalleryActions.ts`, `studioDerivedState.ts`, `useSharedTemplatePreview.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
- Five-stage continuation Stage 4/5 refreshed after the task-submission type-contract split:
  - Current largest TS hotspots are now `useStudioGalleryActions.ts` 112 lines, `studioDerivedState.ts` / `useSharedTemplateBrowser.ts` 107 lines, `useSharedTemplatePreview.ts` 106 lines, `useStudioReferenceUploads.ts` / `useStudioTemplates.ts` 103 lines, and `useCustomStudioTemplateMutations.ts` 100 lines.
  - Next Stage 2 target should be a small hook/helper split in `useStudioGalleryActions.ts`, `studioDerivedState.ts`, `useSharedTemplatePreview.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
- Five-stage continuation Stage 4/5 refreshed after the gallery-actions type-contract split:
  - Current largest TS hotspots are now `studioDerivedState.ts` / `useSharedTemplateBrowser.ts` 107 lines, `useStudioGalleryActions.ts` / `useSharedTemplatePreview.ts` 106 lines, `useStudioReferenceUploads.ts` / `useStudioTemplates.ts` 103 lines, and `useCustomStudioTemplateMutations.ts` 100 lines.
  - Next Stage 2 target should be a small helper split in `studioDerivedState.ts`, `useSharedTemplateBrowser.ts`, `useSharedTemplatePreview.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
- `GenerateStudioShell.tsx` has been reduced to a 24-line auth/login/authenticated-shell entrypoint.
- The old Studio-owned admin branch has been removed from this WIP path; real admin routes now live under `frontend/src/pages/admin/*` and are reached through `router.tsx`.
- Extracted focused Studio modules now include `StudioAuthenticatedShell`, `StudioDesignerView`, `StudioCanvasView`, `StudioHistoryCanvas`, `StudioComposerCanvas`, `StudioComposerDock`, `StudioComposerExpandedContent`, `StudioComposerLeading`, `StudioComposerToolbar`, `StudioComposerToolbarMenus`, `StudioComposerTemplateMenuSlot`, `StudioComposerProviderMenuSlot`, `StudioComposerDisplayMenu`, `StudioComposerDisplayMenuPanel`, `StudioComposerDisplayMenuTrigger`, `StudioComposerOptionGroup`, `StudioComposerDisplayMenuSlot`, `StudioComposerCountMenuSlot`, `StudioComposerBody`, `StudioComposerModeSwitch`, `StudioReferenceDropzone`, `StudioReferenceUploadList`, `StudioPromptTextarea`, `StudioComposerCollapsedBar`, `StudioCustomTemplateSection`, `StudioCustomTemplateListItem`, `StudioFeedCard`, `StudioFeedCardResult`, `StudioFeedCardAvatar`, `StudioFeedCardTopline`, `StudioFeedCardSummary`, `StudioFeedCardFailureDetails`, `StudioFeedCardMeta`, `StudioAssetTile`, `StudioFeedCardActions`, `StudioFeedActionButton`, `StudioFeedCardFooter`, `StudioGalleryPreviewLightbox`, `StudioHistoryEmptyState`, `StudioHistoryFeed`, `StudioHistoryFeedItem`, `StudioHistoryFilters`, `StudioGlobalRail`, `StudioGlobalRailFooter`, `StudioGlobalRailNav`, `StudioLoginView`, `StudioMediaLightboxes`, `StudioNewProjectForm`, `StudioShareConfirmLightbox`, `StudioTemplateEditor`, `StudioTemplateEditorHeader`, `StudioTemplateEditorFeedback`, `StudioTemplateEditorFields`, `StudioTemplateEditorActions`, `StudioTemplateMenu`, `StudioTemplateMenuPanel`, `StudioTemplateMenuTrigger`, `StudioSharedTemplateBrowser`, `StudioSharedTemplateGrid`, `StudioSharedTemplateGridCard`, `StudioSharedTemplatePreview`, `StudioSharedTemplatePreviewContent`, `StudioSharedTemplatePreviewImages`, `StudioSharedTemplatePreviewFallback`, `StudioSharedTemplatePreviewPlaceholder`, `StudioSharedTemplateSection`, `StudioSharedTemplateSidebar`, `StudioSharedTemplateNav`, `StudioSharedTemplateQuickFilters`, `StudioSharedTemplateCategoryGroup`, `StudioSharedTemplateSearch`, `StudioWorkspaceHeader`, `StudioWorkspaceProjectActions`, `StudioWorkspaceProjectItem`, `StudioWorkspaceProjectList`, `StudioWorkspaceProjectRenameForm`, `customStudioTemplateUtils`, `studioAuthenticatedShellProps`, `studioComposerCanvasTypes`, `studioComposerDisplayMenuTypes`, `studioComposerDockProps`, `studioComposerDockTypes`, `studioComposerDockUtils`, `studioComposerExpandedContentProps`, `studioComposerExpandedContentTypes`, `studioComposerToolbarTypes`, `studioCustomTemplateSectionTypes`, `studioFeedActionUtils`, `studioFeedCardProps`, `studioFeedCardTypes`, `studioGlobalRailTypes`, `studioHistoryCanvasProps`, `studioHistoryCanvasTypes`, `studioHistoryFeedTypes`, `studioHistoryPaneTypes`, `studioMediaLightboxTypes`, `studioSharedTemplateGridTypes`, `studioSharedTemplatePreviewTypes`, `studioTemplateEditorTypes`, `studioTemplateMenuProps`, `studioTemplateMenuTypes`, `studioWorkspacePaneTypes`, `studioDerivedState`, `studioSubmissionProgress`, `studioTemplateUtils`, `studioTemplateBrowserUtils`, `studioAssetUtils`, `studioCapabilityUtils`, `studioFormatUtils`, `studioPayloadUtils`, `studioReferenceUtils`, `studioTaskUtils`, `studioTaskActionUtils`, `studioTaskSubmissionValidation`, `studioTemplateFormUtils`, `useGenerateStudioController`, `useSharedTemplateBrowser`, `useSharedTemplatePreview`, `useSharedTemplateTracking`, `useCustomStudioTemplates`, `useStudioAuth`, `useStudioComposerCollapse`, `useStudioControllerState`, `useStudioDataLoader`, `useStudioDefaults`, `useStudioFeedCardState`, `useStudioGalleryActions`, `useStudioGalleryPreviewEffects`, `useStudioHistoryFeedback`, `useStudioProjects`, `useStudioReferenceUploads`, `useStudioTaskActions`, `useStudioTaskSubmission`, `useStudioTemplates`, `useStudioViewEffects`, `useVirtualTaskProgress`, and shared Studio utils/types/constants.
- Latest split moved the `useStudioTaskSubmission` cross-hook options/type contract into `studioTaskSubmissionTypes`; earlier splits moved the `useStudioTaskActions` cross-hook options/type contract into `studioTaskActionsTypes`; moved shared-template hover preview state, preview-image aspect probing, and template event tracking out of `useSharedTemplateBrowser`; moved shared-template browser action handlers into `useSharedTemplateBrowserActions`; moved custom template draft/edit/save/delete state out of `useStudioTemplates`; moved custom-template save validation/payload/list helpers into `customStudioTemplateUtils`; moved custom-template API orchestration into `customStudioTemplateActions`; moved custom-template editor state into `useCustomStudioTemplateEditorState`, feedback/edit predicates into `customStudioTemplateState`, and custom-template save/delete React callbacks into `useCustomStudioTemplateMutations`; moved reference-upload file filtering, preview URL release helpers, storage-path extraction, indexed removal, uploading tracker construction, and transient tracker cleanup checks into `studioReferenceUtils`; moved reference-upload transport into `studioReferenceUploadTransport`; moved task submission/create-task orchestration out of `useStudioTaskActions`; moved task-submission state transitions into `studioTaskSubmissionState`; moved history-task composer application and regenerate feedback derivation into `studioTaskActionUtils`; moved controller return-object assembly into `studioControllerResult` while keeping `studioControllerProps` as the import surface; split composer collapse/defaults/gallery-preview effects out of `useStudioViewEffects`; moved controller base state/refs/error helpers into `useStudioControllerState`; split `StudioComposerDock` into a 43-line shell plus `StudioComposerExpandedContent`, `studioComposerDockProps`, `studioComposerDockTypes`, and `studioComposerDockUtils`; split `StudioSharedTemplateBrowser` into sidebar/grid/preview view components; split `StudioSharedTemplateGrid` into a 29-line shell plus `StudioSharedTemplateGridCard` and `studioSharedTemplateGridTypes`; split `StudioSharedTemplateSidebar` into a 20-line shell plus `StudioSharedTemplateSearch`, `StudioSharedTemplateQuickFilters`, `StudioSharedTemplateCategoryGroup`, and `StudioSharedTemplateNav`; split `StudioSharedTemplateCategoryGroup` into a 30-line shell plus `StudioSharedTemplateCategoryButton`, `StudioSharedTemplateSubcategoryList`, and `studioSharedTemplateCategoryTypes`; split `StudioSharedTemplatePreview` into a 27-line hover-preview shell plus `StudioSharedTemplatePreviewContent`, `StudioSharedTemplatePreviewImages`, `StudioSharedTemplatePreviewFallback`, `StudioSharedTemplatePreviewPlaceholder`, and `studioSharedTemplatePreviewTypes`; split `StudioComposerToolbarMenus` into a 17-line composition shell plus `StudioComposerTemplateMenuSlot`, `StudioComposerProviderMenuSlot`, `StudioComposerDisplayMenuSlot`, and `StudioComposerCountMenuSlot`; split `StudioComposerProviderMenu` into a 31-line shell plus `StudioComposerProviderMenuTrigger`, `StudioComposerProviderMenuPanel`, `StudioComposerProviderGroup`, and `studioComposerProviderMenuTypes`; split `StudioHistoryFilters` into a 40-line shell plus `StudioHistoryFilterSelect` and `studioHistoryFilterOptions`; split `StudioFeedCardHeader` into a 56-line layout shell plus `StudioFeedCardAvatar`, `StudioFeedCardTopline`, `StudioFeedCardSummary`, `StudioFeedCardFailureDetails`, and `StudioFeedCardMeta`; split `StudioFeedCardActions` into a 40-line action-group shell plus `StudioFeedActionButton`, action item derivation in `studioFeedActionUtils`, and action prop contracts in `studioFeedCardTypes`; moved the large composer canvas prop contract into `studioComposerCanvasTypes`, leaving `StudioComposerCanvas` as a 10-line pass-through; split `StudioWorkspacePane` into a 55-line shell over header/create-project/list components with `StudioWorkspaceCreateProjectPanel` and `studioWorkspacePaneTypes`; split `StudioComposerToolbar` into a shell plus `StudioComposerToolbarMenus` and `studioComposerToolbarTypes`; split `StudioWorkspaceProjectList` into a 35-line mapping shell, split `StudioWorkspaceProjectItem` into a 42-line row renderer, and moved workspace project prop contracts / rename key handling into `studioWorkspaceProjectTypes` and `studioWorkspaceProjectUtils`; split `StudioTemplateMenu` into a 13-line shell plus `StudioTemplateMenuPanel`, `StudioTemplateMenuTrigger`, `studioTemplateMenuProps`, and `studioTemplateMenuTypes`; split `StudioComposerExpandedContent` into a 23-line layout shell plus `studioComposerExpandedContentTypes` and `studioComposerExpandedContentProps`; split `StudioFeedCard` into a 24-line composition shell plus `StudioFeedCardResult`, `StudioFeedCardFooter`, `studioFeedCardProps`, `studioFeedCardTypes`, and `useStudioFeedCardState`; split `StudioCustomTemplateSection` into a 32-line list-section shell plus `StudioCustomTemplateListItem` and `studioCustomTemplateSectionTypes`; split `StudioTemplateEditor` into a 33-line form shell plus `StudioTemplateEditorHeader`, `StudioTemplateEditorFeedback`, `StudioTemplateEditorFields`, `StudioTemplateEditorActions`, and `studioTemplateEditorTypes`; split `StudioGlobalRail` into a 24-line composition shell plus `StudioGlobalRailNav`, `StudioGlobalRailFooter`, and `studioGlobalRailTypes`; split `StudioHistoryPane` into a 38-line composition shell plus `StudioHistoryFilters`, `StudioHistoryEmptyState`, and `studioHistoryPaneTypes`; split `StudioHistoryCanvas` into a 19-line composition shell plus `studioHistoryCanvasTypes` and `studioHistoryCanvasProps`; split `StudioHistoryFeed` into a 48-line mapping shell plus `StudioHistoryFeedItem` and `studioHistoryFeedTypes`; split `StudioMediaLightboxes` into a 35-line composition shell plus `StudioGalleryPreviewLightbox`, `StudioShareConfirmLightbox`, and `studioMediaLightboxTypes`; split `StudioComposerBody` into a 31-line composition shell plus `StudioComposerModeSwitch`, `StudioReferenceDropzone`, `StudioReferenceUploadList`, and `StudioPromptTextarea`; split `StudioAuthenticatedShell` into a 23-line layout shell plus `studioAuthenticatedShellProps`; and split `StudioComposerDisplayMenu` into a 16-line composition shell plus `StudioComposerDisplayMenuPanel`, `StudioComposerDisplayMenuTrigger`, `StudioComposerOptionGroup`, and `studioComposerDisplayMenuTypes`. Largest remaining Studio TSX modules are currently `StudioWorkspacePane` 52 lines, `StudioHistoryFeedItem` / `StudioSharedTemplatePreviewImages` / `StudioShareConfirmLightbox` 49 lines, `StudioComposerCollapsedBar` 47 lines, and several 46-line shells; largest TS modules are now `useStudioGalleryActions` 112 lines, `studioDerivedState` / `useSharedTemplateBrowser` 107 lines, and `useSharedTemplatePreview` 106 lines.
- Current checkpoint override: Studio splitting is paused for final WIP review/staging. The latest non-doc fix package covers Studio preview cleanup, provider key redaction, inspiration SSRF protections, Redis enqueue failure handling, production bootstrap-admin password guard, partial legacy schema bootstrap, and Chat streaming API base/auth helper reuse.
- Added local scripted smoke coverage via `scripts/smoke-studio.mjs` and `npm run smoke:studio`; it checks the Studio route, health, login/session, projects, providers, tasks, and prompt templates.
- Verification: `npm run build` passes; `npm run smoke:studio` passes locally with 8/8 checks; `git diff --check` passes with only CRLF warnings; browser smoke confirmed Studio renders, the template menu opens with shared templates/custom templates/sidebar search/quick filters/category nav/editor/hover preview container, all four composer toolbar menus open their expected panels, feed-card actions render expected labels/disabled states, and feed-card headers render avatar/status/summary/failure-details/meta. Browser mouse-move automation did not trigger template-card hover after the preview split, so manual/stronger hover validation remains recommended before commit/deploy. `frontend\\node_modules\\.bin\\tsc.cmd --noEmit -p frontend\\tsconfig.json` still fails only on known global type issues (`ImportMeta.env`, PNG declarations, `DashboardPage.tsx` group summary typing, `router.tsx` JSX namespace).
- Five-stage continuation Stage 2/3 completed on 2026-06-09 after the Stage 1 recheck:
  - Browser visual smoke confirmed Studio shell, collapsed-to-expanded composer, template menu structure, provider/display/count menus, feed cards/actions, and generated-image lightbox.
  - Template menu rendered sidebar search, `全部 / 热度 / 最新` nav, category/subcategory nav, 6 template cards, right hover-preview container, custom-template empty section, and template editor.
  - Gallery lightbox opened from `查看大图`, loaded a `/media/...png` image, and closed cleanly.
  - No browser console errors were captured.
  - `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` passed after the visual smoke; diff-check still reports only known CRLF warnings.
  - Known remaining visual risk: browser mouse-move automation still does not populate template hover-preview content, so manual/stronger hover validation remains recommended before commit/deploy.
- Next step: keep Studio splitting paused, review the broad WIP candidate set, then stage intentionally only after user confirmation. Before commit, rerun backend tests, `npm run build`, `npm run smoke:studio`, and `git diff --check`; before any release/deploy, separately recheck GitHub/server state.

- Context cleanup archive added on 2026-06-09:
  - Archive file: `docs/archive/prod-001-studio-refactor-context-cleanup-2026-06-09.md`
  - Current status: TSX large-component splitting is effectively complete; remaining work is mainly small TS hook/helper cleanup or final WIP review/staging preparation.
  - Reverified branch/HEAD: `codex/prod-001-studio-refactor` at `005e25d`.
  - Keep WIP uncommitted until explicit user confirmation. Do not stage or commit `storage/`, `tmp/`, `.env`, `backend/app.db`, `frontend/dist/`, or `node_modules/`.

- Final WIP review/staging preparation started on 2026-06-09:
  - User direction: stop further splitting and prepare the current `prod-001` WIP for final review/staging.
  - Added root `storage/` and `tmp/` to `.gitignore`; `storage/`, `tmp/`, and `frontend/dist/` now remain ignored local-only/generated paths.
  - Final review fix package completed: Studio preview cleanup, provider key response redaction, inspiration SSRF protections, Redis enqueue failure handling, production bootstrap-admin password guard, partial legacy schema bootstrap fix, and Chat streaming API base/auth helper reuse.
  - Verification passed: backend tests (`110 passed, 1 warning, 22 subtests`); `npm run build`; `npm run smoke:studio` 8/8 on `http://127.0.0.1:18080`; `git diff --check` with only CRLF warnings.
  - `frontend\node_modules\.bin\tsc.cmd --noEmit -p frontend\tsconfig.json` still fails only on known global type debt: `ImportMeta.env`, PNG module declarations, `DashboardPage.tsx` group summary typing, and `router.tsx` JSX namespace.
  - `git add -n .` dry-run did not include forbidden paths (`storage/`, `tmp/`, `.env`, `backend/app.db`, `frontend/dist/`, `node_modules/`).
  - Review scope clarification: a project-wide release-blocker/security/reliability review pass was used to select this fix package; this is not a claim of exhaustive line-by-line review of every file.
  - Next step is final human/code review and intentional staging after explicit user confirmation, not more proactive splitting.

### 上生产前完成

| ID | 任务 | 说明 | 优先级 |
|----|------|------|--------|
| prod-005 | CORS 多域名白名单 | 支持生产环境多前端域名 | P2 |
| prod-006 | API Rate Limiting | 防刷保护，内测阶段可跳过 | P3 |
| prod-007 | Session 过期清理 | 定时任务清理 `auth_sessions` 过期记录 | P3 |
| prod-008 | 静态资源存储方案 | 用户上传图片迁移到 OSS/S3，配合 CDN 分发 | P2 |

### 不建议当前阶段做

- 微服务拆分（体量不需要）
- 消息队列替换 Redis（Redis 够用）
- 多租户（无此需求）

---

## Cloud Migration Checklist（上云切换清单）

以下为正式上云部署时需要做的切换工作，当前阶段无需提前改动，架构已预留切换口。

| 组件 | 现在（本地开发） | 上云时切换为 | 改动量 | 切换方式 |
|------|-----------------|-------------|--------|----------|
| 数据库 | SQLite 文件 (`app.db`) | PostgreSQL (RDS) | 极小 | 改环境变量 `QMDH_DATABASE_URL`，运行 `alembic upgrade head` |
| 图片存储 | 本地 `storage/` 目录 | 阿里云 OSS + CDN | 小 | 改 `media_storage.py` 写入逻辑，读取走 CDN 域名 |
| 任务队列 | Redis (本地) | Redis (云托管) | 极小 | 改环境变量 `QMDH_REDIS_URL` |
| API Key 加密 | Fernet key 在 `.env` | 云 KMS 或保持 Fernet | 可选 | 如需更高安全等级再升级 |
| Session 存储 | 数据库表 `auth_sessions` | 同上（跟 PostgreSQL 走） | 无 | 无额外改动 |
| 日志 | 控制台输出 | JSON 格式 → 日志服务 (ELK/Loki) | 小 | 加 logging 配置 |
| 前端部署 | Vite dev server / 本地 dist | Nginx 静态托管 / CDN | 小 | 已有 Dockerfile 和 Nginx 配置 |
| 域名与 HTTPS | localhost | 正式域名 + 证书 | 配置级 | Nginx 或云 LB 配置 |

**原则**：所有切换都是环境变量或单文件改动，不需要提前重构代码。等确定云服务商和部署方案时一起做。
