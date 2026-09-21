import StudioComposerBody from "./StudioComposerBody";
import StudioComposerLeading from "./StudioComposerLeading";
import StudioComposerToolbar from "./StudioComposerToolbar";
import { getStudioComposerExpandedContentProps } from "./studioComposerExpandedContentProps";
import type { StudioComposerExpandedContentProps } from "./studioComposerExpandedContentTypes";

export default function StudioComposerExpandedContent(props: StudioComposerExpandedContentProps) {
  const { bodyProps, leadingProps, referenceInputProps, toolbarProps } =
    getStudioComposerExpandedContentProps(props);
  const { fileInputRef, onReferenceInputChange } = referenceInputProps;

  return (
    <>
      <StudioComposerLeading {...leadingProps} />

      <StudioComposerBody
        {...bodyProps}
        polishingPrompt={props.polishingPrompt}
        polishError={props.polishError}
        polishNotice={props.polishNotice}
      />

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onReferenceInputChange} />

      <StudioComposerToolbar
        {...toolbarProps}
        promptPolishEnabled={props.promptPolishEnabled ?? false}
        polishingPrompt={props.polishingPrompt ?? false}
        onPolishPrompt={props.onPolishPrompt ?? (() => undefined)}
      />
    </>
  );
}
