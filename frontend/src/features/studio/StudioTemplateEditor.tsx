import StudioTemplateEditorActions from "./StudioTemplateEditorActions";
import StudioTemplateEditorFeedback from "./StudioTemplateEditorFeedback";
import StudioTemplateEditorFields from "./StudioTemplateEditorFields";
import StudioTemplateEditorHeader from "./StudioTemplateEditorHeader";
import type { StudioTemplateEditorProps } from "./studioTemplateEditorTypes";

export default function StudioTemplateEditor({
  editingTemplateId,
  templateDraftLabel,
  templateDraftTitle,
  templateFeedback,
  onCancelTemplateEdit,
  onSaveCustomTemplate,
  onTemplateDraftLabelChange,
  onTemplateDraftTitleChange,
}: StudioTemplateEditorProps) {
  return (
    <div className="template-editor">
      <StudioTemplateEditorHeader editingTemplateId={editingTemplateId} />
      <StudioTemplateEditorFeedback templateFeedback={templateFeedback} />
      <StudioTemplateEditorFields
        templateDraftLabel={templateDraftLabel}
        templateDraftTitle={templateDraftTitle}
        onTemplateDraftLabelChange={onTemplateDraftLabelChange}
        onTemplateDraftTitleChange={onTemplateDraftTitleChange}
      />
      <StudioTemplateEditorActions
        editingTemplateId={editingTemplateId}
        onCancelTemplateEdit={onCancelTemplateEdit}
        onSaveCustomTemplate={onSaveCustomTemplate}
      />
    </div>
  );
}
