# AI Agent Project Docs

这是一个面向多账号、多 agent 接力开发场景的仓库文档模板包。

## 已包含
- `docs/protocol.md`
- `docs/tasks.md`
- `docs/handoff.md`
- `docs/review.md`
- `docs/plan.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/bootstrap_prompt.md`
- `docs/takeover_prompt.md`

## 使用方式
1. 将 `docs/` 合并到你的项目仓库
2. 用真实项目内容替换模板中的占位内容
3. 首次接入时，先让 agent 阅读：
   - `docs/protocol.md`
   - `docs/plan.md`
   - `docs/architecture.md`
   - `docs/decisions.md`
   - `docs/tasks.md`
   - `docs/handoff.md`
4. 切账号或切会话时，使用 `docs/takeover_prompt.md`

## 注意
这是一套“完整模板”，不是已经自动填充你的真实项目状态的最终文档。  
在投入实际使用前，至少要回填：
- 当前项目目标
- 当前代码结构
- 当前关键决策
- 当前任务状态
- 最近交接信息
