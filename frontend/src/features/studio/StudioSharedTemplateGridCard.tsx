import type { StudioSharedTemplateGridCardProps } from "./studioSharedTemplateGridTypes";

export default function StudioSharedTemplateGridCard({
  active,
  browser,
  template,
}: StudioSharedTemplateGridCardProps) {
  function scheduleHideIfCurrent() {
    if (browser.hoveredTemplateId === template.id) {
      browser.scheduleHoverPreviewHide();
    }
  }

  return (
    <button
      type="button"
      className={active ? "template-card is-active" : "template-card"}
      onClick={() => browser.applySharedTemplate(template)}
      onMouseEnter={() => browser.hoverSharedTemplate(template.id)}
      onMouseLeave={scheduleHideIfCurrent}
      onFocus={() => browser.hoverSharedTemplate(template.id)}
      onBlur={scheduleHideIfCurrent}
    >
      <strong>{template.label}</strong>
      <span>{template.title}</span>
    </button>
  );
}
