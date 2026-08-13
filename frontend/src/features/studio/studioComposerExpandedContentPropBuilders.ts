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
  referenceUploads,
  studioForm,
  onModeChange,
  onOpenReferencePicker,
  onPromptChange,
  onPromptSubmitShortcut,
  onReferenceDrop,
  onRemoveReferenceUpload,
  onReplaceReferenceUpload,
  onRetrySeedancePrivateAvatar,
}: StudioComposerExpandedContentProps): StudioComposerBodyProps {
  return {
    promptTextareaRef,
    referenceHint,
    referenceUploads,
    studioForm,
    onModeChange,
    onOpenReferencePicker,
    onPromptChange,
    onPromptSubmitShortcut,
    onReferenceDrop,
    onRemoveReferenceUpload,
    onReplaceReferenceUpload,
    onRetrySeedancePrivateAvatar,
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
