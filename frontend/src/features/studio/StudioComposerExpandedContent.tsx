import StudioComposerBody from "./StudioComposerBody";
import StudioComposerLeading from "./StudioComposerLeading";
import StudioComposerToolbar from "./StudioComposerToolbar";
import ComfyRuntimeNotice from "./ComfyRuntimeNotice";
import ComfySizeControls from "./ComfySizeControls";
import { getStudioComposerExpandedContentProps } from "./studioComposerExpandedContentProps";
import type { StudioComposerExpandedContentProps } from "./studioComposerExpandedContentTypes";
import { usePromptPolishEnabled } from "../../lib/usePromptPolishEnabled";
import { useStudioPromptPolish } from "./useStudioPromptPolish";

export default function StudioComposerExpandedContent(props: StudioComposerExpandedContentProps) {
  const { bodyProps, leadingProps, referenceInputProps, toolbarProps } =
    getStudioComposerExpandedContentProps(props);
  const { fileInputRef, onReferenceInputChange } = referenceInputProps;

  const promptPolishEnabled = usePromptPolishEnabled();
  const {
    polishing,
    polishPrompt,
    error: polishError,
    notice: polishNotice,
    history: polishHistory,
    activeHistoryId: activePolishHistoryId,
    applyHistoryEntry,
  } = useStudioPromptPolish({
    studioForm: props.studioForm,
    referenceUploads: props.referenceUploads,
    onPromptChange: props.onPromptChange,
    onPolished: props.onPromptPolished,
  });

  return (
    <>
      <StudioComposerLeading {...leadingProps} />
      {props.selectedProvider?.adapter_kind === "comfyui" ? <ComfyRuntimeNotice editing={props.studioForm.creationMode === "edit"} /> : null}
      {props.selectedProvider?.adapter_kind === "comfyui" ? <ComfySizeControls ratio={props.studioForm.aspectRatio} onChange={props.onAspectRatioSelect} /> : null}

      <StudioComposerBody
        {...bodyProps}
        polishingPrompt={polishing}
        polishError={polishError}
        polishNotice={polishNotice}
        polishHistory={polishHistory}
        activePolishHistoryId={activePolishHistoryId}
        onSelectPolishHistory={applyHistoryEntry}
        promptPolishEnabled={promptPolishEnabled ?? false}
      />

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onReferenceInputChange} />

      <StudioComposerToolbar
        {...toolbarProps}
        promptPolishEnabled={promptPolishEnabled ?? false}
        polishingPrompt={polishing}
        onPolishPrompt={() => void polishPrompt()}
      />
    </>
  );
}
