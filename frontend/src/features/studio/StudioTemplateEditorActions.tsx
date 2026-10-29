import type { StudioTemplateEditorActionsProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditorActions({
  editingTemplateId,
  templateFeedback,
  onCancelTemplateEdit,
  onSaveCustomTemplate,
}: StudioTemplateEditorActionsProps) {
  const saving = templateFeedback?.saveState === "pending";
  const uncertain = templateFeedback?.saveState === "uncertain";
  return (
    <div className="template-editor-actions">
      <button type="button" className="ghost-button" disabled={saving || uncertain} onClick={onSaveCustomTemplate}>
        {saving ? "保存中…" : uncertain ? "待核对，请勿重存" : editingTemplateId ? "更新提示词" : "保存当前提示词"}
      </button>
      {editingTemplateId || saving || uncertain ? (
        <button type="button" className="ghost-button" onClick={onCancelTemplateEdit}>
          {uncertain ? "放弃本次重发" : "取消编辑"}
        </button>
      ) : null}
    </div>
  );
}
