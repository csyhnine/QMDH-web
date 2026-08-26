# Handoff Archive — 2026-08-25 计费审计 + Chat 助手 UI 隐藏

冷启动详档。摘要见 `docs/handoff.md` → `[2026-08-25]`。

---

## 会话摘要

1. **GPT 计费异常（已修）** — 用户 Admin 将 `gpt-image-2` 从 `per_request` 改为 `per_image`；3 张 2K 应从 ¥2.67 变为 ≈ ¥8.01。
2. **生产计费审计** — 无第二个「多张图只计 1 次」的同类 enabled 生图 provider；详见下文表。
3. **Chat「设计助手」开关** — 用户要求先不对用户开放；本地改默认隐藏，**未 commit / 未 push / 未部署**。
4. **Studio UX（上轮）** — `fcc7a0b` 已上生产；本地另有 **`9817ab5`** handoff 文档 commit **未 push**。

---

## Git 状态（留档时）

| 项 | 值 |
|----|-----|
| 分支 | `main` |
| 本地 HEAD | **`9817ab5`**（ahead of `origin/main` by 1） |
| 未 push | `9817ab5` docs(handoff): mark studio UX deploy at f10188e |
| **未提交 WIP** | `featureFlags.ts`、`docker-compose.yml`、`frontend/Dockerfile`（Chat 助手 UI 默认关）；`docs/continuity.md` 部分更新 |
| 勿提交 | `assets/`、`backend/references/`、`tmp/` |

### Chat 助手 UI 隐藏（未提交 diff）

- `frontend/src/lib/featureFlags.ts` — `isChatAgentUiEnabled` 改为仅 `VITE_CHAT_AGENT_UI_ENABLED === "true"` 时显示
- `docker-compose.yml` / `frontend/Dockerfile` — 构建默认 `false`
- 与 `docs/product-boundary.md` 一致；产品就绪后再设 env 并 **rebuild frontend**

---

## 生产基线（留档时）

- URL：`https://cityusbdisk.cn`
- 代码 HEAD：**`f10188e`**（Studio UX frontend rebuild 2026-08-18）
- 更早 follow-source：**`b55e280`**
- Alembic：**`r9s0t1u2v3w4`**
- `gpt-image-2` 生产配置（用户改后）：`pricing_unit=per_image`，1k=1.62，2k=2.67

### 计费审计结论（2026-08-25）

**无同类 bug**（per_request + 多 output 张数）。

| Provider | 备注 |
|----------|------|
| `bigjpg` | `per_request` — **设计如此**（高清放大按次） |
| `gpt-image-2-count` / `gpt-image-2-vip` | adapter 已有 1k/2k 分档价，OK |
| `doubao-seedream-5.0-lite` | 仅 2k/4k 价；若走 1k tier 可能 ¥0（Studio 若只开 2K/4K 风险低） |
| `seedance-2` | 5s→¥7、10s→¥14，OK |
| `openai_gpt-5.4-image-2` | OFF，与 `gpt-image-2` 重叠，保持停用即可 |

**历史 ledger 不重算**；改配置后新任务才按新规则入账。

---

## 用户明确搁置（勿主动推进）

- 画布异步 poll / 批量并行（体感慢）
- 画布 Ctrl+C：复制提示词 vs 复制整节点
- 图链路新功能（2026-08-16 起暂停，仅 bugfix）
- 灵感库迭代（seed / 内容 / 分享收口）
- Grok 视频上游 `newapi.haodeya.xyz` SSL/网络（非部署导致）

---

## 待办索引（下一对话）

### 立即可做（用户批准后）

1. **Commit + push** — Chat 助手 UI 隐藏 + continuity 更新；push `9817ab5`
2. **Deploy frontend rebuild** — 使助手开关在生产隐藏
3. **自测 GPT 计费** — 2K × 3 张，ledger ≈ ¥8.01

### 产品主线（见 `docs/tasks.md`）

| ID | 事项 | 状态 |
|----|------|------|
| `chat-b2-001` | Chat → 生图/视频 HITL | IN PROGRESS |
| `agent-wip-001` | 多 Agent WIP | 分支 `wip/agent-multi-chat-2026-07` @ `4b0a5b3`，**勿整包 merge** |
| `agent-codex-harness-001` | Codex harness | READY_FOR_PR |
| `canvas-20260721` | 画布复制 + 全部/所选运行 | `stash@{0}` |
| `prod-008` | OSS 生产切换 | 需用户批准 |
| `guest-001` P2 | 访客限流 / E2E | TODO |
| `hh-i2v-004` | HappyHorse 多 Key | 可选 |

### 文档 housekeeping

- 统一 `continuity.md` / `handoff.md` 生产 HEAD 表述（`f10188e` vs `b55e280` 层级）
- `continuity.md` Chat Agent 段：UI 默认隐藏（与 product-boundary 对齐）

---

## 安全提醒

- 若 root 密码曾在对话/控制台暴露 → 改密钥登录并轮换密码
- 本地 push GitHub 可能需要代理 `127.0.0.1:7897`
- 服务器 `git pull` 须 **admin** 用户

---

Safe to hand off: **Yes（有明确未提交 WIP；勿 deploy 未 commit 的助手 UI 改动）**
