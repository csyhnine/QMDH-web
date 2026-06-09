import StudioTemplateMenu from "./StudioTemplateMenu";
import type { StudioComposerToolbarMenusProps } from "./studioComposerToolbarTypes";

export default function StudioComposerTemplateMenuSlot({
  activeComposerMenu,
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
  onToggleComposerMenu,
}: StudioComposerToolbarMenusProps) {
  return (
    <StudioTemplateMenu
      activeComposerMenu={activeComposerMenu}
      activeTemplateId={activeTemplateId}
      customTemplates={customTemplates}
      editingTemplateId={editingTemplateId}
      sharedTemplates={sharedTemplates}
      templateDraftLabel={templateDraftLabel}
      templateDraftTitle={templateDraftTitle}
      templateFeedback={templateFeedback}
      onApplyTemplate={onApplyTemplate}
      onCancelTemplateEdit={onCancelTemplateEdit}
      onDeleteCustomTemplate={onDeleteCustomTemplate}
      onEditCustomTemplate={onEditCustomTemplate}
      onSaveCustomTemplate={onSaveCustomTemplate}
      onTemplateDraftLabelChange={onTemplateDraftLabelChange}
      onTemplateDraftTitleChange={onTemplateDraftTitleChange}
      onToggleComposerMenu={onToggleComposerMenu}
    />
  );
}
