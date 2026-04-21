# Plan

## 1. Project Goal
> 用 1-3 句话写清楚这个项目最终要做成什么。  
> 例：构建一个支持多 agent 接力开发的软件项目框架，使不同账号下的 Codex 能基于统一仓库协议持续开发，而不是依赖聊天上下文。

---

## 2. Success Criteria
项目完成应至少满足以下标准：

- 不同账号接手时不需要重复解释背景
- 新 agent 可以通过仓库文档与 Git 状态快速接管
- 代码、任务、交接、决策能长期保持一致
- 允许多轮开发而不因上下文漂移失控

---

## 3. Current Stage
- 当前阶段: Discovery / Bootstrap / MVP / Stabilization / Scale
- 当前阶段目标:
  - ...
  - ...
- 当前阶段非目标:
  - ...
  - ...

---

## 4. Milestones

### Milestone 1: 建立协作协议层
- 目标:
  - 补齐 `docs/protocol.md`
  - 补齐 `docs/tasks.md`
  - 补齐 `docs/handoff.md`
  - 建立 review 机制
- 完成标准:
  - 任意 agent 可按协议完成接手与交接

### Milestone 2: 建立项目事实层
- 目标:
  - 完成 `architecture.md`
  - 完成 `decisions.md`
  - 用真实项目内容替换模板
- 完成标准:
  - 文档真实反映当前代码状态

### Milestone 3: 开始稳定迭代开发
- 目标:
  - 按任务队列持续推进
  - 引入分支策略与 review 机制
- 完成标准:
  - 至少完成一个完整任务闭环（开发 → 文档同步 → review → handoff）

---

## 5. Risks
- 文档模板建立了，但真实内容未及时回填
- 任务粒度过大，导致 agent 执行失控
- 多分支并行但缺乏冲突预警
- 文档膨胀，挤占上下文窗口
- 开发速度优先，导致文档长期漂移

---

## 6. Near-Term Priorities
1. 用真实项目内容替换模板
2. 从当前最高优先级任务开始试运行协议
3. 做一次最小闭环 review
4. 校验 handoff 是否真的足够给新 agent 接手
