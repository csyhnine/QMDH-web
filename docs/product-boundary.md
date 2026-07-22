# Product Boundary

## 2026-05-25 Active Baseline

This document records the current active product boundary when older docs still contain historical project-centered wording.

### Roles

- The active runtime role model is `admin` and `designer`.
- Legacy `owner` and `ops` values are compatibility aliases that normalize to `admin` at auth boundaries.
- Backend management views are intended only for preset admin accounts.

### Visibility

- Studio history is account-owned for every role.
- Every account only sees its own task history in the studio history surface.
- Every account only sees assets generated from its own tasks in the studio history surface.
- Shared access to the same project code does not imply shared history visibility.
- Admins retain global visibility only through dedicated backend management surfaces, not through studio history cards.
- Chat conversations remain account-owned and continue to be persisted for the user’s own history and personalization.
- The Chat「设计助手 / agent_mode」entry is **hidden by default** until the assistant product is ready (`VITE_CHAT_AGENT_UI_ENABLED=true` to show).
- **设计助手产品形态（2026-07-21）**：
  - **壳**：QMDH `/studio/chat` UI（不是嵌入 Codex CLI/Desktop）
  - **工程**：借鉴 [openai/codex](https://github.com/openai/codex) 的 harness（agent loop、稳定 tool 注册、HITL 审批、上下文压缩、会话续跑）；**不是**绑定 OpenAI GPT/Codex 专用模型
  - **手**：院内 tools + 生图/视频经 HITL 确认后走现有 `workflow + task` 计费管线
  - **Skill**：Admin 通过 Skill Release / tool allowlist 发版能力包；设计师不能自助安装；仓库根目录 `skills/`（OpenClaw）为外部并行线
  - **跨对话记忆**：用户级 durable memory（正式产品能力），与单会话 `context_summary` 压缩分开
  - **红利边界**：工程红利靠对照移植 Codex 开源实践；模型红利靠 Admin 换 Provider；**不会**因 Codex 仓库发版而自动升级 QMDH

### Project Semantics

- Projects still exist, but they are no longer collaboration spaces with automatic shared history cards.
- A project acts as a personal task container or grouping unit within a user's scope.
- In the active UI, this should be understood as a "personal project" or "task group", not a shared team project.
- Internal `project_code` values remain as compatibility identifiers, but new personal projects should not require users or admins to manage those codes manually.
- Newly created personal projects are expected to be managed by their owner account; older legacy projects may still remain admin-managed until data is migrated.
- Project membership management is not an active product capability.

### Active Surface

- `/admin/dashboard`, `/admin/models`, `/admin/users`, and `/admin/settings` are active admin surfaces.
- `/admin/projects` has been removed from the active frontend routing surface.
- Project-member management UI and APIs are no longer part of the active product surface.

### Interpretation Rule

- If an older document says `owner`, `ops`, `/admin/projects`, "project members", or "shared project history", treat that as historical unless the current code still proves it.
