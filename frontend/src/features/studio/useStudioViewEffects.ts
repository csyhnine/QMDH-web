import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import type { Project, PromptTemplateRecord, Provider, Task } from "../../api";
import type { FeedFilterState } from "./studioHistoryPaneTypes";
import {
  isHistoryScrolledToLatest,
  scrollHistoryPaneToEdge,
  scrollToLatestHistoryPosition,
} from "./studioHistoryScrollUtils";
import type { ComposerMenuKey, GalleryPreviewState, StudioFormState } from "./studioTypes";
import { useStudioComposerCollapse } from "./useStudioComposerCollapse";
import { useStudioDefaults } from "./useStudioDefaults";
import { useStudioGalleryPreviewEffects } from "./useStudioGalleryPreviewEffects";

type UseStudioViewEffectsOptions = {
  activeComposerMenu: ComposerMenuKey;
  availableProviders: Provider[];
  composerFocused: boolean;
  currentUserName: string | undefined;
  galleryPreview: GalleryPreviewState | null;
  hasFilteredHistory: boolean;
  historySort: FeedFilterState["sort"];
  isStudioDockLayout: boolean;
  latestTask: Task | null;
  projects: Project[];
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setGalleryPreview: Dispatch<SetStateAction<GalleryPreviewState | null>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  sharedTemplates: PromptTemplateRecord[];
  stateReady: boolean;
  studioForm: StudioFormState;
  submitting: boolean;
  uploadingReference: boolean;
  onApplyTemplate: (
    template: PromptTemplateRecord,
    options?: { closeMenu?: boolean; preserveResolution?: boolean }
  ) => void;
};

export type StudioViewEffectsState = ReturnType<typeof useStudioViewEffects>;

export function useStudioViewEffects({
  activeComposerMenu,
  availableProviders,
  composerFocused,
  currentUserName,
  galleryPreview,
  hasFilteredHistory,
  historySort,
  isStudioDockLayout,
  latestTask,
  projects,
  setActiveComposerMenu,
  setGalleryPreview,
  setStudioForm,
  sharedTemplates,
  stateReady,
  studioForm,
  submitting,
  uploadingReference,
  onApplyTemplate,
}: UseStudioViewEffectsOptions) {
  const latestTaskRef = useRef<HTMLElement | null>(null);
  const hasAutoPositionedRef = useRef(false);
  const composerCollapse = useStudioComposerCollapse({
    activeComposerMenu,
    composerFocused,
    isStudioDockLayout,
    setActiveComposerMenu,
    submitting,
    uploadingReference,
  });
  useStudioGalleryPreviewEffects({ galleryPreview, setGalleryPreview });
  useStudioDefaults({
    availableProviders,
    currentUserName,
    projects,
    setStudioForm,
    sharedTemplates,
    studioForm,
    onApplyTemplate,
  });

  useEffect(() => {
    hasAutoPositionedRef.current = false;
  }, [historySort, studioForm.projectCode]);

  useLayoutEffect(() => {
    if (!stateReady || !hasFilteredHistory || hasAutoPositionedRef.current) return undefined;

    const pane = composerCollapse.studioScrollPaneRef.current;
    if (!pane) return undefined;

    let cancelled = false;
    let attempts = 0;
    let lastScrollHeight = -1;
    const maxAttempts = 16;

    const tryScroll = () => {
      if (cancelled || hasAutoPositionedRef.current) return;

      scrollToLatestHistoryPosition(pane, latestTaskRef.current, historySort);
      attempts += 1;

      const scrollHeightStable = lastScrollHeight >= 0 && pane.scrollHeight === lastScrollHeight;
      lastScrollHeight = pane.scrollHeight;

      if (
        isHistoryScrolledToLatest(pane, historySort) &&
        (scrollHeightStable || attempts >= 3)
      ) {
        hasAutoPositionedRef.current = true;
        return;
      }

      if (attempts >= maxAttempts) {
        hasAutoPositionedRef.current = true;
        return;
      }

      window.requestAnimationFrame(tryScroll);
    };

    tryScroll();

    return () => {
      cancelled = true;
    };
  }, [hasFilteredHistory, historySort, latestTask?.id, stateReady, studioForm.projectCode]);

  const scrollHistoryToTop = useCallback(() => {
    const pane = composerCollapse.studioScrollPaneRef.current;
    if (!pane) return;
    scrollHistoryPaneToEdge(pane, "top");
  }, []);

  const scrollHistoryToBottom = useCallback(() => {
    const pane = composerCollapse.studioScrollPaneRef.current;
    if (!pane) return;
    scrollHistoryPaneToEdge(pane, "bottom");
  }, []);

  return {
    composerCollapsed: composerCollapse.composerCollapsed,
    composerToolbarRef: composerCollapse.composerToolbarRef,
    hasAutoPositionedRef,
    latestTaskRef,
    scrollHistoryToBottom,
    scrollHistoryToTop,
    setComposerCollapsed: composerCollapse.setComposerCollapsed,
    studioScrollPaneRef: composerCollapse.studioScrollPaneRef,
  };
}
