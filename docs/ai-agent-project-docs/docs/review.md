# Review

## Purpose
本文件用于定义 review 节奏与固定模板，避免项目在多 agent 接力过程中出现代码、文档、协议长期漂移。

---

## Review Types

### 1. Task Review
触发时机：
- 完成一项任务后
- 合并一个任务分支前
- 准备交接前

检查项：
- 任务是否真的达到验收标准
- 修改是否越界
- `tasks.md` 是否已同步
- `handoff.md` 是否足够清晰
- 是否存在遗漏测试 / 验证步骤

模板：
```md
### Task Review: [task-id]
- Review 结论: Pass / Needs Fix
- 验收标准核对:
  - [ ] 条件 1
  - [ ] 条件 2
- 越界修改检查:
  - ...
- 文档同步检查:
  - tasks.md: Yes / No
  - handoff.md: Yes / No
- 风险:
  - ...
- 后续动作:
  - ...
```

---

### 2. Iteration Review
触发时机：
- 每个迭代结束
- 每 5-10 个任务后
- 每个阶段性里程碑后

检查项：
- 当前目标是否偏航
- 是否存在长期挂起任务
- 是否有任务粒度过大问题
- 架构文档是否滞后
- 决策是否冲突
- 当前分支策略是否运转正常

模板：
```md
### Iteration Review: [iteration-name]
- 当前目标达成度:
  - ...
- 已完成任务:
  - ...
- 未完成任务:
  - ...
- 阻塞点:
  - ...
- 架构漂移情况:
  - ...
- 协作流程问题:
  - ...
- 下个迭代建议:
  - ...
```

---

### 3. Protocol Review
触发时机：
- 每两周一次
- 协作失效后
- 文档明显膨胀后

检查项：
- `protocol.md` 是否仍适配当前项目
- Branch Policy 是否造成阻塞或混乱
- Atomic Commit Rule 是否被遵守
- Handoff 是否过轻或过重
- Context Budget 是否失效
- 是否需要新增或删除 agent 角色

模板：
```md
### Protocol Review: [date]
- 当前协议是否适用: Yes / No
- 失效条目:
  - ...
- 需要新增的规则:
  - ...
- 需要简化的规则:
  - ...
- 文档长度控制情况:
  - ...
- 建议调整:
  - ...
```

---

## Review Record
> 在这里追加最近几次 review 记录；更早记录移入 `docs/archive/`
