import type { useStudioControllerState } from "./useStudioControllerState";
import type { useStudioDataLoader } from "./useStudioDataLoader";
import type { useStudioHistoryFeedback } from "./useStudioHistoryFeedback";
import type { useStudioReferenceUploads } from "./useStudioReferenceUploads";
import type { useStudioTaskActions } from "./useStudioTaskActions";
import type { useStudioTemplates } from "./useStudioTemplates";
import type { useStudioViewEffects } from "./useStudioViewEffects";

type ControllerState = ReturnType<typeof useStudioControllerState>;
type StudioDataLoaderState = ReturnType<typeof useStudioDataLoader>;
type StudioHistoryFeedbackState = ReturnType<typeof useStudioHistoryFeedback>;
type StudioReferenceUploadState = ReturnType<typeof useStudioReferenceUploads>;
type StudioTemplatesState = ReturnType<typeof useStudioTemplates>;
type StudioViewEffectsState = ReturnType<typeof useStudioViewEffects>;

export function buildStudioTaskActionsOptions({
  controllerState,
  historyFeedback,
  referenceUpload,
  studioData,
  studioTemplates,
  studioView,
}: {
  controllerState: ControllerState;
  historyFeedback: StudioHistoryFeedbackState;
  referenceUpload: StudioReferenceUploadState;
  studioData: Pick<StudioDataLoaderState, "loadData">;
  studioTemplates: StudioTemplatesState;
  studioView: Pick<StudioViewEffectsState, "composerToolbarRef" | "hasAutoPositionedRef" | "setComposerCollapsed">;
}): Parameters<typeof useStudioTaskActions>[0] {
  return {
    composerToolbarRef: studioView.composerToolbarRef,
    hasAutoPositionedRef: studioView.hasAutoPositionedRef,
    historyFeedback,
    loadData: studioData.loadData,
    providers: controllerState.state.providers,
    referenceUpload,
    setActiveComposerMenu: controllerState.setActiveComposerMenu,
    setComposerCollapsed: studioView.setComposerCollapsed,
    setState: controllerState.setState,
    setStudioForm: controllerState.setStudioForm,
    setSubmissionTracker: controllerState.setSubmissionTracker,
    setSubmitting: controllerState.setSubmitting,
    studioForm: controllerState.studioForm,
    studioTemplates,
    submissionInFlightRef: controllerState.submissionInFlightRef,
  };
}
