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

- **Active development sequence**: `docs/tasks.md` → **`Development Sequence (2026-06)`**
- Current branch (primary worktree): `codex/video-model-providers` @ `c237d93` + video-provider WIP
- Local `main`: `c237d93` — Studio refactor merged (`12fb9fe` + composer CSS fix)
- GitHub `origin/main`: `005e25d` — **not yet pushed** with Studio merge
- Production server: `6ae35b1` — Studio refactor **not deployed**
- Active worktrees:
  - `E:/projects/QMDH-web` → `codex/video-model-providers`
  - `E:/projects/QMDH-web-pr1-review` → `codex/prod-001-studio-refactor` @ `c237d93`
- Phase status (2026-06-11):
  - Phase 0: baseline smoke DONE locally (`smoke:studio` 8/8); production health OK
  - Phase 1: Studio PR merged to local `main` DONE; push/close PR TODO
  - Phase 2: video WIP applied on top of Studio merge IN_PROGRESS
- `GenerateStudioShell.tsx` is now a ~24-line entrypoint; Studio modules live under `frontend/src/features/studio/`
- `scripts/smoke-studio.mjs` + `npm run smoke:studio` available for API smoke
- Local dev URLs:
  - frontend: `http://127.0.0.1:18080`
  - backend: `http://127.0.0.1:18010`
- Local helper commands:
  - startup: `cmd /c start-dev.cmd`
  - build: `npm run build`
  - smoke: `npm run smoke:studio`
  - backend slice: `backend\.venv\Scripts\python.exe -m pytest tests\test_database_auth.py -q`
- Do not commit: `storage/`, `tmp/`, `.env`, `backend/app.db`, `frontend/dist/`, `node_modules/`

## Current Product Reality

- Active runtime roles remain only `admin` and `designer`.
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
  - left rail now uses the provided QMDH icon asset instead of the placeholder `Q`
  - login uses full `清美道合` wordmark + icon
  - browser title is now `清美道合`
- Current studio composer reality:
  - the composer can auto-collapse into a compact bar while browsing history
  - focusing, opening menus, hovering the collapsed bar, uploading references, or submitting expands it again
- Current history card reality:
  - cards are denser than earlier versions
  - generated image previews now preserve full image content through proportional shrink (`contain`) instead of banner-like crop
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
  - `StudioComposerBody` for composer body composition; mode switching, reference-image dropzone, reference upload chips, and prompt textarea now live in `StudioComposerModeSwitch`, `StudioReferenceDropzone`, `StudioReferenceUploadList`, and `StudioPromptTextarea`
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

## Current Server Snapshot

- Server IP: `120.79.227.11`
- Deploy path: `/www/wwwroot/qmdh-web`
- Deployment model: Docker Compose
- Current deployed product repo head: `6ae35b1`
- Server working tree: clean
- Verified runtime after latest deploy:
  - `docker compose ps` healthy
  - `http://127.0.0.1:8080/api/v1/health` returns `200`
  - `http://120.79.227.11/api/v1/health` returns `200`
- Current migration status:
  - no new migration was required for the `6ae35b1` deployment baseline
- Current deployment caveat:
  - server-side pull remains unreliable
  - recent deploys continue to use local `git bundle` fallback
- Server access practice:
  - use `admin` for normal git operations when credentials cooperate
  - use `root` for Docker / PostgreSQL / logs / fallback deployment work

## Known Risks And Follow-Up

- Local `main` is ahead of GitHub/server with Studio refactor; push and deploy require explicit approval.
- Phase 2 video-provider WIP is applied but not yet committed; do not deploy until tests pass and user approves.
- Designer video UI (Phase 3) must wait for Phase 2 merge to `main`.
- `prod-001` first-pass Studio split is merged; further hook splits are optional follow-up only.
- Release/version records are tracked through `CHANGELOG.md`, package versions, and the optional `v0.2.0` Git tag.
- `storage/` and `tmp/` remain expected local-only directories and must not be committed.
- Server deploy fallback still depends on `git bundle`.
- Image upload still uses base64 data URLs and keeps a 10MB per-image limit; raising it safely requires changing both frontend/backend limits and possibly nginx body size.
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
   - server-side pull may fail
   - fallback via local `git bundle` is known-good
6. If touching studio UX again, re-check:
   - template picker cards and hover preview
   - regenerate behavior
   - history image lightbox behavior
   - composer auto-collapse / expand behavior near the bottom of the history pane
   - history card image readability after compact layout
   - branded rail / login / favicon rendering
7. Do not commit or deploy `tmp/`, `.env`, `backend/app.db`, `storage/`, `frontend/dist/`, or `node_modules/`.

## Near-Term Suggested Next Steps

Follow **`docs/tasks.md` → Development Sequence (2026-06)`**:

1. **Phase 2**: finish video pytest + commit + merge to `main`.
2. **Phase 1 wrap-up**: push `main`, close PR #1 on GitHub.
3. **Optional deploy**: Studio merge to server via bundle (user approval required).
4. **Phase 3**: start `video-002` designer Studio video UI after Phase 2 lands.
