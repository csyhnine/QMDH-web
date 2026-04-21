# Protocol

## 1. Purpose
本项目采用“多 agent 接力开发”模式。  
任意账号、任意会话中的 agent 都只是可替换执行者，不继承聊天上下文。  
项目连续性由以下内容共同保证：

- Git 仓库中的代码
- Git 历史
- 项目文档
- 本协议文件

本文件定义所有 agent 的统一行为规则。任何开发、修复、重构、接手、交接，都必须遵守本协议。

---

## 2. Core Principles

### 2.1 Repository is the source of truth
仓库是唯一长期记忆载体。  
聊天内容不是权威源，只能作为临时说明。

### 2.2 Code truth overrides document description
当代码与文档冲突时，必须先识别冲突，再决定更新代码还是更新文档。  
不得在未核对的情况下默认相信文档。

### 2.3 Every agent is replaceable
所有 agent 都必须以“自己随时会被替换”为前提工作。  
任何修改都必须留下足够痕迹，确保下一个 agent 可以无缝接手。

### 2.4 Small, bounded, auditable work
所有任务必须小步推进、边界清晰、可审计、可交接。  
禁止大范围模糊修改。

---

## 3. Required Project Documents
以下文档为核心文档，默认位于 `docs/` 目录下：

- `plan.md`：项目目标、阶段规划、里程碑
- `architecture.md`：当前有效架构、模块边界、关键入口
- `decisions.md`：顶层技术决策、不可逆约束
- `tasks.md`：当前迭代任务、优先级、状态
- `handoff.md`：最近交接记录
- `review.md`：review 规则与 review 记录模板

如缺失，接手 agent 应在不影响主任务的前提下补齐最小可用版本。

---

## 4. Agent Types
### 4.1 Feature Agent
负责实现新增功能。边界：只处理已定义需求，不自行扩展产品范围。

### 4.2 Bugfix Agent
负责修复明确缺陷。边界：以修复问题为目标，不借机做额外重构。

### 4.3 Refactor Agent
负责局部重构，提高可读性、可维护性或结构清晰度。边界：不得改变业务行为，除非任务明确允许。

### 4.4 Review Agent
负责核对代码、文档、任务状态、交接质量。边界：默认不做大规模代码改写。

### 4.5 Integration Agent
负责同步分支状态、整理文档状态、对齐多任务输出。边界：不擅自更改未理解模块。

---

## 5. Standard Takeover Procedure
新 agent 接手项目时，必须按以下顺序执行：

1. 检查本地工作区状态
2. 检查当前分支与远端同步状态
3. 阅读以下文档：
   - `protocol.md`
   - `tasks.md`
   - `handoff.md`
   - 与当前任务相关的 `architecture.md` 段落
   - 与当前任务相关的 `decisions.md` 段落
4. 核对代码与文档是否一致
5. 输出接手摘要：
   - 当前目标
   - 当前最高优先级任务
   - 当前分支状态
   - 当前风险
   - 下一步动作
6. 仅在完成上述核对后开始开发

若发现 Git 状态、代码状态、文档状态三者不一致，必须先记录差异，再决定是否继续。

---

## 6. Branch Policy
### 6.1 General rule
默认不允许多个 agent 在同一工作分支并行开发。

### 6.2 Branch roles
- `main`：稳定、可发布、受保护分支
- `dev`：集成分支，用于汇总已完成且经过基本验证的工作
- 任务分支：实际开发分支，按任务单独创建

### 6.3 Branch naming
- `feature/<task-id>-<short-name>`
- `bugfix/<task-id>-<short-name>`
- `refactor/<task-id>-<short-name>`
- `hotfix/<task-id>-<short-name>`
- `review/<date>-<short-name>`

### 6.4 Before starting work
agent 开始工作前必须确认：
1. 当前任务是否已被其他分支占用
2. 当前分支是否存在未拉取远端更新
3. 当前工作区是否存在未提交改动
4. 当前修改目标是否与其他活跃分支高度重叠

若存在明显冲突风险，默认停止推进，并记录到 `handoff.md`。

### 6.5 Conflict handling
遇到 merge conflict 时，默认行为如下：
1. 停止自动开发
2. 列出冲突文件
3. 说明冲突原因
4. 记录当前分支与目标分支状态
5. 写入 `handoff.md`
6. 不允许 force push
7. 不允许在上下文不完整的情况下盲目自动合并

---

## 7. Task Granularity Rule
### 7.1 Task size
`tasks.md` 中的任务必须细化到“一次 commit 或一组紧邻 commits 可完成”的粒度。

### 7.2 Required task format
每个任务至少包含以下字段：
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
任何影响任务状态、交接状态、架构认知、决策约束的提交，都必须保持“代码与文档状态一致”。

以下情况必须同步提交相关文档更新：
- 完成或推进了某项任务 → 更新 `tasks.md`
- 完成一次可交接工作 → 更新 `handoff.md`
- 改变模块边界或关键入口 → 更新 `architecture.md`
- 推翻或新增顶层技术决策 → 更新 `decisions.md`

若必须提交中间态：
- commit message 必须标注 `WIP`
- `handoff.md` 中必须写明“当前不可直接交接”
- `tasks.md` 不得将任务标记为 `DONE`

---

## 9. Context Budget Rule
### 9.1 Goal
核心文档必须服务于“快速接手”和“稳定执行”，避免无限膨胀，挤占 agent 的上下文预算。

### 9.2 Length control
- `tasks.md`：仅保留当前迭代与下一步任务
- `handoff.md`：仅保留最近 3 次交接
- `decisions.md`：仅保留顶层决策与不可逆约束
- `architecture.md`：仅保留当前有效结构，不写长篇演化史

### 9.3 Archive rule
历史内容必须迁移到 `docs/archive/`

### 9.4 Reading priority
1. `protocol.md`
2. `tasks.md`
3. `handoff.md`
4. 当前任务相关代码
5. 局部 `architecture.md`
6. 局部 `decisions.md`
7. 必要时再看归档

---

## 10. Development Scope Control
默认只处理当前最高优先级且边界清晰的任务。除非任务明确授权，否则禁止：
- 顺手重构无关模块
- 扩大需求范围
- 修改任务边界外代码
- 擅自替换技术栈
- 同时处理多个无关任务

若发现当前任务无法在既定边界内完成，应：
1. 停止扩大改动面
2. 在 `tasks.md` 中拆分子任务
3. 在 `handoff.md` 中记录阻塞原因
4. 由后续 agent 接力

---

## 11. End-of-Session Protocol
### 11.1 Principle
任何会话都可能被中断。agent 必须假设自己无法持续工作到任务自然结束，因此必须随时具备可交接能力。

### 11.2 Trigger conditions
出现以下任一情况时，应进入收尾模式：
- 会话额度即将耗尽
- 当前工作轮次接近结束
- 即将切换账号或切换环境
- 当前任务无法在本轮完整完成
- 已完成一个自然修改单元

### 11.3 Required actions
进入收尾模式后必须：
1. 停止开启新任务
2. 完成当前最小可提交单元，或明确标记为 `WIP`
3. 更新 `tasks.md`
4. 更新 `handoff.md`
5. 记录以下内容：
   - 已完成内容
   - 未完成内容
   - 当前分支
   - 当前涉及文件
   - 风险点
   - 下一个 agent 的首要动作

---

## 12. Review Cadence
### 12.1 Task Review
每完成一项任务或一组相关任务后执行，检查：
- 验收标准是否满足
- `tasks.md` 状态是否准确
- `handoff.md` 是否足够清晰
- 代码是否越界修改

### 12.2 Iteration Review
每个迭代、里程碑、或每 5-10 个任务后执行，检查：
- 当前目标是否偏航
- 是否有长期挂起任务
- 架构文档是否滞后
- 决策是否冲突
- 是否需要调整任务拆分方式

### 12.3 Protocol Review
每两周一次，或每次出现明显协作失效后执行，检查：
- 分支策略是否有效
- 原子提交规则是否执行
- 文档长度控制是否失效
- handoff 机制是否过轻或过重
- 是否需要新增 agent 角色或约束

---

## 13. Commit Message Rule
提交信息必须能反映任务目的。推荐格式：
- `feat(task-023): add token expiry validation for login`
- `fix(task-041): prevent duplicate upload retry`
- `refactor(task-052): isolate file parsing logic`
- `docs(task-023): sync handoff and task state`
- `wip(task-023): partial auth middleware update`

---

## 14. Handoff Rule
每次可交接工作结束后，必须在 `handoff.md` 中写明：
- 本次完成内容
- 修改文件
- 当前任务状态
- 当前分支
- 是否存在未提交改动
- 风险点
- 下一个 agent 建议第一步动作

---

## 15. When in Doubt
若遇到不确定情况，默认按以下顺序处理：
1. 缩小改动范围
2. 核对任务定义
3. 核对代码事实
4. 更新文档说明问题
5. 留下可交接状态

---

## 16. Non-Negotiable Rules
以下规则不可违反：
- 不依赖聊天记录作为唯一上下文
- 不在冲突不明时强行合并
- 不 force push
- 不以模糊任务直接开工
- 不只改代码不更新状态文档
- 不在会话结束前留下不可接手状态
- 不擅自扩大任务范围
