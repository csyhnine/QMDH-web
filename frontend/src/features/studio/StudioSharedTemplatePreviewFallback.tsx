import type { HoveredSharedTemplate } from "./studioSharedTemplatePreviewTypes";
import { previewStyleClass } from "./studioTemplateUtils";

const NO_PREVIEW_SUFFIX = "\u6682\u65e0\u9884\u89c8\u56fe";

type StudioSharedTemplatePreviewFallbackProps = {
  hoveredTemplate: HoveredSharedTemplate;
};

export default function StudioSharedTemplatePreviewFallback({
  hoveredTemplate,
}: StudioSharedTemplatePreviewFallbackProps) {
  return (
    <div
      className={`template-hover-preview-fallback ${previewStyleClass(hoveredTemplate.style)}`}
      aria-label={`${hoveredTemplate.label} ${NO_PREVIEW_SUFFIX}`}
    />
  );
}
