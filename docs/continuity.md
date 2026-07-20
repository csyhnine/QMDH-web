# Development Continuity

## Purpose

This file is the fast handoff baseline for the next agent. Read these first:

1. `docs/protocol.md`
2. `docs/tasks.md`
3. `docs/handoff.md`
4. `docs/product-boundary.md`
5. `docs/server-operations.md`
6. `docs/data-governance.md`
7. `docs/architecture.md`
8. `docs/decisions.md`
9. this file

## Current Baseline

- **Active development sequence**: ① GitHub `main` 已含画布/上下文/流式/**Agent B1** → ② **等用户下令再部署生产** → ③ gov → B2 → multi 切片 → ④ VIP Admin / 访客 P2
- Current branch: **`main` @ `234dd8b`**（与 `origin/main` 同步；含 PR #2）
- **Deploy-ready checklist**：`docs/archive/deploy-ready-2026-07-20-main-canvas-chat-b1.md`（**未部署**）
- Production: **`https://cityusbdisk.cn`** — 仍为旧 HEAD（约 `186b127`）；**勿擅自部署**
- 07-20 功能留档：`docs/archive/handoff-2026-07-20-canvas-chat-streaming-wip.md`
- Deploy archive（上次生产）：`docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`
- **VIP**：代码路径已有；Admin 建 `gpt-image-2-vip` 即可测
- **Chat Agent（重要）**：
  - **B1 已在 GitHub `main`**：`agent_mode` + 5 只读 tools；**生产要部署后才可见**
  - **整包 WIP 仍保留**：`wip/agent-multi-chat-2026-07` @ **`4b0a5b3`**（gov/B2/multi/crawl/ref；未 rebase、未合入）
  - 现状：`docs/archive/handoff-2026-07-16-agent-wip-status.md` + 本文件
  - 后续切片：gov → B2 → multi/crawl/ref-intent
- Alembic head：**`k2l3m4n5o6p7`**（部署必须 `upgrade head`；先 build backend 再迁移）
- Local dev URLs:
  - frontend: `http://127.0.0.1:18080`
  - backend: `http://127.0.0.1:18010`
- Local helper commands:
  - startup: `cmd /c start-dev.cmd`
  - build: `npm run build`
  - smoke: `npm run smoke:studio`, `npm run smoke:chat`
  - backend B1: `backend\.venv\Scripts\python.exe -m pytest tests\test_chat_agent_service.py tests\test_chat_agent_mode.py tests\test_chat_context.py -q`
- Do not commit: `storage/`, `tmp/`, `.env`, `backend/app.db`, `frontend/dist/`, `node_modules/`, `assets/` 本地截图
- Hard rule: **未经用户明确同意，禁止 git push / 生产部署**（本次文档同步除外，用户已要求准备就绪）

## Current Product Reality

- Active runtime roles: `admin`, `ops`, `designer` (`ops` = designer studio access + inspiration/feedback/templates backoffice; other admin modules show 🔒)
- Studio history, assets, chat conversations, and personal projects are account-owned, not project-member shared.
- Backend/admin surfaces remain admin-only.
- `project_code` / `project_id` still exist as compatibility identifiers, but active product semantics are personal containers.
- `/admin/projects` is not an active frontend surface.
- Shared prompt templates and private prompt templates coexist:
  - shared templates are admin-managed and visible to all designers
  - private templates remain user-owned
- Shared templates support:
  - two-level category taxonomy
  - original image + final image preview assets
  - recent apply / submit-success analytics
  - a manual featured flag that currently still powers the studio `热度` bucket
- Studio template picker supports:
  - category sidebar
  - hover compare preview
  - aligned three-column browsing layout
  - adaptive right preview for wide / tall / balanced images
- Admin template management supports:
  - create / update / delete shared templates
  - drag-and-drop upload for original/final preview images
- Current metering model:
  - image tasks bill from provider profile `pricing_currency / pricing_unit / unit_price`
  - chat bills from `provider_pricing_rules`
  - chat supports `input_tokens`, `output_tokens`, `cached_input_tokens`
  - if a chat model has no pricing rule, usage continues to work but cost is recorded as `0`
  - provider pricing rule defaults are now `unit_size = 1,000,000` and `currency = USD`
- Current quota model:
  - `soft_warn` does not block
  - `hard_block` blocks new image/chat usage based on current-month `usage_ledgers`
  - `billing_status = suspended` blocks immediately
- Current branding reality:
  - left rail uses the QMDH icon asset
  - login uses full `清美道合` wordmark only (duplicate icon logo removed 2026-06-12)
  - login supports remember username/password in browser localStorage
  - browser title is `清美道合`
- Current video generation reality (2026-06-12):
  - Haodeya Grok Imagine Video is live on production
  - Studio four-tier SKU switcher + single admin `haodeya_grok` provider profile
  - Text-only and i2v-with-reference-image flows verified end-to-end
  - Reference images upload in Studio; public URL via `https://cityusbdisk.cn/media/...`
- Current studio composer reality（**本地 WIP，2026-06-29 已验收**）:
  - the composer can auto-collapse into a compact bar while browsing history
  - focusing, opening menus, hovering the collapsed bar, uploading references, or submitting expands it again
  - resolution UI: **标准 1K** / **高清 2K** 均可选；2K 通过 `image_config.image_size: "2K"` 驱动上游
  - image batch size is capped at **3** (no 4-image option)
  - bottom toolbar uses a fixed grid so template/model/ratio/count triggers do not reflow; long labels ellipsis
  - **Enter** inserts newline; **Ctrl+Enter** (Mac: ⌘+Enter) submits; shortcut hint is inside the submit button
  - reference images remove via top-right × on preview; bottom filename list removed (`StudioReferenceUploadList.tsx` deleted)
  - removed stale composer chrome (workflow name, style tag, service online/offline labels)
- Current history card reality（**本地 WIP**）:
  - cards are denser than earlier versions
  - 1–4 generated images share one layout: summary on top, horizontal gallery, footer actions below
  - gallery scrollbar aligns to the main history column right edge
  - generated image previews preserve full image content through proportional shrink (`contain`) instead of banner-like crop
  - footer meta（gallery 布局）: 模型简称 + **分辨率（1K/2K）** + **像素尺寸（宽×高）** + 耗时；时间戳按 **东八区**
  - 2K 验收：16:9 → **2752×1536**；若仍 **1376×768** 说明 `image_size` 未传到上游
- Current image 2K routing reality（**2026-07-01，已热补丁生产；详 `docs/archive/haodeya-image-model-routing-2026-07.md`**）:
  - **Nano Banana PRO**（`gemini-3.1-flash-image`）→ Haodeya **渠道 9**；1K/2K **同一上游 model**；2K 靠 `modalities` + `image_config.image_size:"2K"`
  - **Nano Banana 2**（`google/gemini-3.1-flash-image-preview`）→ **渠道 3**
  - **禁止**把 PRO 映射成 preview；**禁止** `-2k` 后缀（GPT/Gemini）
  - 验收：PRO 2K · 16:9 → **2752×1536**
- Current admin model reality:
  - provider profiles can be enabled or disabled from the model list without changing existing pricing rules
  - toggling a provider profile updates only the `enabled` state

## Key Recent Changes

- WIP: continued splitting the Studio generate surface into focused modules:
  - `GenerateStudioShell` is now only the auth/login/authenticated-shell entrypoint
  - `StudioCanvasView` is now a thin composition layer over `StudioHistoryCanvas` and `StudioComposerCanvas`
  - `StudioAuthenticatedShell` is now a thin layout shell over global rail, designer view, and media lightboxes; authenticated-shell prop partitioning lives in `studioAuthenticatedShellProps`
  - `StudioHistoryCanvas` for history pane/feed wiring
  - `studioHistoryCanvasTypes` and `studioHistoryCanvasProps` for the history canvas prop contract and pane/feed prop partitioning
  - `StudioComposerCanvas` for composer dock wiring
  - `StudioDesignerView` for the designer workspace pane, studio canvas layout, and studio-only prop wiring
  - `StudioHistoryFeed` for mapping filtered tasks to feed cards
  - `StudioHistoryFilters`, `StudioHistoryFilterSelect`, and `studioHistoryFilterOptions` for history filter controls, reusable select rendering, and filter option derivation
  - `StudioFeedCard` for compact task card composition
  - `StudioFeedCardAvatar`, `StudioFeedCardTopline`, `StudioFeedCardSummary`, `StudioFeedCardFailureDetails`, and `StudioFeedCardMeta` for feed-card header internals
  - `StudioFeedCardResult` for gallery vs empty/running result rendering
  - `StudioFeedCardFooter` for compact task card footer actions/feedback
  - `StudioGlobalRailNav` and `StudioGlobalRailFooter` for global rail navigation and account/health footer rendering
  - `StudioAssetTile` for generated asset tile rendering
  - `StudioFeedCardActions`, `StudioFeedActionButton`, and `studioFeedActionUtils` for feed card footer action composition, action item derivation, button state classes, and labels
  - `studioDerivedState` for read-only Studio view derivation
  - `studioSubmissionProgress` for deriving current task submission progress from tracker state and refreshed tasks
  - `useGenerateStudioController` for the top-level Studio state, data, action, and view-effect hook orchestration
  - `useStudioAuth` for session restore, login form state, login, and logout
  - `useStudioDataLoader` for health/projects/providers/workflows/tasks/assets/templates/users/dashboard loading, polling, request de-dupe, and last-sync state
  - `useStudioHistoryFeedback` for history pending/feedback/notice timer state
  - `useStudioProjects` for project workspace create/select/rename/archive UI actions
  - `useStudioGalleryActions` for bookmark/share/delete history asset actions and share confirmation state
  - `useStudioReferenceUploads` for current base64 reference-image upload state, input reset, and reference replacement
  - `useStudioTaskActions` for history-task reuse/regenerate orchestration
  - `useStudioTaskSubmission` for provider validation, task payload creation, create-task calls, submission progress, and shared-template submit-success tracking
  - `studioTaskActionUtils` for history-task to composer-form derivation, runtime provider resolution, and composer scroll-back behavior
  - `studioTaskSubmissionValidation` for reference upload/provider/capability/image-count submit validation
  - `useVirtualTaskProgress` for feed-card pending/running virtual progress timers
  - `useStudioTemplates` for prompt template loading, active-template detection, and template application coordination
  - `useCustomStudioTemplates` for private-template draft/edit/save/delete feedback and persistence
  - `customStudioTemplateUtils` for private-template save validation, create/update payload building, and custom-template list helpers
  - `useStudioViewEffects` for high-level view refs and history auto-positioning
  - `useStudioComposerCollapse` for composer menu outside-click handling and auto-collapse scroll behavior
  - `useStudioGalleryPreviewEffects` for lightbox Escape/body-lock effects
  - `useStudioDefaults` for default shared-template application and fallback provider/project selection
  - `useStudioControllerState` for Studio controller base UI state, refs, and load-error helpers
  - `StudioComposerDock` now stays focused on composer form shell, focus/blur handling, and expand-to-prompt behavior
  - `studioComposerDockProps` for collapsed/expanded composer dock prop partitioning
  - `StudioComposerExpandedContent` for the expanded composer body/input/toolbar composition; it is now a thin layout shell over extracted prop contracts and prop partitioning helpers
  - `studioComposerDockTypes` and `studioComposerDockUtils` for composer dock props and derived labels/hints
  - `StudioComposerLeading` for current workspace/provider/resolution/image-count status
  - `StudioComposerToolbar` for the toolbar shell and submit action placement
  - `StudioComposerToolbarMenus` is now a thin template/provider/display/count menu composition shell; `StudioComposerTemplateMenuSlot`, `StudioComposerProviderMenuSlot`, `StudioComposerDisplayMenuSlot`, and `StudioComposerCountMenuSlot` own menu-specific prop partitioning
  - `StudioComposerProviderMenu` is now a thin provider-menu shell; trigger, panel, grouped rows, and prop contracts live in `StudioComposerProviderMenuTrigger`, `StudioComposerProviderMenuPanel`, `StudioComposerProviderGroup`, and `studioComposerProviderMenuTypes`
  - `StudioComposerDisplayMenu` is now a thin display-menu shell; trigger, panel, reusable option group, and prop contracts live in `StudioComposerDisplayMenuTrigger`, `StudioComposerDisplayMenuPanel`, `StudioComposerOptionGroup`, and `studioComposerDisplayMenuTypes`
  - `StudioComposerBody` for composer body composition; mode switching, reference-image dropzone, and prompt textarea live in `StudioComposerModeSwitch`, `StudioReferenceDropzone`, and `StudioPromptTextarea`
  - `StudioComposerCollapsedBar` for collapsed composer summary and expand affordance
  - `StudioGalleryPreviewLightbox` and `StudioShareConfirmLightbox` for generated-image preview and share-confirm modals
  - `StudioWorkspaceHeader`, `StudioNewProjectForm`, and `StudioWorkspaceProjectList` for the workspace pane header, project creation form, and project list/rename UI
  - `StudioWorkspaceCreateProjectPanel` for workspace project creation controls
  - `StudioWorkspaceProjectItem`, `StudioWorkspaceProjectRenameForm`, and `StudioWorkspaceProjectActions` for project row rendering, rename input, and row actions
  - `studioWorkspaceProjectTypes` and `studioWorkspaceProjectUtils` for workspace project list/item prop contracts and rename keyboard handling
  - `studioWorkspacePaneTypes` for the workspace pane prop contract
  - `StudioTemplateMenu` for template menu shell
  - `StudioTemplateMenuPanel` and `studioTemplateMenuProps` for template menu panel rendering and trigger/panel prop partitioning
  - `StudioTemplateMenuTrigger`, `StudioSharedTemplateSection`, `StudioCustomTemplateSection`, `StudioTemplateEditor`, and `studioTemplateMenuTypes` for template trigger, shared template browser section, custom template list, custom template editor, and menu prop contract
  - `StudioCustomTemplateListItem` and `studioCustomTemplateSectionTypes` for custom template list item rendering and custom-template section prop contracts
  - `StudioTemplateEditorHeader`, `StudioTemplateEditorFeedback`, `StudioTemplateEditorFields`, `StudioTemplateEditorActions`, and `studioTemplateEditorTypes` for custom template editor internals
  - `StudioSharedTemplateBrowser` for shared template browser composition
  - `StudioSharedTemplateSidebar`, `StudioSharedTemplateGrid`, and `StudioSharedTemplatePreview` for the sidebar/category navigation, center template grid, and right hover preview
  - `StudioSharedTemplateGridCard` and `studioSharedTemplateGridTypes` for shared template grid card rendering and grid/card prop contracts
  - `StudioSharedTemplatePreviewContent`, `StudioSharedTemplatePreviewImages`, `StudioSharedTemplatePreviewFallback`, `StudioSharedTemplatePreviewPlaceholder`, and `studioSharedTemplatePreviewTypes` for hover-preview internals
  - `StudioSharedTemplateSearch`, `StudioSharedTemplateQuickFilters`, `StudioSharedTemplateCategoryGroup`, `StudioSharedTemplateCategoryButton`, `StudioSharedTemplateSubcategoryList`, and `StudioSharedTemplateNav` for the shared-template sidebar internals
  - `studioComposerCanvasTypes` for the large composer canvas prop contract; `StudioComposerCanvas` is now only a thin visibility guard and pass-through
  - `useSharedTemplateBrowser` for shared template search/category/filter UI state
  - `useSharedTemplatePreview` for shared-template hover preview state and preview image measurement
  - `useSharedTemplateTracking` for impression/apply/hover-preview event tracking
  - `studioReferenceUtils` for reference upload restoration, file filtering, and preview URL release helpers
  - `studioTemplateBrowserUtils` for shared-template category/search/sort helpers
  - `studioTemplateUtils` for shared template category and preview sizing helpers
  - `studioUtils` is now a re-export shim over focused utility modules:
    `studioFormatUtils`, `studioAssetUtils`, `studioTaskUtils`, `studioPayloadUtils`,
    `studioTemplateFormUtils`, `studioCapabilityUtils`, and `studioReferenceUtils`
- Added model activation toggles and deployed them.
- Changed provider pricing rule defaults to `1,000,000` unit size and `USD`.
- Added provider `display_name` support and deployed it.
- Added user group assignment plus group spend reporting on dashboard/users surfaces.
- Unified dashboard `账号监管` and `执行人排行` activity logic while keeping account-level spend/quota details in monitoring view.
- Excluded legacy local `gpt-image-2` CNY history from current operational spend views to avoid mixed-currency operational summaries.
- Fixed group-spend CSV export for Excel by emitting UTF-8 BOM.
- Added frontend branding assets (`清美道合` wordmark + icon), favicon, and browser title update.
- Refined studio template browser layout, preview presentation, and hover stability.
- Added auto-collapse / expand behavior for the studio composer while browsing history.
- Compressed history-card chrome while preserving full generated image content through proportional preview scaling.
- **`cecab36` (2026-06-26, on GitHub; not deployed):** unified history gallery layout; composer max-3 images, fixed toolbar, Ctrl+Enter submit, reference × remove; dashboard group-spend custom date range; usage-log KPI + double-billing fix with `test_usage_logs.py`.
- **v1.1.0 (deployed 2026-06-29):** 2K 生图、历史 meta、反馈多轮、上传 20MB/10MB；当时 Git `0090a2a`。
- **2026-07-16 production deploy:** 访客模式 P0+P1、密码 4 位、worker×3、VIP 代码进镜像但未建 Provider；Gemini 异步误路由热修 → Git **`186b127`**。详见 `docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`。

## Current Server Snapshot

- Server IP: `120.79.227.11`
- Domain: `cityusbdisk.cn`（京ICP备14011242号-4，已备案）
- Deploy path: `/www/wwwroot/qmdh-web`
- Deployment model: Docker Compose（**worker ×3**）
- **Production Git: `186b127`** — images rebuilt 2026-07-16
- **GitHub `main`:** aligned with production @ `186b127`
- Latest session archive: `docs/handoff.md` → `[2026-07-16] 生产部署`
- **Deploy archive:** `docs/archive/deploy-2026-07-16-guest-workers-hotfix.md`
- Gemini CPA doc: `docs/cpa-gemini-image-integration.md`（含 2K 验收表）
- Verified runtime after latest deploy:
  - `docker compose ps`：backend healthy + worker-1/2/3
  - `https://cityusbdisk.cn/api/v1/health` returns healthy
- Production `.env` highlights:
  - `QMDH_FRONTEND_ORIGIN=https://cityusbdisk.cn`
  - `QMDH_PUBLIC_MEDIA_BASE_URL=https://cityusbdisk.cn`
  - `QMDH_STORAGE_BACKEND` 仍为 **local**（OSS 试用已开，业务未切）
- Current deployment note:
  - GitHub deploy key is healthy on server `admin` user
  - `git pull` fails only when run as `root`; use `sudo -u admin git -C /www/wwwroot/qmdh-web pull origin main`

## Known Risks And Follow-Up

- Local push to GitHub may need proxy on dev machine (`127.0.0.1:7897`).
- Server git operations must use `admin`; do not run `git pull` as `root`.
- `prod-001` first-pass Studio split is merged; further hook splits are optional follow-up only.
- Release/version records are tracked through root `VERSION`, `CHANGELOG.md`, package versions, and Git tags such as `v1.0.0` / `v1.1.0`.
- `storage/` and `tmp/` remain expected local-only directories and must not be committed.
- Server deploy fallback still depends on `git bundle` or **hotpatch** when Docker Hub pull fails.
- Full backend rebuild on ECS may take **~45–50 min** when Docker pip layer cache is cold; see `docs/archive/deploy-2026-06-29-v1.1.0-production.md`.
- **Deploy order:** build backend **before** `alembic upgrade head` when release adds new migration files; never run parallel `docker compose build backend`.
- Image upload still uses base64 data URLs and keeps a 20MB per-image / 10MB per-document limit; nginx `client_max_body_size` is 35m. Image edit sends base64 to upstream (~4/3 size); keep references ≤20MB to stay under typical 30MB gateway limits.
- Auto-collapsing composer behavior is improved but still a likely UX hotspot; if touched again, re-check bottom-edge expand behavior and scroll jitter.
- Older docs may still contain stale wording about historical `owner / ops` roles or project-member sharing; when docs disagree, trust `docs/product-boundary.md`, `docs/handoff.md`, and this file.

## If A New Agent Takes Over

1. Run `git status --short` first.
2. Expect current local residuals to be:
   - `storage/`
   - `tmp/`
3. Read the latest entry in `docs/handoff.md`.
4. Reconfirm:
   - local head
   - GitHub head
   - server head
   - server health
5. If the task involves deploy, remember:
   - server git pull must run as `admin`
   - fallback via local `git bundle` remains known-good
6. If touching studio UX again, re-check:
   - template picker cards and hover preview
   - regenerate behavior
   - history image lightbox behavior
   - composer auto-collapse / expand behavior near the bottom of the history pane
   - history card image readability after compact layout
   - branded rail / login / favicon rendering
7. Do not commit or deploy `tmp/`, `.env`, `backend/app.db`, `storage/`, `frontend/dist/`, or `node_modules/`.

## Near-Term Suggested Next Steps

1. When owner approves deploy: `sudo -u admin git pull` on server → rebuild frontend + backend/worker; do not touch `.env` or run migrations unless instructed.
2. Rebuild backend/worker Docker images to bake in Gemini code and drop hotpatch drift.
3. Continue Production Readiness backlog (`prod-002`, `prod-004`, etc.) per `docs/tasks.md`.
4. Optional: smoke CPA `gemini-3.1-flash-image` in Studio after deploy.
5. Grok rollout reference: `docs/archive/handoff-2026-06-12-grok-video-production.md`.
