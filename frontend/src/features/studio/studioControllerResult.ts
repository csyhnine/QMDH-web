import type { SubmissionTracker } from "./studioTypes";
import type { useStudioControllerState } from "./useStudioControllerState";

type StudioControllerState = ReturnType<typeof useStudioControllerState>;

export type BuildStudioControllerResultOptions<
  TDerivedState,
  TGalleryActions,
  THistoryFeedback,
  TReferenceUpload,
  TStudioAuth,
  TStudioData,
  TStudioProjects,
  TStudioTemplates,
  TStudioView,
  TTaskActions
> = {
  controllerState: StudioControllerState;
  derivedState: TDerivedState;
  galleryActions: TGalleryActions;
  historyFeedback: THistoryFeedback;
  referenceUpload: TReferenceUpload;
  studioAuth: TStudioAuth;
  studioData: TStudioData;
  studioProjects: TStudioProjects;
  studioTemplates: TStudioTemplates;
  studioView: TStudioView;
  submissionProgress: SubmissionTracker | null;
  taskActions: TTaskActions;
};

export function buildStudioControllerResult<
  TDerivedState,
  TGalleryActions,
  THistoryFeedback,
  TReferenceUpload,
  TStudioAuth,
  TStudioData,
  TStudioProjects,
  TStudioTemplates,
  TStudioView,
  TTaskActions
>({
  controllerState,
  derivedState,
  galleryActions,
  historyFeedback,
  referenceUpload,
  studioAuth,
  studioData,
  studioProjects,
  studioTemplates,
  studioView,
  submissionProgress,
  taskActions,
}: BuildStudioControllerResultOptions<
  TDerivedState,
  TGalleryActions,
  THistoryFeedback,
  TReferenceUpload,
  TStudioAuth,
  TStudioData,
  TStudioProjects,
  TStudioTemplates,
  TStudioView,
  TTaskActions
>) {
  return {
    activeComposerMenu: controllerState.activeComposerMenu,
    derivedState,
    fileInputRef: controllerState.fileInputRef,
    filters: controllerState.filters,
    galleryActions,
    galleryPreview: controllerState.galleryPreview,
    historyFeedback,
    isStudioDockLayout: true,
    referenceUpload,
    setActiveComposerMenu: controllerState.setActiveComposerMenu,
    setComposerFocused: controllerState.setComposerFocused,
    setFilters: controllerState.setFilters,
    setGalleryPreview: controllerState.setGalleryPreview,
    setStudioForm: controllerState.setStudioForm,
    state: controllerState.state,
    studioAuth,
    studioData,
    studioForm: controllerState.studioForm,
    studioProjects,
    studioTemplates,
    studioView,
    submitting: controllerState.submitting,
    submissionProgress,
    taskActions,
  };
}
