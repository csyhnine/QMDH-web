import type { StudioComposerCollapsedBarProps } from "./studioComposerExpandedContentTypes";

export default function StudioComposerCollapsedBar({
  compactPromptPreview,
  modeLabel,
  referenceUploads,
  selectedProviderModelName,
  selectedResolutionLabel,
  studioForm,
  workspaceName,
  onExpand,
}: StudioComposerCollapsedBarProps) {
  return (
    <div className="composer-collapsed-bar" onMouseEnter={onExpand}>
      <button
        type="button"
        className="composer-collapsed-main"
        onClick={onExpand}
      >
        <div className="composer-collapsed-media" aria-hidden="true">
          {referenceUploads.length > 0 ? (
            <div className="composer-collapsed-thumbs">
              {referenceUploads.slice(0, 3).map((item) => (
                <img key={item.storagePath} src={item.previewUrl} alt="" />
              ))}
            </div>
          ) : (
            <span className="composer-collapsed-plus">+</span>
          )}
        </div>
        <div className="composer-collapsed-copy">
          <strong>{workspaceName}</strong>
          <p>{compactPromptPreview}</p>
          <div className="composer-collapsed-meta">
            <span>{modeLabel}</span>
            <span>{selectedProviderModelName ?? studioForm.requestedProvider}</span>
            <span>
              {studioForm.aspectRatio} / {selectedResolutionLabel ?? studioForm.resolution}
            </span>
            <span>{studioForm.imageCount} 张</span>
          </div>
        </div>
      </button>
      <button type="button" className="ghost-button composer-collapsed-expand" onClick={onExpand}>
        展开创作区
      </button>
    </div>
  );
}
