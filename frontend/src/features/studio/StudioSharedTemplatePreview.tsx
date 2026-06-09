import StudioSharedTemplatePreviewContent from "./StudioSharedTemplatePreviewContent";
import StudioSharedTemplatePreviewPlaceholder from "./StudioSharedTemplatePreviewPlaceholder";
import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

type StudioSharedTemplatePreviewProps = {
  browser: SharedTemplateBrowserState;
};

export default function StudioSharedTemplatePreview({ browser }: StudioSharedTemplatePreviewProps) {
  const hoveredTemplate = browser.hoveredTemplate;

  return (
    <aside
      className={`template-hover-preview template-hover-preview-${browser.hoveredTemplatePreviewLayout}${browser.hoveredTemplate ? " is-visible" : ""}`}
      aria-live="polite"
      onMouseEnter={browser.cancelHoverPreviewHide}
      onMouseLeave={browser.scheduleHoverPreviewHide}
    >
      {hoveredTemplate ? (
        <StudioSharedTemplatePreviewContent browser={browser} hoveredTemplate={hoveredTemplate} />
      ) : (
        <StudioSharedTemplatePreviewPlaceholder />
      )}
    </aside>
  );
}
