# Tasks

## Usage Rules
- 本文件只保留当前迭代和下一步任务
- 更早历史迁移到 `docs/archive/`
- 每个任务必须细化到“一次 commit 或一组紧邻 commits 可完成”
- 状态仅使用：`TODO / IN_PROGRESS / BLOCKED / DONE`

---

## Current Iteration Goal

在不扩大范围的前提下，把 QMDH-web 从“能跑的原型”推进到“可持续接手开发的图像生成 MVP”，优先完成：

- 图像生成工作台收口
- 真实图像 provider 能力接入
- 参考图上传到真实生成链路的衔接
- 可落地的服务器部署基线

---

## Priority Queue

### Task: [task-001] 收口当前生图工作台并清理遗留逻辑
- 状态：IN_PROGRESS
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
  - `FireRedTeam/FireRed-Image-Edit-1.1` 已确认要求图片上传，标记为 `image.edit`，不进入当前纯文生图列表
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

### Task: [task-sec-001] 明确涉密项目的可出域边界
- 状态：BLOCKED
- 阻塞原因：
  - `QMDH-SEC` 的数据分级与模型使用规则尚未确认

---

## Next Suggested Step

如果换账号后继续开发，建议直接从下面这条开始：

1. 先稳定提交当前工作区改动
2. 在设计师页面逐个试跑新增的魔搭图像模型，筛出最适合建筑/景观效果图的默认 provider
3. 继续 `task-001`，收口 `frontend/src/App.tsx` 的剩余表单和历史流细节
4. 视部署目标补生产环境 token、日志与运维参数说明
