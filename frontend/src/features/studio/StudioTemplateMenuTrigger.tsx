import type { StudioTemplateMenuTriggerProps } from "./studioTemplateMenuTypes";

export default function StudioTemplateMenuTrigger({
  activeComposerMenu,
  activeTemplateId,
  customTemplates,
  sharedTemplates,
  onToggleComposerMenu,
}: StudioTemplateMenuTriggerProps) {
  const activeTemplateLabel =
    sharedTemplates.find((template) => template.id === activeTemplateId)?.label ??
    customTemplates.find((template) => template.id === activeTemplateId)?.label ??
    "选择模板";

  return (
    <button
      type="button"
      className={activeComposerMenu === "template" ? "composer-menu-trigger is-open" : "composer-menu-trigger"}
      onClick={() => onToggleComposerMenu("template")}
    >
      {activeTemplateLabel}
    </button>
  );
}
