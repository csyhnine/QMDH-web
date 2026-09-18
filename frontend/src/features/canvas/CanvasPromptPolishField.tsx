import type { TextareaHTMLAttributes } from "react";
import { useEffect } from "react";

import PromptPolishButton from "../../components/shared/PromptPolishButton";
import PromptPolishHistoryPanel from "../../components/shared/PromptPolishHistoryPanel";
import { usePromptPolish } from "../../lib/usePromptPolish";
import { creationModeForNodeKind } from "../studio/studioCanvasLinkage";
import { CanvasDraftTextarea } from "./CanvasDraftField";
import { useCanvasNodeActions } from "./canvasNodeContext";
import type { CanvasNodeKind } from "./canvasTypes";
import { resolveCanvasInputReferenceImages } from "./canvasGraphUtils";

type CanvasPromptPolishFieldProps = {
  nodeKind: CanvasNodeKind;
  prompt: string;
  referenceImages: string[];
  upstreamImages: string[];
  disabled?: boolean;
  busy?: boolean;
  rows?: number;
  placeholder?: string;
  className?: string;
  onPromptChange: (prompt: string) => void;
  onPolished?: () => void;
  onPolishingChange?: (polishing: boolean) => void;
  sourceSurface?: "studio" | "canvas";
} & Pick<TextareaHTMLAttributes<HTMLTextAreaElement>, "rows">;

export default function CanvasPromptPolishField({
  nodeKind,
  prompt,
  referenceImages,
  upstreamImages,
  disabled = false,
  busy = false,
  rows = 4,
  placeholder,
  className = "",
  onPromptChange,
  onPolished,
  onPolishingChange,
  sourceSurface = "canvas",
}: CanvasPromptPolishFieldProps) {
  const { promptPolishEnabled } = useCanvasNodeActions();
  const refs = resolveCanvasInputReferenceImages(referenceImages, upstreamImages);
  const {
    polishing,
    polishPrompt,
    error,
    notice,
    history,
    activeHistoryId,
    applyHistoryEntry,
  } = usePromptPolish({
    prompt,
    creationMode: creationModeForNodeKind(nodeKind),
    referenceImages: refs,
    sourceSurface,
    onPromptChange,
    onPolished,
  });
  const fieldDisabled = disabled || busy || polishing;
  const canPolish = promptPolishEnabled === true && prompt.trim().length > 0 && !busy;
  const feedback = error || notice;

  useEffect(() => {
    onPolishingChange?.(polishing);
  }, [onPolishingChange, polishing]);

  return (
    <label className={`qmdh-canvas-field qmdh-canvas-field-prompt ${className}`.trim()}>
      <span className="qmdh-canvas-field-label-row">
        <span>提示词</span>
        {promptPolishEnabled ? (
          <PromptPolishButton
            className="qmdh-canvas-polish-button"
            polishing={polishing}
            disabled={!canPolish}
            onClick={() => void polishPrompt()}
          />
        ) : null}
      </span>
      <CanvasDraftTextarea
        rows={rows}
        value={prompt}
        disabled={fieldDisabled}
        placeholder={placeholder}
        onCommit={onPromptChange}
      />
      <PromptPolishHistoryPanel
        className="qmdh-canvas-polish-history"
        history={history}
        activeEntryId={activeHistoryId}
        disabled={polishing}
        showWhenEmpty={promptPolishEnabled === true}
        onSelect={applyHistoryEntry}
      />
      {feedback ? (
        <small className={`qmdh-canvas-node-error${notice && !error ? " is-notice" : ""}`}>{feedback}</small>
      ) : null}
    </label>
  );
}
