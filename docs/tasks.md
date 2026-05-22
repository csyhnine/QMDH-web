# Tasks

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

---

## Next Suggested Step

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
