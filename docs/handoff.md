# Handoff

## Usage Rules

- Keep only the latest 3 handoff entries here.
- Move older records into `docs/archive/` if they still matter.
- Write for a cold-start agent.
- Mark `WIP` explicitly if the repo is not in a safe handoff state.


---

## Latest Handoffs

### [2026-07-21] Agent gov-001 切片 — **分支就绪，待合 main**
- Branch: **`feat/agent-gov-001`**（基线 `cb85fc6` + B1）
- 范围：group/user overrides + Admin release（prompt/tools）+ Chat 可观测；**不含** multi/B2/crawl
- Migration：**`l3m4n5o6p7q8`**（`agent_policy_overrides`）
- 验证：pytest 相关 8 passed；`npm run build` OK
- Next：PR review → merge → 部署时 `alembic upgrade head`（生产 PostgreSQL）；**勿部署整包 Agent WIP**
- Safe to hand off: **Yes**
- 旁注：画布复制/运行仍在 `stash@{0}`（`main` 上），勿与本分支混提

### [2026-07-21] 画布复制 + 全部/所选运行 — **stash 中（未合本分支）**
- Role: 无限画布 Ctrl+C/V/D + 全部/所选运行
- Archive：恢复 stash 后见 `docs/archive/handoff-2026-07-21-canvas-copy-run-wip.md`
- Next：gov 合入后再回 `main` `stash pop` 处理画布包
- Safe to hand off: **Yes（在 stash）**

### [2026-07-20] 生产部署基线 — **画布/Chat/B1 已上；热更约 `cb85fc6`**
- Role: 大包曾部署 **`3ff220b`**；前端后续热更至约 **`cb85fc6`**
- Alembic：**`k2l3m4n5o6p7`**（gov 合入前 head）
- Archive: **`docs/archive/deploy-2026-07-20-main-canvas-chat-b1.md`**
- Safe to hand off: **Yes**

<!-- 更早：agent WIP 整包 docs/archive/handoff-2026-07-16-agent-wip-status.md；B1 UI 隐藏 -->
