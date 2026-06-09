# prod-001 Studio Refactor Context Cleanup Archive - 2026-06-09

This archive records the state at the point where the current conversation was intentionally closed to reduce context load.

## Verified Local State

- Workspace: `E:\projects\QMDH-web`
- Branch: `codex/prod-001-studio-refactor`
- HEAD: `005e25d`
- Recent history:
  - `005e25d chore: record v0.2.0 release`
  - `6ae35b1 feat(models): add model activation toggle`
  - `ceda88e fix(studio): keep template preview on hover`
  - `c9a9161 fix(studio): constrain template browser height`
  - `57d134c feat(frontend): refine studio flow and add branding`
- Worktree state: broad uncommitted Studio refactor WIP with many tracked modifications and many untracked split files.
- Local-only directories still present and must not be committed: `storage/`, `tmp/`.

## Current Refactor Result

- The `prod-001` Studio refactor remains behavior-preserving.
- TSX large-component splitting is effectively complete.
- `GenerateStudioShell.tsx` is now a thin auth/login/authenticated-shell entrypoint of about 24 lines.
- Current largest TSX modules are small shells/components:
  - `StudioWorkspacePane.tsx` 52 lines
  - `StudioHistoryFeedItem.tsx` 49 lines
  - `StudioSharedTemplatePreviewImages.tsx` 49 lines
  - `StudioShareConfirmLightbox.tsx` 49 lines
  - `StudioComposerCollapsedBar.tsx` 47 lines
- Remaining maintainability hotspots are mostly TS hooks/utils:
  - `studioDerivedState.ts` 107 lines
  - `useSharedTemplateBrowser.ts` 107 lines
  - `useStudioGalleryActions.ts` 106 lines
  - `useSharedTemplatePreview.ts` 106 lines
  - `useStudioReferenceUploads.ts` 103 lines
  - `useStudioTemplates.ts` 103 lines
  - `useCustomStudioTemplateMutations.ts` 100 lines

## Verification Record

- Latest recorded chunk validation passed:
  - `npm run build`
  - `npm run smoke:studio` with 8/8 checks against `http://127.0.0.1:18080`
  - `git diff --check` with only known CRLF warnings
- Browser visual smoke previously confirmed Studio shell, composer expansion, template menu structure, provider/display/count menus, feed-card actions/header, generated-image lightbox, and no captured console errors.
- Remaining visual risk: automated mouse movement still did not reliably populate shared-template hover-preview content; stronger/manual hover verification is recommended before commit/deploy.
- Full `tsc --noEmit` remains blocked only by known global type issues: `ImportMeta.env`, PNG declarations, `DashboardPage.tsx` group summary typing, and `router.tsx` JSX namespace.

## Boundaries

- Do not commit or deploy without explicit user confirmation.
- Do not stage or commit `tmp/`, `.env`, `backend/app.db`, `storage/`, `frontend/dist/`, or `node_modules/`.
- Do not add Anthropic runtime adapter work, real upstream model integration, usage-based template ranking, or upload protocol changes unless the user explicitly asks.
- Production/server baseline should still be treated as product code `6ae35b1`; local HEAD `005e25d` is the v0.2.0 release-record commit. Reconfirm GitHub/server state before any deploy work.

## Recommended Continuation

1. Start the new conversation with `git status --short`, branch, HEAD, recent log, and hotspot counts.
2. Prefer either:
   - one or two small TS hook/helper splits in `studioDerivedState.ts`, `useSharedTemplateBrowser.ts`, `useSharedTemplatePreview.ts`, or `useCustomStudioTemplateMutations.ts`; or
   - stop splitting and begin final WIP review/staging preparation.
3. After every chunk, run `npm run build`, `npm run smoke:studio`, and `git diff --check`.
4. Keep updating `docs/handoff.md`, `docs/continuity.md`, and `docs/tasks.md` after each chunk.
