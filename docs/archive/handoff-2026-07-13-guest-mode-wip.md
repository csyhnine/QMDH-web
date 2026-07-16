# Handoff — Studio 访客模式（待开发）

Date: **2026-07-13**  
Role: 访客模式（Guest Mode）  
Safe to hand off: **Yes（需求已定；代码未写）**

---

## 一句话

登录页增加 **「访客模式」**：无需账号进入 Studio 四 Tab（生成/灵感/反馈/对话），**能看不能用**；Admin 仍要登录。前后端均需改（不能只改前端）。

---

## 完整留档

**[`docs/archive/guest-mode-studio-2026-07-13.md`](guest-mode-studio-2026-07-13.md)**

---

## 产品结论（已定，勿改 unless 产品确认）

- 入口：登录页按钮
- 范围：设计师可见 Studio 全部 **看**；全部 **写** 禁止
- 不含 Admin

---

## Repo 状态

| 项 | 状态 |
| --- | --- |
| 分支 | 建议 `main` 或 `feat/guest-mode-studio` |
| GitHub `main` | @ `1ed503d`（含 VIP 异步生图，与访客无关） |
| 访客代码 | **0 行**，未开始 |
| 生产 | 无访客模式 |

---

## 第一步（P0）

1. 读 `docs/archive/guest-mode-studio-2026-07-13.md` §3–§5
2. `AuthContext` 增加 `authMode` / `enterGuestMode()`
3. `LoginPage` 加按钮；`AuthGuard` 放行 guest 进 `/studio/*`
4. `GenerateStudioShell`：`isGuest` 禁用提交 + 登录引导

---

## 关键命令

```powershell
cd e:\projects\QMDH-web
.\start-dev.cmd
cd frontend && npm run build
cd backend && python -m pytest tests/test_auth_boundaries.py -q
```
