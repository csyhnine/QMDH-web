# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-21] 套壳 Codex harness + 记忆 + 生成助手 — **代码就绪，待合入/部署**
- Branch: **`feat/agent-codex-harness-001`**
- 定调：QMDH Chat 壳 + Codex **风格** harness（非换 GPT）+ Admin Skill + 跨对话记忆 + HITL 生图/视频
- 新增：`agent_harness_service` / registry / memory（`m4n5o6p7q8r9`）/ B2 confirm + video propose / 能力抽屉 Skill 文案 / 我的记忆
- 验证：相关 pytest 10 passed；`npm run build` OK
- 部署：gov 已在 `origin/main`；本机无生产 SSH → 见 `docs/archive/deploy-ready-2026-07-21-gov-harness.md`
- Safe to hand off: **Yes（分支未合 main）**

### [2026-07-21] Agent gov-001 — **已合 main**
- Merge：**`736b800`**；Migration：**`l3m4n5o6p7q8`**
- Next：生产 pull + alembic（若尚未）
- Safe to hand off: **Yes**

### [2026-07-21] 画布复制 + 全部/所选运行 — **stash 中**
- `stash@{0}` on `main`
- Safe to hand off: **Yes（在 stash）**

<!-- 更早：deploy-2026-07-20；agent WIP 整包 -->
