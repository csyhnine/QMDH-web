import StudioComposerBody from "./StudioComposerBody";
import StudioComposerLeading from "./StudioComposerLeading";
import StudioComposerToolbar from "./StudioComposerToolbar";
import { getStudioComposerExpandedContentProps } from "./studioComposerExpandedContentProps";
import type { StudioComposerExpandedContentProps } from "./studioComposerExpandedContentTypes";
import { usePromptPolishEnabled } from "../../lib/usePromptPolishEnabled";
import { useStudioPromptPolish } from "./useStudioPromptPolish";

export default function StudioComposerExpandedContent(props: StudioComposerExpandedContentProps) {
  const { bodyProps, leadingProps, referenceInputProps, toolbarProps } =
    getStudioComposerExpandedContentProps(props);
  const { fileInputRef, onReferenceInputChange } = referenceInputProps;

  const promptPolishEnabled = usePromptPolishEnabled();
  const { polishing, polishPrompt, error: polishError } = useStudioPromptPolish({
    studioForm: props.studioForm,
    referenceUploads: props.referenceUploads,
    onPromptChange: props.onPromptChange,
  });

  return (
    <>
      <StudioComposerLeading {...leadingProps} />

      <StudioComposerBody {...bodyProps} polishingPrompt={polishing} polishError={polishError} />

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
