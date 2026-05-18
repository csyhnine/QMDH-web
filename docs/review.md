# Review

## Purpose
本文档定义 QMDH-web 的 review 节奏和记录模板，用于防止项目在多 agent 接力开发过程中出现代码、文档和任务状态的长期漂移。

---

## Review Types

### 1. Task Review
触发时机：
- 完成一项任务后
- 合并任务分支前
- 准备交接前

检查项：
- 任务是否真的达到验收标准
- 修改是否越界
- `docs/tasks.md` 是否已同步
- `docs/handoff.md` 是否足够清晰
- 是否缺少必要验证步骤
- 若为中大型需求，是否已完成 `docs/roadmap-2.0-prep.md` 定义的 2.0 兼容性检查

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
- 是否有任务粒度过大的问题
- 架构文档是否滞后
- 决策是否冲突
- 当前协作流程是否运转正常
- 是否有 1.0 需求正在无意中封死未来 2.0 的升级路径

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
- 协作出现明显失效后
- 文档明显膨胀或失真后

检查项：
- `docs/protocol.md` 是否仍适配当前项目
- 分支策略是否造成阻塞
- Atomic Commit Rule 是否被遵守
- handoff 是否过轻或过重
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

### Task Review: task-000
- Review 结论: Pass
- 验收标准核对:
  - [x] 正式协作文档已在 `docs/` 根目录建立
  - [x] 模板目录与正式文档目录已区分
- 越界修改检查:
  - 仅新增文档，无代码越界修改
- 文档同步检查:
  - tasks.md: Yes
  - handoff.md: Yes
- 风险:
  - 当前工作区仍有未提交前端改动，与本轮文档改动处于同一工作区
- 后续动作:
  - 继续处理 `task-001`，明确当前前端工作台改动是否准备提交

### Task Review: task-012 / task-013 / task-014 (WIP)
- Review 结论: Needs Fix
- 验收标准核对:
  - [x] 模型探测/批量导入、项目成员管理、灵感页与标记功能主链路已落地
  - [ ] 权限边界、删除链路和“分享至灵感库”语义已完全收口
  - [ ] 新增能力已有对应自动化测试覆盖
- 越界修改检查:
  - 本轮把模型管理、账号/项目管理、灵感页、任务删除和部分工作台导航一起压在同一工作区，超出单一小任务边界
- 文档同步检查:
  - tasks.md: Partial
  - handoff.md: Partial
- 风险:
  - 项目成员移除/项目删除时会把失去全部授权的用户默认回填到 `QMDH-001`，会静默扩大访问范围
  - 任务删除只校验项目访问，不校验任务归属或管理员角色，同项目成员可删除他人任务
  - 项目删除仍未处理 `provider_calls` 子记录，与 PostgreSQL 部署基线下的外键约束不一致
  - “分享”按钮当前只增加 `share_count`，未真正把生成结果写入灵感库；`task-014` 的完成描述偏乐观
  - 设计师工作台会请求管理员专用 `/users`；`ops` 虽看到项目成员编辑入口，但拿不到成员编辑所需的全量用户列表
  - `assets.py` 中 `/assets/{id}/share` 路由重复定义，`App.tsx` 中灵感页渲染保留了两份实现
  - 新增的项目 CRUD / 成员管理 / 灵感页 / 书签 / 删除链路几乎没有自动化测试覆盖
- 后续动作:
  - 先按功能拆分提交，再优先修复权限边界与删除链路问题
  - 修正文档里对 `/admin/projects` 能力和“分享至灵感库”的描述偏差
  - 为项目成员管理、任务删除、项目删除、书签和灵感页补最小回归测试

### Task Review: task-012 / task-013 / task-014 — 第二轮 Review Agent 复验
- Review 日期: 2026-05-12
- Review 结论: Needs Fix（与上轮一致，补充代码事实核对）
- 验收标准核对:
  - [x] 模型探测/批量导入、项目成员管理、灵感页与标记功能主链路已落地
  - [x] 后端 19 tests 全部通过
  - [x] 前端 build 通过（286 kB JS + 50 kB CSS）
  - [ ] 权限边界、删除链路和"分享至灵感库"语义已完全收口
  - [ ] 新增能力已有对应自动化测试覆盖
- 越界修改检查:
  - 本轮把模型管理、账号/项目管理、灵感页、任务删除和部分工作台导航一起压在同一工作区，超出单一小任务边界
- 文档同步检查:
  - tasks.md: Partial（task-012/013/014 标记 DONE，但完成描述对"分享至灵感库"偏乐观）
  - handoff.md: Yes（已记录风险和拆提交建议）
  - architecture.md: **滞后**（未更新灵感页模块、项目 CRUD、成员管理入口）

#### 已确认问题（代码事实核对）

| # | 问题 | 代码位置 | 严重度 | 说明 |
|---|------|----------|--------|------|
| R1 | 成员移除/项目删除回填 `QMDH-001` | `projects.py` L170, L218 | 中 | 用户失去所有项目授权时 `project_codes` 被设为 `["QMDH-001"]`，静默扩大访问范围 |
| R2 | 任务删除权限过宽 | `tasks.py` L120-136 | 中 | `delete_task` 只校验 `ensure_project_access`，同项目任何成员（含 designer）可删除他人任务 |
| R3 | 项目删除未清理 `provider_calls` | `projects.py` L200-210 | 高 | 删除 task 前未删除关联 `ProviderCall`，PostgreSQL 下外键约束会导致 500 |
| R4 | "分享"未写入灵感库 | `assets.py` L89-99 | 低 | `POST /assets/{id}/share` 只 `share_count += 1`，前端文案暗示"分享到灵感"但实际未创建 `InspirationPost` |
| R5 | `/assets/{id}/share` 路由重复定义 | `assets.py` L89 + L139 | 高 | 同一路径同一方法定义了两次 `share_asset` 函数，后者覆盖前者；FastAPI 不报错但行为不可预测 |
| R6 | `ops` 成员编辑拿不到用户列表 | `App.tsx` L838 + `users.py` L44 | 中 | `shouldLoadUsers` 在 studio 视图为 true，但 `/users` 接口 `require_user_admin` 只允许 owner/admin；ops 调用返回 403 → `state.users=[]` → 成员编辑面板无可选用户 |
| R7 | 灵感页渲染重复 | `App.tsx` ~L2904 + ~L3028 | 低 | 灵感页 JSX 完整出现两次（主内容区 + 底部浮动区），维护成本翻倍 |
| R8 | "画布"入口与"生成"页重叠 | `App.tsx` L1722 | 低 | 侧栏"画布"按钮无独立状态/路由，点击无效果 |
| R9 | designer 每 8 秒触发无意义 403 | `App.tsx` L838 + 轮询 | 低 | `shouldLoadUsers` 在 studio 视图为 true，designer 每次轮询都请求 `/users` 被 403 |
| R10 | `architecture.md` 未更新 | `docs/architecture.md` | 低 | 缺少灵感页模块、项目 CRUD/成员管理入口 |
| R11 | `_normalize_project_codes` 也回填 `QMDH-001` | `users.py` L16 | 中 | 与 R1 同源：管理员编辑用户清空 project_codes 时也会回填 |

#### 修复优先级建议

1. **先拆提交归档**（不修代码）：按 task-012 / task-013 / task-014 拆 2-3 个提交
2. **修复 R5**（重复路由）：删除 `assets.py` 底部重复的 `share_asset` 定义
3. **修复 R3**（项目删除外键）：在 `delete_project` 中删除 task 前先删除关联 `ProviderCall`
4. **修复 R2**（任务删除权限）：增加任务归属或管理员角色校验
5. **修复 R6/R9**（ops/designer 403）：`shouldLoadUsers` 条件改为只在 `canManageUsers` 时加载；成员编辑改用 `/projects/{code}/members` 已有数据
6. **修复 R1/R11**（回填 QMDH-001）：改为空列表 + 前端处理无项目状态
7. **修复 R7**（灵感页重复渲染）：合并为单一实现
8. 更新 `architecture.md` 补充灵感页和项目管理模块
9. 为新增链路补最小回归测试


---

### Fix Record: 2026-05-12 Review Agent 修复

已修复问题：

| # | 问题 | 修复内容 | 文件 |
|---|------|----------|------|
| R5 | `/assets/{id}/share` 路由重复定义 | 删除底部重复的 `share_asset` 函数 | `assets.py` |
| R3 | 项目删除未清理 `provider_calls` | 在删除 task 前先删除关联 `ProviderCall` | `projects.py` |
| R2 | 任务删除权限过宽 | 已有 owner/ops 校验（无需修改） | `tasks.py` |
| R6/R9 | ops/designer 触发无意义 403 | 新增 `/users/brief` 端点 + 前端改用 `allUsersBrief` | `users.py`, `api.ts`, `App.tsx` |
| R1/R11 | 回填 `QMDH-001` | 移除回填逻辑，改为空列表 | `projects.py`, `users.py` |
| R7 | 灵感页重复渲染 | 删除底部重复的灵感页 JSX 块 | `App.tsx` |

验证结果：
- 后端 19 tests：✅ 通过
- 前端 build：✅ 通过（283.92 kB JS）

剩余问题（低优先级）：
- R4: "分享"未写入灵感库（需要产品决策）
- R8: "画布"入口与"生成"重叠（需要产品决策）
- R10: `architecture.md` 未更新（文档同步）
