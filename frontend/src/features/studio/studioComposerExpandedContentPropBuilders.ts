import type {
  StudioComposerBodyProps,
  StudioComposerExpandedContentProps,
  StudioComposerLeadingProps,
  StudioComposerReferenceFileInputProps,
} from "./studioComposerExpandedContentTypes";
import { getStudioComposerToolbarProps } from "./studioComposerToolbarPropsBuilder";

export function getStudioComposerLeadingProps({
  modeLabel,
  selectedProviderModelName,
  selectedResolutionLabel,
  studioForm,
  workspaceName,
}: StudioComposerExpandedContentProps): StudioComposerLeadingProps {
  return {
    modeLabel,
    selectedProviderModelName,
    selectedResolutionLabel,
    studioForm,
    workspaceName,
  };
}

export function getStudioComposerBodyProps({
  promptTextareaRef,
  referenceHint,
  maxReferenceCount,
  referenceUploads,
  studioForm,
  onModeChange,
  onOpenReferencePicker,
  onPromptChange,
  onPromptSubmitShortcut,
  onReferenceDrop,
  onRemoveReferenceUpload,
  onReplaceReferenceUpload,
  enableSeedanceAvatar,
  onRegisterSeedancePrivateAvatar,
  onStartSeedanceRealAvatar,
  onCompleteSeedanceRealAvatar,
}: StudioComposerExpandedContentProps): StudioComposerBodyProps {
  return {
    promptTextareaRef,
    referenceHint,
    maxReferenceCount,
    referenceUploads,
    studioForm,
    onModeChange,
    onOpenReferencePicker,
    onPromptChange,
    onPromptSubmitShortcut,
    onReferenceDrop,
    onRemoveReferenceUpload,
    onReplaceReferenceUpload,
    enableSeedanceAvatar,
    onRegisterSeedancePrivateAvatar,
    onStartSeedanceRealAvatar,
    onCompleteSeedanceRealAvatar,
  };
}

export function getStudioComposerReferenceInputProps({
  fileInputRef,
  onReferenceInputChange,
}: StudioComposerExpandedContentProps): StudioComposerReferenceFileInputProps {
  return {
    fileInputRef,
    onReferenceInputChange,
  };
}

export { getStudioComposerToolbarProps };
