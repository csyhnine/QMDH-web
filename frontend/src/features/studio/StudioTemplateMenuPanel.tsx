import StudioCustomTemplateSection from "./StudioCustomTemplateSection";
import StudioSharedTemplateSection from "./StudioSharedTemplateSection";
import StudioTemplateEditor from "./StudioTemplateEditor";
import type { StudioTemplateMenuPanelProps } from "./studioTemplateMenuTypes";

export default function StudioTemplateMenuPanel({
  activeTemplateId,
  customTemplates,
  editingTemplateId,
  sharedTemplates,
  templateDraftLabel,
  templateDraftTitle,
  templateFeedback,
  onApplyTemplate,
  onCancelTemplateEdit,
  onDeleteCustomTemplate,
  onEditCustomTemplate,
  onSaveCustomTemplate,
  onTemplateDraftLabelChange,
  onTemplateDraftTitleChange,
}: StudioTemplateMenuPanelProps) {
  return (
    <div className="composer-menu-panel composer-menu-panel-template">
      <StudioSharedTemplateSection
        activeTemplateId={activeTemplateId}
        sharedTemplates={sharedTemplates}
        onApplyTemplate={onApplyTemplate}
      />
      <StudioCustomTemplateSection
        customTemplates={customTemplates}
        onApplyTemplate={onApplyTemplate}
        onDeleteCustomTemplate={onDeleteCustomTemplate}
        onEditCustomTemplate={onEditCustomTemplate}
      />
      <StudioTemplateEditor
        editingTemplateId={editingTemplateId}
        templateDraftLabel={templateDraftLabel}
        templateDraftTitle={templateDraftTitle}
        templateFeedback={templateFeedback}
        onCancelTemplateEdit={onCancelTemplateEdit}
        onSaveCustomTemplate={onSaveCustomTemplate}
        onTemplateDraftLabelChange={onTemplateDraftLabelChange}
        onTemplateDraftTitleChange={onTemplateDraftTitleChange}
      />
    </div>
  );
}
