import type { StudioTemplateEditorActionsProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditorActions({
  editingTemplateId,
  onCancelTemplateEdit,
  onSaveCustomTemplate,
}: StudioTemplateEditorActionsProps) {
  return (
    <div className="template-editor-actions">
      <button type="button" className="ghost-button" onClick={onSaveCustomTemplate}>
        {editingTemplateId ? "更新提示词" : "保存当前提示词"}
      </button>
      {editingTemplateId ? (
        <button type="button" className="ghost-button" onClick={onCancelTemplateEdit}>
          取消编辑
        </button>
      ) : null}
    </div>
  );
}
