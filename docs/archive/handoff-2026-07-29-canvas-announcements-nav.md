# Handoff — 2026-07-29 画布 / 公告 / 导航页波次

Date: **2026-07-29**  
Branch: **`main`**  
Local / GitHub tip: **`90e1a82`**  
Production: **`https://cityusbdisk.cn`** — Git **`90e1a82`**（前端导航 UI 修复已 rebuild）  
Alembic: **`r9s0t1u2v3w4`**（`site_announcements` → `ai_tools`）  
Safe to hand off: **Yes**（干净可开新对话；无代码 WIP）

## 一句话

画布撤销/悬停断线、站点公告、Studio「导航」AI 工具目录（含后台与生产种子数据）、提示词分类树、导航页视觉与背景割裂修复均已上生产。

## 本波次已交付（均已上生产）

### 画布
- `Ctrl+Z` / `Ctrl+Shift+Z`（或 `Ctrl+Y`）撤销重做：`useCanvasHistory.ts`，历史上限 15
- 悬停连线中点断开：`CanvasEdge.tsx` + `edgeTypes.default`；走 `onEdgesChange` 可撤销
- 模板发布：新建 **或** 覆盖已有（`PublishCanvasTemplateDialog.tsx`）
- 保留选中连线 `Delete` 删除

### 站点公告
- 表 `site_announcements`；Admin `/admin/announcements`
- 登录用户进生成页弹窗（访客不弹）；`localStorage` dismiss per id
- 时间窗 `starts_at` / `ends_at`；多条取 priority 最高

### Studio「导航」AI 工具目录
- 路由 `/studio/nav`；侧栏文案「导航」
- Admin `/admin/ai-tools`；API `/api/v1/ai-tools`（登录）+ `/admin` CRUD
- UI：参考稿排版（约 6 列卡、氛围底、搜索胶囊、「官网」角标）；`nav-shell` 铺满视口避免筛选后上下割裂
- **生产种子数据（DB，不在 Git）**：约 24 条，含 Liblib / Lovart / 建筑学长 / Arena / ChatGPT / Claude Code / Cursor / Trae / 扣子 / n8n / WorkBuddy / Hermes / OpenClaw / Skills.sh / 混元3D / Tripo / SUNO / Kimi / 智谱清言 / 腾讯 ima / Hugging Face / 魔搭 / 即梦 / **Dify**
- 封面多为分类色块字标（服务器难拉外站 favicon；上传接口不收 `.ico`）

### Admin 提示词模板
- 分类 / 子分类树 + 搜索（无 schema 变更）

## 关键文件

| 区域 | 路径 |
|------|------|
| 画布边 | `frontend/src/features/canvas/CanvasEdge.tsx`, `canvasEdgeContext.tsx`, `useCanvasHistory.ts` |
| 画布板 | `frontend/src/features/canvas/CanvasBoard.tsx`, `CanvasWorkspace.tsx` |
| 公告 | `backend/app/routers/announcements.py`, `frontend/.../SiteAnnouncementModal.tsx`, `pages/admin/AnnouncementsPage.tsx` |
| 工具导航 | `backend/app/routers/ai_tools.py`, `pages/studio/AiToolsNavPage.tsx`, `pages/admin/AiToolsAdminPage.tsx` |
| 壳层 | `frontend/src/components/shared/AppShell.tsx`（`nav-shell` / `canvas-nav-layout`） |
| 迁移 | `q8r9s0t1u2v3` → `r9s0t1u2v3w4` |

## 部署注意

1. 有新迁移时：**先 build backend（含迁移文件）再 `alembic upgrade head`**；本波次曾遇旧镜像 upgrade 空跑 + 新 backend `create_all` 建表 → 用 `alembic stamp r9s0t1u2v3w4` 对齐。
2. 服务器拉代码：`sudo -u admin git -C /www/wwwroot/qmdh-web pull --ff-only origin main`
3. 纯前端改动：`docker compose build frontend && docker compose up -d frontend`
4. AI 工具条目在 **Postgres `ai_tools`**，改内容走 Admin 或 API，不必发版。

## 安全 / 运维

- 本机可 SSH root 部署（曾用控制台重置密码）；**建议尽快改密钥登录并轮换 root 密码**（密码曾出现在对话/截图）。
- `git pull` 必须用 `admin`，不要用 root。
- 勿提交：`assets/` 本地截图、`tmp/`、`.env`、`storage/`。

## 新对话建议起点

1. 读 `docs/handoff.md` + `docs/continuity.md`（本条）。
2. `git status` / `git log -5`；生产核对 `rev-parse` + `alembic current` + health。
3. 产品下一批优先看 `docs/tasks.md` Active Blockers / Near-term。
4. 若改导航页：注意 `nav-shell` 全高背景；种子工具图标可后台换正式 logo。

## 相关归档

- 功能就绪：`docs/archive/deploy-ready-2026-07-28-canvas-announcements-ai-tools.md`
- 生产记录：`docs/archive/deploy-2026-07-28-canvas-announcements-ai-tools.md`（后续 tip `90e1a82`）
