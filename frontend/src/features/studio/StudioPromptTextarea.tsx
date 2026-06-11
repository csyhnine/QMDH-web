import { composerPromptPlaceholder } from "./studioComposerDockUtils";
import type { StudioPromptTextareaProps } from "./studioComposerExpandedContentTypes";

export default function StudioPromptTextarea({
  promptTextareaRef,
  referenceHint,
  studioForm,
  onPromptChange,
}: StudioPromptTextareaProps) {
  return (
    <label className="composer-textarea">
      <textarea
        ref={promptTextareaRef}
        rows={4}
        value={studioForm.prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder={composerPromptPlaceholder(studioForm.creationMode)}
      />
      <span className="composer-textarea-hint">{referenceHint}</span>
    </label>
  );
}
