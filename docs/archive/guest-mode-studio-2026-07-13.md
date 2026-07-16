# Studio 访客模式（留档）

Last updated: **2026-07-16**  
状态：**P0+P1 已部署生产**（Git `60caa22` / 热修 `186b127`）  
优先级：P2（限流 / 清理 useStudioAuth / E2E）待做  

> **换设备 / 新对话接手**：先读本文 → `docs/archive/deploy-2026-07-16-guest-workers-hotfix.md` → `docs/handoff.md`。

---

## 1. 产品定义

| 项 | 结论 |
| --- | --- |
| **名称** | 访客模式（Guest Mode） |
| **入口** | 登录页 **「访客模式」** 按钮，无需账号 |
| **范围** | 设计师在 Studio **能看到的全部 Tab**，访客 **都能进入、都能看 UI** |
| **限制** | **不能使用** — 禁止提交生图、上传、对话、发反馈、编辑灵感等一切写操作 |
| **不含** | Admin 后台（`/admin/*`）；设计师本身也无权进后台 |
| **升级路径** | 任意时刻可点「登录」→ 正常账号 → 全功能 |

### 1.1 四个 Studio Tab 行为

| Tab | 路由 | 访客可看 | 访客禁止 |
| --- | --- | --- | --- |
| **生成** | `/studio/generate` | 布局、表单、模型/画幅选项、历史卡片样式（若 API 可读） | 提交任务、上传参考图、保存模板、删除任务 |
| **灵感** | `/studio/inspiration` | 公开灵感列表与详情 | 上传、编辑、分享、点赞/贡献 |
| **反馈** | `/studio/feedback` | 反馈界面结构（若 API 可读则只读列表） | 发新反馈、回复 |
| **对话** | `/studio/chat` | 对话界面布局 | 发消息、新建会话、上传附件 |

---

## 2. 现状（实现前）

系统为 **默认拒绝（fail-closed）**：

- 前端：`AuthGuard` 无 `currentUser` → 重定向 `/login`（`frontend/src/components/shared/AuthGuard.tsx`）
- 后端：除少数公开 GET 外，均 `Depends(get_current_auth_user)` → 401
- **无** guest 角色、guest 路由、optional auth

### 2.1 已公开的后端接口（无需 token）

- `GET /health/*`
- `GET /workflows`
- `GET /providers`（列表）

其余 Studio 依赖的 projects / tasks / assets / inspiration / chat / feedback **均需登录**。

### 2.2 历史遗留

- `GenerateStudioShell` + `useStudioAuth` + `StudioLoginView` 与路由层 `AuthGuard` **重复**；路由模式下内嵌登录基本不可达。访客模式落地时建议 **统一到 AuthContext**，二期清理 `useStudioAuth`。

---

## 3. 技术方案

### 3.1 前端

| 改动点 | 说明 |
| --- | --- |
| `AuthContext.tsx` | 增加 `authMode: 'guest' \| 'authenticated'`、`enterGuestMode()`、`exitGuestMode()`、`isGuest` |
| `AuthGuard.tsx` | 扩展：guest 允许 `/studio/*`；仍拦截 `/admin/*` |
| `LoginPage.tsx` | 「访客模式」按钮 → `enterGuestMode()` → `navigate('/studio/generate')` |
| `AppShell.tsx` / `StudioGlobalRail` | guest 显示「访客 · 登录」；隐藏退出；Admin 入口不可见 |
| 各 Studio 页 | `isGuest` 时禁用 CTA、显示登录引导条 |
| `api.ts` | guest 请求 **不带** Bearer；写操作前端拦截 + 后端仍 401 |

**不建议**单独 `/guest` 路由；与现有 `/studio/*` 共用，用 `authMode` 区分。

### 3.2 后端

| 改动点 | 说明 |
| --- | --- |
| `auth.py` | 新增 `get_optional_auth_user()`：无 token → `None`，不 401 |
| 只读 GET | inspiration、shared templates、tasks/assets 列表等改为 optional auth；guest 仅返回 **公开/脱敏** 数据 |
| 写操作 | 保持 `get_current_auth_user`：`POST /tasks`、upload、chat、feedback 等 |
| `rate_limit.py` | guest / anonymous IP 更严格限流 |

**安全原则**：guest 不能通过 API 间接写入；不能看到其他用户的私有任务/资产。

### 3.3 数据可见性（需实现时细化）

- **生成页历史**：guest 无 user_id → 不加载个人 tasks，或只展示空状态 + 示例/demo 卡片
- **灵感**：仅 `visibility=public`（或现有公开 scope）
- **反馈**：可选只读公共线程，或空状态 + 「登录后参与」
- **对话**：空会话 UI，禁止 SSE

---

## 4. 分期交付

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| **P0** | 登录页入口 + `authMode=guest` + 路由放开 + 生成页只读壳（禁提交） | 未登录可进 `/studio/generate`，点生成提示登录 |
| **P1** | 四 Tab 只读 + 后端 GET optional auth | 灵感/反馈/对话可浏览，写操作 401 或按钮禁用 |
| **P2** | 统一 guest UI、限流、测试、清理 `useStudioAuth` | E2E smoke；文档更新 |

**MVP 可先 P0+P1**，P2 体验抛光。

---

## 5. 关键文件清单

### 前端

```
frontend/src/context/AuthContext.tsx
frontend/src/components/shared/AuthGuard.tsx
frontend/src/pages/auth/LoginPage.tsx
frontend/src/router.tsx
frontend/src/components/shared/AppShell.tsx
frontend/src/features/studio/GenerateStudioShell.tsx
frontend/src/features/studio/useStudioAuth.ts          # 二期清理
frontend/src/pages/inspiration/InspirationPage.tsx
frontend/src/pages/chat/ChatPage.tsx
frontend/src/pages/studio/FeedbackPage.tsx
frontend/src/api.ts
frontend/src/features/access/roleAccess.ts             # 可增 isGuest 工具
```

### 后端

```
backend/app/core/auth.py
backend/app/routers/inspiration.py
backend/app/routers/tasks.py
backend/app/routers/assets.py
backend/app/routers/chat.py
backend/app/routers/feedback.py
backend/app/core/rate_limit.py
backend/tests/test_auth_boundaries.py                    # 扩展 guest 用例
```

---

## 6. 测试计划

```bash
# 后端（实现后）
cd backend
python -m pytest tests/test_auth_boundaries.py tests/test_role_access.py -q

# 前端
cd frontend && npm run build

# 手工
# 1. 登录页 → 访客模式 → 四 Tab 可进
# 2. 所有写操作被禁或 401
# 3. /admin/* 仍跳转登录
# 4. 登录后恢复全功能
```

---

## 7. 与其他任务的关系

| 任务 | 关系 |
| --- | --- |
| **VIP 异步生图** `[image-vip-001]` | 独立；`main` @ `1ed503d` 已 push；访客不改 `task_executor` |
| **Agent WIP** `wip/agent-multi-chat-2026-07` | 未上生产；访客与 chat agent 可后合并 |
| **定价/日志** | 访客不产生 `usage_ledgers` 计费（无写操作） |

---

## 8. 待办（接班人）

- [x] P0：AuthContext + LoginPage + AuthGuard + 生成页只读
- [x] P1：optional auth + 四 Tab 只读
- [ ] P2：限流、测试、清理 useStudioAuth
- [x] 更新 `docs/handoff.md` / 部署说明（见 `docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`）

---

## 9. 本地开发

```powershell
cd e:\projects\QMDH-web
.\start-dev.cmd
# 前端 http://127.0.0.1:18080  后端 http://127.0.0.1:18010
```

**不用 git pull**（除非多人协作需要同步）；当前 `main` 含 VIP 代码，访客在 `main` 上开新分支或直接开发均可。
