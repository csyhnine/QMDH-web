import { defaultStudioForm } from "./studioConstants";
import { grokReferenceLimit } from "./grokVideoUtils";
import { selectedReferenceUploadProviderName } from "./studioControllerProps";
import type { StudioDerivedState } from "./studioDerivedState";
import type { useStudioControllerState } from "./useStudioControllerState";
import type { useStudioReferenceUploads } from "./useStudioReferenceUploads";

type ControllerState = ReturnType<typeof useStudioControllerState>;

export function buildStudioReferenceUploadOptions({
  controllerState,
  selectedProvider,
}: {
  controllerState: ControllerState;
  selectedProvider: StudioDerivedState["selectedProvider"];
}): Parameters<typeof useStudioReferenceUploads>[0] {
  return {
    defaultTitle: defaultStudioForm.title,
    fileInputRef: controllerState.fileInputRef,
    maxReferenceCount:
      controllerState.studioForm.creationMode === "video"
        ? grokReferenceLimit(controllerState.studioForm, selectedProvider)
        : 4,
    onClearError: controllerState.clearLoadError,
    onError: controllerState.pushLoadError,
    selectedProviderName: selectedReferenceUploadProviderName({
      fallbackProviderName: controllerState.studioForm.requestedProvider,
      selectedProvider,
    }),
    setStudioForm: controllerState.setStudioForm,
    setSubmissionTracker: controllerState.setSubmissionTracker,
    studioForm: controllerState.studioForm,
  };
}
