import StudioSharedTemplatePreviewFallback from "./StudioSharedTemplatePreviewFallback";
import StudioSharedTemplatePreviewImages from "./StudioSharedTemplatePreviewImages";
import type { HoveredSharedTemplate } from "./studioSharedTemplatePreviewTypes";
import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

const COMPARE_LABEL = "\u539f\u56fe / \u6700\u7ec8\u56fe\u5bf9\u7167";
const SINGLE_PREVIEW_LABEL = "\u6a21\u677f\u9884\u89c8";

type StudioSharedTemplatePreviewContentProps = {
  browser: SharedTemplateBrowserState;
  hoveredTemplate: HoveredSharedTemplate;
};

export default function StudioSharedTemplatePreviewContent({
  browser,
  hoveredTemplate,
}: StudioSharedTemplatePreviewContentProps) {
  return (
    <>
      <div className="template-hover-preview-head">
        <strong>{hoveredTemplate.label}</strong>
        <span>{browser.hoveredTemplateImages.length > 1 ? COMPARE_LABEL : SINGLE_PREVIEW_LABEL}</span>
      </div>
      {browser.hoveredTemplateImages.length > 0 ? (
        <StudioSharedTemplatePreviewImages browser={browser} hoveredTemplate={hoveredTemplate} />
      ) : (
        <StudioSharedTemplatePreviewFallback hoveredTemplate={hoveredTemplate} />
      )}
    </>
  );
}
