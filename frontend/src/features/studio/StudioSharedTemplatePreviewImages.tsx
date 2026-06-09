import type { HoveredSharedTemplate } from "./studioSharedTemplatePreviewTypes";
import {
  previewFrameRatio,
  previewOrientationClass,
} from "./studioTemplateUtils";
import type { SharedTemplateBrowserState } from "./useSharedTemplateBrowser";

type StudioSharedTemplatePreviewImagesProps = {
  browser: SharedTemplateBrowserState;
  hoveredTemplate: HoveredSharedTemplate;
};

export default function StudioSharedTemplatePreviewImages({
  browser,
  hoveredTemplate,
}: StudioSharedTemplatePreviewImagesProps) {
  return (
    <div className={previewCompareClass(browser)}>
      {browser.hoveredTemplateImages.map((image) => {
        const measuredRatio = browser.hoveredTemplateAspectRatios[image.key];
        return (
          <figure
            key={image.key}
            className={`template-hover-preview-figure ${previewOrientationClass(measuredRatio)}`}
          >
            <div
              className="template-hover-preview-media"
              style={{ aspectRatio: previewFrameRatio(measuredRatio, browser.hoveredTemplatePreviewLayout) }}
            >
              <span className="template-hover-preview-badge">{image.label}</span>
              <img
                className="template-hover-preview-image"
                src={image.src}
                alt={`${hoveredTemplate.label} ${image.label}`}
              />
            </div>
          </figure>
        );
      })}
    </div>
  );
}

function previewCompareClass(browser: SharedTemplateBrowserState): string {
  if (browser.hoveredTemplateImages.length === 1) {
    return "template-hover-preview-compare template-hover-preview-compare-single";
  }
  if (browser.hoveredTemplatePreviewLayout === "stacked") {
    return "template-hover-preview-compare template-hover-preview-compare-stacked";
  }
  return "template-hover-preview-compare";
}
