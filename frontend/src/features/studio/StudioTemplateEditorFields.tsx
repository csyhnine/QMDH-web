import type { StudioTemplateEditorFieldsProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditorFields({
  templateDraftLabel,
  templateDraftTitle,
  onTemplateDraftLabelChange,
  onTemplateDraftTitleChange,
}: StudioTemplateEditorFieldsProps) {
  return (
    <div className="template-editor-row">
      <label className="composer-menu-field">
        <span>名称</span>
        <input
          value={templateDraftLabel}
          onChange={(event) => onTemplateDraftLabelChange(event.target.value)}
          placeholder="例如：建筑氛围增强方案"
        />
      </label>
      <label className="composer-menu-field">
        <span>标题</span>
        <input
          value={templateDraftTitle}
          onChange={(event) => onTemplateDraftTitleChange(event.target.value)}
          placeholder="例如：建筑效果图氛围增强模板"
        />
      </label>
    </div>
  );
}
