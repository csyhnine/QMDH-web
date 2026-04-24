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
- 状态：TODO
- 目标：
  - 避免任务和模板完全依赖前端传入的用户标识
- 边界：
  - 后端认证入口
  - 任务、模板与项目访问边界
- 验收标准：
  1. 前端不能再随意伪造执行人
  2. 模板、任务至少具备最小用户边界
  3. 审计来源更可信

### Task: [task-006] 完成 MVP 1.0 服务器部署基线
- 状态：DONE
- 完成说明：
  - 已具备 `frontend + backend + worker + postgres + redis` 的部署编排
  - 已补充 Dockerfile、Nginx 反代和部署文档
  - 当前仍需继续补生产环境参数与运维说明

### Task: [task-sec-001] 明确涉密项目的可出域边界
- 状态：BLOCKED
- 阻塞原因：
  - `QMDH-SEC` 的数据分级与模型使用规则尚未确认

---

## Next Suggested Step

如果换账号后继续开发，建议直接从下面这条开始：

1. 先稳定提交当前工作区改动
2. 然后继续 `task-001`，收口 `frontend/src/App.tsx` 的历史遗留逻辑和异常文案
3. 再推进 `task-004`，补最小认证与项目级访问控制
