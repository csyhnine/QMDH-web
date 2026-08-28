import { composerPromptPlaceholder } from "./studioComposerDockUtils";
import type { StudioPromptTextareaProps } from "./studioComposerExpandedContentTypes";

export default function StudioPromptTextarea({
  promptTextareaRef,
  referenceHint,
  studioForm,
  onPromptChange,
  onPromptSubmitShortcut,
  polishingPrompt = false,
  polishError = "",
}: StudioPromptTextareaProps) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      onPromptSubmitShortcut();
      return;
    }

    // Plain Enter inserts a newline in the textarea; stop the form from treating it as submit.
    event.stopPropagation();
  }

  return (
    <label className="composer-textarea">
      <textarea
        ref={promptTextareaRef}
        rows={4}
        value={studioForm.prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={composerPromptPlaceholder(studioForm.creationMode)}
        disabled={polishingPrompt}
      />
      <span className={`composer-textarea-hint${polishError ? " is-error" : ""}`}>
        {polishError || referenceHint}
      </span>
    </label>
  );
}
