# Tasks

## Usage Rules
- 本文件只保留当前迭代和下一步任务
- 更早历史迁移到 `docs/archive/`
- 每个任务必须细化到“一次 commit 或一组紧邻 commits 可完成”
- 状态仅使用：`TODO / IN_PROGRESS / BLOCKED / DONE`

---

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
  - 当配置了 ModelScope token 时，后端会自动派生 `Qwen/Qwen-Image-2512`、`Tongyi-MAI/Z-Image`、`Tongyi-MAI/Z-Image-Turbo` 等可试文生图 provider
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

### Task: [task-sec-001] 明确涉密项目的可出域边界
- 状态：BLOCKED
- 阻塞原因：
  - `QMDH-SEC` 的数据分级与模型使用规则尚未确认

### Task: [task-009] 运营看板接入真实时间序列
- 状态：TODO
- 目标：
  - 让 `/admin/dashboard` 中的成本趋势、模型调用趋势、失败趋势从后端真实时间聚合生成
  - 替换当前前端静态示意图形
- 边界：
  - `backend/app/routers/dashboard.py`
  - `backend/app/schemas.py`
  - `frontend/src/App.tsx`
  - `frontend/src/styles.css`
- 验收标准：
  1. 支持按天聚合最近 7 / 30 天的任务、成本、模型调用和失败数据
  2. 图表为空时有清晰空状态
  3. 后端单测与前端 build 通过

### Task: [task-010] 生产化安全与数据迁移补强
- 状态：TODO
- 目标：
  - 补 provider key 加密、操作审计和正式 migration
- 边界：
  - 后端配置、数据库 schema、provider profiles、审计日志
- 验收标准：
  1. API key 不再以明文业务字段保存
  2. 用户、模型、价格配置等管理操作有审计记录
  3. schema 变更不再只依赖启动时 `ALTER TABLE`

### Task: [task-011] 设计师工作台主页重设计
- 状态：TODO
- 目标：
  - 参考外部设计图，重新整理设计师主页的信息结构
  - 减少历史流长提示词占屏，强化图片结果、复用、当前创作输入区
- 边界：
  - `frontend/src/App.tsx`
  - `frontend/src/styles.css`
- 验收标准：
  1. 1920x1080 下首屏可清楚看到项目、历史摘要和创作入口
  2. 长提示词折叠或摘要化
  3. 前端 build 通过

---

## Next Suggested Step

如果换账号后继续开发，建议直接从下面这条开始：

1. 先稳定提交当前工作区改动
2. 双击 `open-accounts.cmd` 查看本地账号清单，并用预置设计师账号验证项目权限
3. 用 `/admin/models` 给真实 provider 填写币种、计费单位和单价，再用 `/admin/dashboard` 检查真实成本、失败原因、账号额度和模型调用统计
4. 如果 AI 额度或上下文不足，先读 `docs/continuity.md` 再继续
5. 后续生产化补强优先做真实时间序列、密钥加密、操作审计、日志与正式 migration
