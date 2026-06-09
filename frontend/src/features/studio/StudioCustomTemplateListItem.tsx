import type { StudioCustomTemplateListItemProps } from "./studioCustomTemplateSectionTypes";

export default function StudioCustomTemplateListItem({
  template,
  onApplyTemplate,
  onDeleteCustomTemplate,
  onEditCustomTemplate,
}: StudioCustomTemplateListItemProps) {
  return (
    <div className="template-list-item">
      <button type="button" className="template-card template-card-main" onClick={() => onApplyTemplate(template)}>
        <strong>{template.label}</strong>
        <span>{template.title}</span>
      </button>
      <div className="template-card-actions">
        <button type="button" className="template-action-button" onClick={() => onEditCustomTemplate(template)}>
          编辑
        </button>
        <button type="button" className="template-action-button" onClick={() => onDeleteCustomTemplate(template.id)}>
          删除
        </button>
      </div>
    </div>
  );
}
