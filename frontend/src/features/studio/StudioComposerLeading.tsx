import type { StudioComposerLeadingProps } from "./studioComposerExpandedContentTypes";

export default function StudioComposerLeading({
  modeLabel,
  selectedProviderModelName,
  selectedResolutionLabel,
  studioForm,
  workspaceName,
}: StudioComposerLeadingProps) {
  return (
    <div className="composer-leading">
      <div>
        <span className="composer-label">当前创作</span>
        <strong>{workspaceName}</strong>
      </div>
      <div className="composer-statusline">
        <span>{modeLabel}</span>
        <span>{selectedProviderModelName ?? studioForm.requestedProvider}</span>
        <span>
          {studioForm.aspectRatio} / {selectedResolutionLabel ?? studioForm.resolution}
        </span>
        <span>{studioForm.imageCount} 张</span>
      </div>
    </div>
  );
}
