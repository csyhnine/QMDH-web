# Tasks

## Usage Rules
- 本文件只保留当前迭代与下一步任务
- 已完成的历史任务移入 `docs/archive/`
- 每个任务应细化到“一次 commit 或一组紧邻 commits 可完成”
- 状态仅使用：`TODO / IN_PROGRESS / BLOCKED / DONE`

---

## Current Iteration Goal
> 在这里写当前迭代的目标。  
> 例：完成认证模块最小可用版本，并补齐基础文档同步流程。

---

## Priority Queue

### Task: [task-001] 用一句话描述当前最高优先级任务
- 状态: TODO
- 目标: 清楚描述这项任务要实现什么
- 边界: 只修改哪些目录 / 文件 / 模块
- 禁止修改: 明确哪些部分不允许动
- 验收标准:
  1. ...
  2. ...
  3. ...
- 依赖项:
  - ...
- 文档同步:
  - `docs/tasks.md`
  - `docs/handoff.md`
  - 如涉及架构/决策变化，补充更新相关文档
- 分支建议: `feature/task-001-short-name`

### Task: [task-002] 下一项可接力任务
- 状态: TODO
- 目标: ...
- 边界: ...
- 禁止修改: ...
- 验收标准:
  1. ...
- 依赖项:
  - ...
- 文档同步:
  - `docs/tasks.md`
  - `docs/handoff.md`
- 分支建议: `bugfix/task-002-short-name`

---

## In Progress
### Task: [task-xxx] 当前正在进行的任务
- 状态: IN_PROGRESS
- 当前分支: `feature/task-xxx-short-name`
- 当前执行人/账号: `<optional>`
- 已完成:
  - ...
- 未完成:
  - ...
- 风险:
  - ...
- 下一步:
  - ...

---

## Blocked
### Task: [task-yyy] 被阻塞的任务
- 状态: BLOCKED
- 阻塞原因:
  - ...
- 需要谁/什么解除阻塞:
  - ...
- 临时处理建议:
  - ...

---

## Done This Iteration
> 这里只保留当前迭代刚完成、且仍对接手有帮助的少量任务。更早历史请移入归档。

### Task: [task-zzz] 最近完成的任务
- 状态: DONE
- 完成说明:
  - ...
- 相关提交:
  - ...
- 是否已更新文档: Yes / No
