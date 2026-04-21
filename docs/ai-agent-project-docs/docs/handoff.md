# Handoff

## Usage Rules
- 本文件只保留最近 3 次交接记录
- 更早记录移入 `docs/archive/`
- 交接必须面向陌生新 agent 书写
- 若当前状态不可直接接手，必须明确标记 `WIP`

---

## Handoff Template

### [YYYY-MM-DD HH:mm] Session Handoff
- 执行角色: Feature / Bugfix / Refactor / Review / Integration
- 当前分支: `branch-name`
- 仓库状态:
  - 工作区是否干净: Yes / No
  - 是否有未提交改动: Yes / No
  - 是否已 push: Yes / No
- 本次完成:
  - ...
- 修改文件:
  - `path/to/file`
  - `path/to/file`
- 当前任务状态:
  - `task-xxx`: TODO / IN_PROGRESS / BLOCKED / DONE
- 风险与注意事项:
  - ...
- 未完成内容:
  - ...
- 下一个 agent 的第一步:
  - ...
- 是否可直接接手: Yes / No
- 若不可直接接手，原因:
  - ...

---

## Latest Handoffs

### [示例] 2026-04-17 20:30
- 执行角色: Review
- 当前分支: `docs/bootstrap-system`
- 仓库状态:
  - 工作区是否干净: Yes
  - 是否有未提交改动: No
  - 是否已 push: Yes
- 本次完成:
  - 创建多 agent 协作文档模板
  - 补齐 protocol / tasks / handoff / review / plan / architecture / decisions
- 修改文件:
  - `docs/protocol.md`
  - `docs/tasks.md`
  - `docs/handoff.md`
  - `docs/review.md`
  - `docs/plan.md`
  - `docs/architecture.md`
  - `docs/decisions.md`
- 当前任务状态:
  - `task-bootstrap-docs`: DONE
- 风险与注意事项:
  - 以上文档仍为模板，必须按真实项目填充
- 未完成内容:
  - 将模板替换为项目真实内容
- 下一个 agent 的第一步:
  - 阅读 `protocol.md` 与 `tasks.md`，再按真实仓库情况回填文档
- 是否可直接接手: Yes
