# Protocol

## 1. Purpose
QMDH-web 采用“多 agent 接力开发”模式。
任意账号、任意会话中的 agent 都只是可替换执行者，不继承聊天上下文。
项目连续性由以下内容共同保障：

- Git 仓库中的代码
- Git 历史
- `docs/` 下的正式项目文档
- 本协议文件

任何新增功能、修复、重构、接手和交接，都必须遵守本协议。

---

## 2. Core Principles

### 2.1 Repository is the source of truth
仓库是唯一长期记忆载体。
聊天记录只能作为临时说明，不能作为权威上下文。

### 2.2 Code truth overrides document description
当代码与文档冲突时，必须先识别差异，再决定更新代码还是更新文档。
不得在未核对代码事实的情况下默认相信文档。

### 2.3 Every agent is replaceable
所有 agent 必须以“自己随时会被替换”为前提工作。
任何修改都必须留下足够痕迹，确保下一个 agent 可以无缝接手。

### 2.4 Small, bounded, auditable work
所有任务必须小步推进、边界清晰、可验证、可交接。
禁止以模糊的大任务直接开工。

### 2.5 Docs and code move together
凡是影响任务状态、架构边界、关键决策或交接状态的修改，都必须同步更新对应文档。

---

## 3. Required Project Documents

以下文档为 QMDH-web 的正式协作文档，默认位于 `docs/` 目录：

- `protocol.md`：统一协作协议
- `plan.md`：项目目标、阶段与里程碑
- `architecture.md`：当前有效架构、边界和热点
- `decisions.md`：顶层技术决策与不可逆约束
- `tasks.md`：当前迭代任务、优先级与状态
- `handoff.md`：最近交接记录
- `review.md`：review 节奏与模板

`docs/ai-agent-project-docs/` 只是模板来源，不是当前项目的正式事实源。

---

## 4. Agent Types

### 4.1 Feature Agent
负责实现明确需求内的新功能。
边界：不得自行扩展产品范围。

### 4.2 Bugfix Agent
负责修复已知缺陷。
边界：默认不借机扩大重构。

### 4.3 Refactor Agent
负责局部重构，提升可读性、结构清晰度和可维护性。
边界：除非任务明确授权，否则不得改变业务行为。

### 4.4 Review Agent
负责校对代码、任务状态、交接质量和文档同步情况。
边界：默认不做大规模实现改写。

### 4.5 Integration Agent
负责整理工作区状态、同步文档、对齐多任务产出。
边界：不得在未理解模块的情况下擅自合并或覆盖他人工作。

---

## 5. Standard Takeover Procedure

新 agent 接手 QMDH-web 时，必须按以下顺序执行：

1. 检查当前工作区是否干净。
2. 检查当前分支和远端同步状态。
3. 阅读以下文档：
   - `docs/protocol.md`
   - `docs/tasks.md`
   - `docs/handoff.md`
   - 与当前任务相关的 `docs/architecture.md`
   - 与当前任务相关的 `docs/decisions.md`
4. 核对文档与代码是否一致。
5. 输出接手摘要：
   - 当前目标
   - 当前最高优先级任务
   - 当前分支状态
   - 当前风险
   - 下一步动作
6. 仅在完成上述核对后开始开发。

如发现 Git 状态、代码状态、文档状态三者不一致，必须先记录差异，再决定是否继续。

---

## 6. Branch Policy

### 6.1 General rule
默认不允许多个 agent 在同一个工作分支并行开发。

### 6.2 Branch roles
- `main`：稳定主分支
- `dev`：如后续启用，用于集成已完成且通过基本验证的工作
- 任务分支：按任务单独创建

### 6.3 Branch naming
- `feature/<task-id>-<short-name>`
- `bugfix/<task-id>-<short-name>`
- `refactor/<task-id>-<short-name>`
- `hotfix/<task-id>-<short-name>`
- `review/<date>-<short-name>`

### 6.4 Before starting work
开始工作前必须确认：

1. 当前任务是否已被其他分支占用。
2. 当前分支是否存在未拉取的远端更新。
3. 当前工作区是否存在未提交改动。
4. 当前修改目标是否与其他活跃分支高度重叠。

如存在明显冲突风险，默认停止推进，并记录到 `docs/handoff.md`。

### 6.5 Conflict handling
遇到 merge conflict 时，默认行为如下：

1. 停止自动开发。
2. 列出冲突文件。
3. 说明冲突原因。
4. 记录当前分支与目标分支状态。
5. 写入 `docs/handoff.md`。
6. 不允许 `force push`。
7. 不允许在上下文不完整的情况下盲目自动合并。

---

## 7. Task Granularity Rule

`docs/tasks.md` 中的任务必须细化到“一次 commit 或一组紧邻 commits 可完成”的粒度。
每个任务至少包含：

- Task 名称
- 状态：`TODO / IN_PROGRESS / BLOCKED / DONE`
- 目标
- 边界
- 禁止修改项
- 验收标准
- 依赖项
- 文档同步要求

---

## 8. Atomic Commit Rule

以下情况必须同步提交或同步留痕：

- 完成或推进任务：更新 `docs/tasks.md`
- 完成一轮可交接工作：更新 `docs/handoff.md`
- 修改架构边界或关键入口：更新 `docs/architecture.md`
- 形成或推翻顶层技术决策：更新 `docs/decisions.md`

如果必须停留在中间态：

- commit message 必须带 `WIP`
- `docs/handoff.md` 必须说明当前是否可直接接手
- `docs/tasks.md` 不得将任务标记为 `DONE`

---

## 9. Context Budget Rule

### 9.1 Goal
核心文档必须服务于快速接手和稳定执行，避免无限膨胀。

### 9.2 Length control
- `tasks.md`：只保留当前迭代与下一步任务
- `handoff.md`：只保留最近 3 次交接
- `decisions.md`：只保留顶层决策与不可逆约束
- `architecture.md`：只保留当前有效结构，不写长篇演化史

### 9.3 Archive rule
历史内容迁移到 `docs/archive/`

### 9.4 Reading priority
1. `docs/protocol.md`
2. `docs/tasks.md`
3. `docs/handoff.md`
4. 当前任务相关代码
5. 局部 `docs/architecture.md`
6. 局部 `docs/decisions.md`
7. 必要时再看归档

---

## 10. Development Scope Control

默认只处理当前最高优先级且边界清晰的任务。
除非任务明确授权，否则禁止：

- 顺手重构无关模块
- 扩大需求范围
- 修改任务边界外代码
- 擅自替换技术栈
- 同时处理多个无关任务

如果发现当前任务无法在既定边界内完成，应：

1. 停止扩大修改面
2. 在 `docs/tasks.md` 中拆分子任务
3. 在 `docs/handoff.md` 中记录阻塞原因
4. 交由后续 agent 接力

---

## 11. End-of-Session Protocol

任何会话都可能被中断，agent 必须假设自己无法持续工作到任务自然结束。
出现以下任一情况时，应进入收尾模式：

- 会话额度即将耗尽
- 当前工作轮次接近结束
- 即将切换账号或环境
- 当前任务无法在本轮完整完成
- 已完成一个自然修改单元

进入收尾模式后必须：

1. 停止开启新任务
2. 完成当前最小可提交单元，或明确标记为 `WIP`
3. 更新 `docs/tasks.md`
4. 更新 `docs/handoff.md`
5. 记录：
   - 已完成内容
   - 未完成内容
   - 当前分支
   - 当前涉及文件
   - 风险点
   - 下一位 agent 的第一步动作

---

## 12. Review Cadence

### 12.1 Task Review
每完成一项任务或一组相关任务后检查：

- 验收标准是否满足
- `tasks.md` 状态是否准确
- `handoff.md` 是否足够清晰
- 代码是否越界修改

### 12.2 Iteration Review
每个迭代、里程碑或每 5-10 个任务后检查：

- 当前目标是否偏航
- 是否有长期挂起任务
- 架构文档是否滞后
- 决策是否冲突
- 是否需要调整任务拆分方式

### 12.3 Protocol Review
每两周一次，或每次出现明显协作失效后检查：

- 分支策略是否有效
- 原子提交规则是否执行
- 文档长度控制是否失效
- handoff 机制是否过轻或过重
- 是否需要新增角色或约束

---

## 13. Commit Message Rule

推荐格式：

- `feat(task-023): add generated asset detail panel`
- `fix(task-041): prevent invalid provider selection`
- `refactor(task-052): isolate task polling state`
- `docs(task-000): bootstrap project governance docs`
- `wip(task-001): reshape image studio form`

---

## 14. When in Doubt

遇到不确定情况时，默认按以下顺序处理：

1. 缩小改动范围
2. 核对任务定义
3. 核对代码事实
4. 更新文档说明问题
5. 留下可交接状态

---

## 15. Non-Negotiable Rules

以下规则不可违反：

- 不依赖聊天记录作为唯一上下文
- 不在冲突不明时强行合并
- 不 `force push`
- 不以模糊任务直接开工
- 不只改代码不更新状态文档
- 不在会话结束前留下不可接手状态
- 不擅自扩大任务范围
