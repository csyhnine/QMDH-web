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

- Current branch: `codex/prod-001-studio-refactor`
- Current release marker: `v0.2.0`
- Current local refactor status:
  - `prod-001` is in progress and not yet committed.
  - Phase 1 protection checkpoint completed on 2026-06-09: local HEAD is `005e25d`, `origin/main` is `005e25d33e3a99ba4501c46428d19fee522ab91a`, and the WIP now lives on `codex/prod-001-studio-refactor`.
  - No commit, push, or deploy has been performed for this WIP.
  - Final WIP review/staging prep is now active: Studio splitting is stopped unless the user explicitly reopens it.
  - 2026-06-09 review fix package is in the working tree: Studio preview cleanup, provider key response redaction, inspiration SSRF protections, Redis enqueue failure handling, production bootstrap-admin password guard, partial legacy schema bootstrap fix, and Chat streaming API base/auth helper reuse.
  - `frontend/src/features/studio/GenerateStudioShell.tsx` is now a 24-line auth/login/authenticated-shell entrypoint.
  - The old Studio-owned admin branch has been removed from this WIP path. Real admin pages live under `frontend/src/pages/admin/*` and route through `frontend/src/router.tsx`.
  - New WIP Studio modules include `StudioAuthenticatedShell`, `StudioDesignerView`, `StudioCanvasView`, `StudioHistoryCanvas`, `StudioComposerCanvas`, `StudioComposerDock`, `StudioComposerExpandedContent`, `StudioComposerLeading`, `StudioComposerToolbar`, `StudioComposerToolbarMenus`, `StudioComposerTemplateMenuSlot`, `StudioComposerProviderMenuSlot`, `StudioComposerDisplayMenu`, `StudioComposerDisplayMenuPanel`, `StudioComposerDisplayMenuTrigger`, `StudioComposerOptionGroup`, `StudioComposerDisplayMenuSlot`, `StudioComposerCountMenuSlot`, `StudioComposerBody`, `StudioComposerModeSwitch`, `StudioReferenceDropzone`, `StudioReferenceUploadList`, `StudioPromptTextarea`, `StudioComposerCollapsedBar`, `StudioCustomTemplateSection`, `StudioFeedCard`, `StudioFeedCardAvatar`, `StudioFeedCardTopline`, `StudioFeedCardSummary`, `StudioFeedCardFailureDetails`, `StudioFeedCardMeta`, `StudioAssetTile`, `StudioFeedCardActions`, `StudioFeedActionButton`, `StudioFeedCardFooter`, `StudioGalleryPreviewLightbox`, `StudioHistoryEmptyState`, `StudioHistoryFeed`, `StudioHistoryFeedItem`, `StudioHistoryFilters`, `StudioGlobalRail`, `StudioGlobalRailFooter`, `StudioGlobalRailNav`, `StudioLoginView`, `StudioMediaLightboxes`, `StudioNewProjectForm`, `StudioShareConfirmLightbox`, `StudioTemplateEditor`, `StudioTemplateMenu`, `StudioTemplateMenuTrigger`, `StudioSharedTemplateBrowser`, `StudioSharedTemplateGrid`, `StudioSharedTemplatePreview`, `StudioSharedTemplatePreviewContent`, `StudioSharedTemplatePreviewImages`, `StudioSharedTemplatePreviewFallback`, `StudioSharedTemplatePreviewPlaceholder`, `StudioSharedTemplateSection`, `StudioSharedTemplateSidebar`, `StudioSharedTemplateNav`, `StudioSharedTemplateQuickFilters`, `StudioSharedTemplateCategoryGroup`, `StudioSharedTemplateSearch`, `StudioWorkspaceHeader`, `StudioWorkspaceProjectActions`, `StudioWorkspaceProjectItem`, `StudioWorkspaceProjectList`, `StudioWorkspaceProjectRenameForm`, `customStudioTemplateActions`, `customStudioTemplateState`, `customStudioTemplateUtils`, `studioAuthenticatedShellProps`, `studioComposerCanvasTypes`, `studioComposerDisplayMenuTypes`, `studioComposerDockTypes`, `studioComposerDockUtils`, `studioComposerExpandedContentProps`, `studioComposerExpandedContentTypes`, `studioComposerToolbarTypes`, `studioFeedActionUtils`, `studioFeedCardTypes`, `studioGlobalRailTypes`, `studioHistoryCanvasProps`, `studioHistoryCanvasTypes`, `studioHistoryFeedTypes`, `studioHistoryPaneTypes`, `studioMediaLightboxTypes`, `studioSharedTemplatePreviewTypes`, `studioTemplateMenuTypes`, `studioWorkspacePaneTypes`, `studioDerivedState`, `studioSubmissionProgress`, `studioTemplateUtils`, `studioTemplateBrowserUtils`, `studioAssetUtils`, `studioCapabilityUtils`, `studioFormatUtils`, `studioPayloadUtils`, `studioReferenceUtils`, `studioTaskUtils`, `studioTaskActionUtils`, `studioTaskSubmissionValidation`, `studioTemplateFormUtils`, `useCustomStudioTemplateEditorState`, `useGenerateStudioController`, `useSharedTemplateBrowser`, `useSharedTemplatePreview`, `useSharedTemplateTracking`, `useCustomStudioTemplates`, `useStudioAuth`, `useStudioComposerCollapse`, `useStudioControllerState`, `useStudioDataLoader`, `useStudioDefaults`, `useStudioFeedCardState`, `useStudioGalleryActions`, `useStudioGalleryPreviewEffects`, `useStudioHistoryFeedback`, `useStudioProjects`, `useStudioReferenceUploads`, `useStudioTaskActions`, `useStudioTaskSubmission`, `useStudioTemplates`, `useStudioViewEffects`, `useVirtualTaskProgress`, and shared Studio utils/types/constants.
  - `scripts/smoke-studio.mjs` and `npm run smoke:studio` have been added locally for the first scripted Studio smoke pass; this is not yet an online/server smoke runbook.
  - Do not deploy this WIP until it is reviewed, staged intentionally, and visually smoke-tested.
- Current product deployment baseline before the version-recording commit:
  - `6ae35b1` `feat(models): add model activation toggle`
- Local / GitHub / server were re-verified aligned at `6ae35b1` before creating the `v0.2.0` release-record commit.
- After the `v0.2.0` documentation/version commit, re-check `git log -1 --oneline` for the current local/GitHub HEAD; the server remains at the deployed product baseline unless a separate deploy is requested.
- Recent commit chain:
  - `6ae35b1` `feat(models): add model activation toggle`
  - `ceda88e` `fix(studio): keep template preview on hover`
  - `c9a9161` `fix(studio): constrain template browser height`
  - `57d134c` `feat(frontend): refine studio flow and add branding`
  - `e30e191` `fix(dashboard): contain ops cards and hide zero-cost currency`
- Current local working tree status:
  - WIP frontend refactor changes are expected in `frontend/src/features/studio/`
  - untracked local-only folders remain expected: `storage/`, `tmp/`
  - Validation after the final review fix package passed: backend tests (`110 passed, 1 warning, 22 subtests`), `npm run build`, `npm run smoke:studio` (8/8 against `http://127.0.0.1:18080`), and `git diff --check` with only known CRLF warnings.
  - `git add -n .` dry-run did not include forbidden local/generated paths: `tmp/`, `.env`, `backend/app.db`, `storage/`, `frontend/dist/`, or `node_modules/`.
  - `frontend\node_modules\.bin\tsc.cmd --noEmit -p frontend\tsconfig.json` still fails only on known global type debt: `ImportMeta.env`, PNG module declarations, `DashboardPage.tsx` group summary typing, and `router.tsx` JSX namespace.
  - Current largest TSX hotspots after recount: `StudioWorkspacePane.tsx` 52 lines, `StudioHistoryFeedItem.tsx` / `StudioSharedTemplatePreviewImages.tsx` / `StudioShareConfirmLightbox.tsx` 49 lines, `StudioComposerCollapsedBar.tsx` 47 lines.
  - Current largest TS hotspots after the twenty-third Phase 2 chunk and final review prep: `studioDerivedState.ts` / `useSharedTemplateBrowser.ts` 107 lines, `useStudioGalleryActions.ts` / `useSharedTemplatePreview.ts` 106 lines, `useStudioReferenceUploads.ts` / `useStudioTemplates.ts` 103 lines, and `useCustomStudioTemplateMutations.ts` 100 lines.
  - Five-stage continuation Stage 1 was rechecked and recorded at 2026-06-09 01:31 +08:00: branch `codex/prod-001-studio-refactor`, local HEAD `005e25d`, recent commits `005e25d` / `6ae35b1` / `ceda88e` / `c9a9161` / `57d134c`, same broad uncommitted WIP, and the same current hotspot snapshot above.
  - Continue the five-stage loop by doing Stage 2 as either a deeper browser visual smoke pass or one very small controller/helper split with React hook call order untouched.
  - Five-stage continuation Stage 2/3 completed on 2026-06-09 after the Stage 1 recheck:
    - Browser visual smoke confirmed Studio shell, collapsed-to-expanded composer, template menu structure, provider/display/count menus, feed cards/actions, and generated-image lightbox.
    - Template menu rendered sidebar search, `全部 / 热度 / 最新` nav, category/subcategory nav, 6 template cards, right hover-preview container, custom-template empty section, and template editor.
    - Gallery lightbox opened from `查看大图`, loaded a `/media/...png` image, and closed cleanly.
    - No browser console errors were captured.
    - `npm run build`, `npm run smoke:studio`, and `git diff --check` passed after the visual smoke; diff-check still reports only known CRLF warnings.
    - Known remaining visual risk: browser mouse-move automation still does not populate template hover-preview content, so manual/stronger hover validation remains recommended before commit/deploy.
  - Phase 2 first chunk moved the reference upload transport loop into `studioReferenceUtils.uploadReferenceFiles`; upload transport remains base64.
  - Phase 2 second chunk moved custom template save/delete API orchestration into `customStudioTemplateActions.ts`; private template validation, feedback, list update, and edit-state behavior are intended to stay unchanged.
  - Phase 2 third chunk split `studioCanvasProps.ts` into composer/history prop builders while preserving the public `buildStudioCanvasProps` entrypoint.
  - Phase 2 fourth chunk split task submission payload/tracker/template-event helpers into `studioTaskSubmissionActions.ts` while preserving `useStudioTaskSubmission.ts` submit flow behavior.
  - Phase 2 fifth chunk split gallery asset/preview/task-removal/share-confirm state helpers into `studioGalleryActionUtils.ts` while preserving `useStudioGalleryActions.ts` async action flow.
  - Phase 2 sixth chunk split shared-template browser category/heading/toggle state helpers into `sharedTemplateBrowserState.ts` while preserving `useSharedTemplateBrowser.ts` browser flow.
  - Phase 2 seventh chunk split composer expanded-content prop partitioning into `studioComposerExpandedContentPropBuilders.ts` and `studioComposerToolbarPropsBuilder.ts` while preserving the public `getStudioComposerExpandedContentProps` entrypoint.
  - Phase 2 eighth chunk split task title/failure/reference/progress helpers into focused modules while preserving `studioTaskUtils.ts` and `studioUtils.ts` export compatibility.
  - Phase 2 ninth chunk split custom-template editor state into `useCustomStudioTemplateEditorState.ts` and feedback/edit predicates into `customStudioTemplateState.ts`, while preserving private-template save/delete/edit behavior.
  - Phase 2 tenth chunk split reference-upload storage-path, removal, uploading tracker, and tracker cleanup helpers into `studioReferenceUtils.ts`, while preserving base64 upload behavior.
  - Phase 2 eleventh chunk split history-task composer application and regenerate feedback derivation into `studioTaskActionUtils.ts`, while preserving task reuse/regenerate behavior.
  - Phase 2 twelfth chunk split first-pass controller wiring helpers into `studioControllerProps.ts`, while preserving `useGenerateStudioController.ts` hook orchestration and call order.
  - Phase 2 thirteenth chunk split controller hook options into focused pure helper modules: `studioControllerDataOptions.ts`, `studioControllerReferenceOptions.ts`, `studioControllerViewOptions.ts`, and `studioControllerTaskOptions.ts`, with `studioControllerHookOptions.ts` kept as an 8-line re-export shim. `useGenerateStudioController.ts` is now 93 lines and still invokes hooks in the same order.
  - Phase 2 fourteenth chunk split reference-upload list state into `useStudioReferenceUploadState.ts`; `useStudioReferenceUploads.ts` is now 103 lines and remains focused on file events, base64 upload orchestration, upload tracker state, API upload calls, and input reset. Upload transport remains base64.
  - Phase 2 fifteenth chunk split historical task-to-form derivation into `studioTaskFormUtils.ts`; `studioTaskActionUtils.ts` is now 79 lines and remains focused on action-side effects, composer scroll-back, and regenerate feedback.
  - Phase 2 sixteenth chunk split reference-upload transport into `studioReferenceUploadTransport.ts`; `studioReferenceUtils.ts` now re-exports `uploadReferenceFiles` and stays focused on restored uploads, preview release, trackers, and file preparation. Upload transport remains base64 and still uses `api.uploadReferenceImage`.
  - Phase 2 seventeenth chunk split custom-template save/delete React callbacks into `useCustomStudioTemplateMutations.ts`; `useCustomStudioTemplates.ts` is now a 78-line composition hook. Private-template save/delete behavior, feedback, list update, edit-state cleanup, and API helper usage are intended to stay unchanged.
  - Phase 2 eighteenth chunk split task-submission state helpers into `studioTaskSubmissionState.ts`; `useStudioTaskSubmission.ts` is now 113 lines and still owns the same submit orchestration. Provider correction, in-flight guard, failure state, and cleanup order are intended to stay unchanged.
  - Phase 2 nineteenth chunk split Studio controller return-object assembly into `studioControllerResult.ts`; `studioControllerProps.ts` re-exports `buildStudioControllerResult` for compatibility and keeps the smaller provider-name / submission-progress helpers.
  - Phase 2 twentieth chunk split shared-template browser action handlers into `useSharedTemplateBrowserActions.ts`; `useSharedTemplateBrowser.ts` is now 107 lines and still owns browser state, filtering, hover preview, impressions, and return shape.
  - Phase 2 twenty-first chunk split the `useStudioTaskActions.ts` options/type contract into `studioTaskActionsTypes.ts`; `useStudioTaskActions.ts` is now 91 lines and still owns the same apply/regenerate/submit hook logic.
  - Phase 2 twenty-second chunk split the `useStudioTaskSubmission.ts` options/type contract into `studioTaskSubmissionTypes.ts`; `useStudioTaskSubmission.ts` is now 96 lines and still owns the same submit callback orchestration.
  - Phase 2 twenty-third chunk split the `useStudioGalleryActions.ts` options/type contract into `studioGalleryActionsTypes.ts`; `useStudioGalleryActions.ts` is now 106 lines and still owns the same gallery action orchestration.
  - Current largest TS hotspots after the twenty-third Phase 2 chunk are `studioDerivedState.ts` 107 lines, `useSharedTemplateBrowser.ts` 107 lines, `useStudioGalleryActions.ts` 106 lines, `useSharedTemplatePreview.ts` 106 lines, and `useStudioTemplates.ts` / `useStudioReferenceUploads.ts` 103 lines.
  - Five-stage continuation Stage 4/5 was refreshed on 2026-06-09 after the selected `useStudioGalleryActions.ts` type-contract split; current next target is a small helper split in `studioDerivedState.ts`, `useSharedTemplateBrowser.ts`, `useSharedTemplatePreview.ts`, or `useCustomStudioTemplateMutations.ts`, or final WIP review/staging preparation.
  - After all twenty-three Phase 2 chunks, `npm run build`, `npm run smoke:studio`, and `git diff --check` passed, with only known CRLF warnings from diff-check.
- Local dev URLs:
  - frontend: `http://127.0.0.1:18080`
  - backend: `http://127.0.0.1:18010`
- Local helper commands:
  - startup check: `cmd /c start-dev.cmd --check`
  - frontend build: `npm run build`
  - Studio scripted smoke: `npm run smoke:studio`
  - backend regression slice:
    - `.\.venv\Scripts\python.exe -m pytest tests\test_database_auth.py -q`

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

- `prod-001` splitting is paused for final WIP review/staging. Current remaining Studio hotspots are small hook/helper files around 100-107 lines (`studioDerivedState.ts`, `useSharedTemplateBrowser.ts`, `useStudioGalleryActions.ts`, `useSharedTemplatePreview.ts`, `useStudioReferenceUploads.ts`, `useStudioTemplates.ts`, `useCustomStudioTemplateMutations.ts`); TSX shells are around 52 lines or below.
- Current `prod-001` refactor WIP has not been committed, pushed, or deployed.
- The dry-run staging set is broad; review it intentionally and do not stage, commit, push, or deploy without user confirmation.
- Scripted Studio smoke now exists locally via `scripts/smoke-studio.mjs`, but the broader online smoke process and production Base URL runbook still need to be formalized.
- Server/GitHub/deploy state was not rechecked during the final review fix package; recheck before any release work.
- TypeScript `--noEmit` still has known global type debt even though production build passes.
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

Current latest priority:

0. Stop further Studio splitting for the current `prod-001` WIP. Final review/staging prep has started: `.gitignore` now explicitly ignores root `storage/` and `tmp/`; final review fixed two Studio type-contract issues found by `tsc`; `npm run build` passed; `npm run smoke:studio` passed 8/8 on temporary local ports `18081 -> 18011` because default backend port `18010` was occupied by a non-repo process; `git diff --check` passed with only CRLF warnings; `git add -n .` dry-run did not include forbidden local-only paths.
0. Review scope clarification: the whole project has not yet been fully code-reviewed. The completed review scope so far is the current `prod-001` Studio WIP/staging-prep pass; broader backend, non-Studio frontend, scripts/config, deployment/server, and GitHub state review remains open.
1. Continue `prod-001` only as final review/staging preparation for the current WIP; avoid more helper/component splits unless review finds a concrete correctness issue.
2. Run a fresh local and online smoke pass before any commit/deploy decision, especially Studio history, composer collapse, model admin, login, dashboard/users/settings views, and shared-template hover preview.
3. Keep Anthropic runtime adapter, usage-based template popularity, multipart/direct upload, and fully scripted online smoke tests as follow-up mainline items.

1. Run a fresh online smoke pass for:
   - composer collapsed-bar expand behavior at scroll bottom
   - history card image readability across wide / tall outputs
   - template picker right preview on mixed aspect ratios
   - branded rail / login / favicon rendering
2. Continue splitting the remaining Studio hotspots now that `GenerateStudioShell.tsx` is a thin entrypoint.
3. Decide whether template `热度` should remain manual-only or gain true usage-based ranking in the studio UI.
4. Decide whether to keep base64 image upload or move to multipart/direct upload before increasing image size limits.
5. Continue cleaning old docs and mental models so new agents do not reintroduce project-shared history assumptions.

## Context Cleanup Archive - 2026-06-09

- This conversation was archived to reduce context load and continue development in a fresh thread.
- Detailed archive: `docs/archive/prod-001-studio-refactor-context-cleanup-2026-06-09.md`
- Current local state at archive time:
  - branch: `codex/prod-001-studio-refactor`
  - HEAD: `005e25d`
  - worktree: broad uncommitted WIP
- Current `prod-001` outcome:
  - TSX large-component splitting is effectively complete.
  - Remaining maintainability work is mostly TS hook/helper cleanup.
- Safe next thread behavior:
  - start with local fact checks, not old chat assumptions
  - do not commit or deploy without explicit confirmation
  - keep `storage/` and `tmp/` local-only
  - either perform one tiny TS helper split or begin final review/staging preparation
