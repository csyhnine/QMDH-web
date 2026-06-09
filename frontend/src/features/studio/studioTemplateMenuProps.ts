import type {
  StudioTemplateMenuPanelProps,
  StudioTemplateMenuProps,
  StudioTemplateMenuTriggerProps,
} from "./studioTemplateMenuTypes";

type StudioTemplateMenuParts = {
  panelProps: StudioTemplateMenuPanelProps;
  triggerProps: StudioTemplateMenuTriggerProps;
};

export function getStudioTemplateMenuProps({
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
}: StudioTemplateMenuProps): StudioTemplateMenuParts {
  return {
    triggerProps: {
      activeComposerMenu,
      activeTemplateId,
      customTemplates,
      sharedTemplates,
      onToggleComposerMenu,
    },
    panelProps: {
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
    },
  };
}
