import StudioCustomTemplateListItem from "./StudioCustomTemplateListItem";
import type { StudioCustomTemplateSectionProps } from "./studioCustomTemplateSectionTypes";

export default function StudioCustomTemplateSection({
  customTemplates,
  onApplyTemplate,
  onDeleteCustomTemplate,
  onEditCustomTemplate,
}: StudioCustomTemplateSectionProps) {
  return (
    <div className="template-section">
      <div className="template-section-head">
        <strong>我的提示词</strong>
        <span>保存、编辑你自己的常用提示词。</span>
      </div>
      {customTemplates.length > 0 ? (
        <div className="template-list">
          {customTemplates.map((template) => (
            <StudioCustomTemplateListItem
              key={template.id}
              template={template}
              onApplyTemplate={onApplyTemplate}
              onDeleteCustomTemplate={onDeleteCustomTemplate}
              onEditCustomTemplate={onEditCustomTemplate}
            />
          ))}
        </div>
      ) : (
        <div className="template-empty">还没有自定义提示词，可以把当前创作内容保存下来。</div>
      )}
    </div>
  );
}
