import type { StudioDerivedState } from "./studioDerivedState";
import type { useStudioAuth } from "./useStudioAuth";
import type { useStudioControllerState } from "./useStudioControllerState";
import type { useStudioReferenceUploads } from "./useStudioReferenceUploads";
import type { useStudioTemplates } from "./useStudioTemplates";
import type { useStudioViewEffects } from "./useStudioViewEffects";

type ControllerState = ReturnType<typeof useStudioControllerState>;
type StudioAuthState = ReturnType<typeof useStudioAuth>;
type StudioTemplatesState = ReturnType<typeof useStudioTemplates>;
type StudioReferenceUploadState = ReturnType<typeof useStudioReferenceUploads>;

export function buildStudioViewEffectsOptions({
  controllerState,
  currentUser,
  derivedState,
  referenceUpload,
  studioTemplates,
}: {
  controllerState: ControllerState;
  currentUser: StudioAuthState["currentUser"];
  derivedState: StudioDerivedState;
  referenceUpload: Pick<StudioReferenceUploadState, "uploadingReference">;
  studioTemplates: Pick<StudioTemplatesState, "applyTemplate" | "sharedTemplates">;
}): Parameters<typeof useStudioViewEffects>[0] {
  return {
    activeComposerMenu: controllerState.activeComposerMenu,
    availableProviders: derivedState.availableProviders,
    composerFocused: controllerState.composerFocused,
    currentUserName: currentUser?.name,
    galleryPreview: controllerState.galleryPreview,
    hasFilteredHistory: derivedState.hasFilteredHistory,
    isStudioDockLayout: true,
    latestTask: derivedState.latestTask,
    projects: controllerState.state.projects,
    setActiveComposerMenu: controllerState.setActiveComposerMenu,
    setGalleryPreview: controllerState.setGalleryPreview,
    setStudioForm: controllerState.setStudioForm,
    sharedTemplates: studioTemplates.sharedTemplates,
    stateReady: controllerState.state.ready,
    studioForm: controllerState.studioForm,
    submitting: controllerState.submitting,
    uploadingReference: referenceUpload.uploadingReference,
    onApplyTemplate: studioTemplates.applyTemplate,
  };
}
