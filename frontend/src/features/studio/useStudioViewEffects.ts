import { type Dispatch, type SetStateAction, useEffect, useRef } from "react";

import type { Project, PromptTemplateRecord, Provider, Task } from "../../api";
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
  onApplyTemplate: (template: PromptTemplateRecord, options?: { closeMenu?: boolean }) => void;
};

export type StudioViewEffectsState = ReturnType<typeof useStudioViewEffects>;

export function useStudioViewEffects({
  activeComposerMenu,
  availableProviders,
  composerFocused,
  currentUserName,
  galleryPreview,
  hasFilteredHistory,
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
    latestTaskId: latestTask?.id,
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
  }, [studioForm.projectCode]);

  useEffect(() => {
    if (!stateReady || !hasFilteredHistory || hasAutoPositionedRef.current) return;

    window.requestAnimationFrame(() => {
      latestTaskRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      hasAutoPositionedRef.current = true;
    });
  }, [hasFilteredHistory, latestTask?.id, stateReady]);

  return {
    composerCollapsed: composerCollapse.composerCollapsed,
    composerToolbarRef: composerCollapse.composerToolbarRef,
    hasAutoPositionedRef,
    latestTaskRef,
    setComposerCollapsed: composerCollapse.setComposerCollapsed,
    studioScrollPaneRef: composerCollapse.studioScrollPaneRef,
  };
}
