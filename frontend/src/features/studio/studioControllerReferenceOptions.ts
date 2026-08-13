import { defaultStudioForm } from "./studioConstants";
import { grokReferenceLimit } from "./grokVideoUtils";
import { happyHorseReferenceLimit, isHappyHorseProvider } from "./happyHorseVideoUtils";
import { isSeedance2Provider, seedance2ReferenceLimit } from "./seedanceVideoUtils";
import {
  selectedReferenceUploadProviderLabel,
  selectedReferenceUploadProviderName,
} from "./studioControllerProps";
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
  const videoReferenceLimit = isHappyHorseProvider(selectedProvider)
    ? happyHorseReferenceLimit(controllerState.studioForm, selectedProvider)
    : isSeedance2Provider(selectedProvider)
      ? seedance2ReferenceLimit(controllerState.studioForm, selectedProvider)
      : grokReferenceLimit(controllerState.studioForm, selectedProvider);
  return {
    defaultTitle: defaultStudioForm.title,
    enableSeedancePrivateAvatar:
      controllerState.studioForm.creationMode === "video" && isSeedance2Provider(selectedProvider),
    fileInputRef: controllerState.fileInputRef,
    maxReferenceCount:
      controllerState.studioForm.creationMode === "video" ? videoReferenceLimit : 4,
    onClearError: controllerState.clearLoadError,
    onError: controllerState.pushLoadError,
    selectedProviderLabel: selectedReferenceUploadProviderLabel({
      fallbackProviderName: controllerState.studioForm.requestedProvider,
      selectedProvider,
    }),
    selectedProviderName: selectedReferenceUploadProviderName({
      fallbackProviderName: controllerState.studioForm.requestedProvider,
      selectedProvider,
    }),
    setStudioForm: controllerState.setStudioForm,
    setSubmissionTracker: controllerState.setSubmissionTracker,
    studioForm: controllerState.studioForm,
  };
}
