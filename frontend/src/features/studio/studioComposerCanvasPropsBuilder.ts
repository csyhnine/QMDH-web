import { aspectRatioOptions, resolutionOptions } from "./studioConstants";
import type { StudioComposerCanvasProps } from "./studioComposerCanvasTypes";
import type { StudioDesignerViewProps } from "./studioDesignerViewTypes";

export function buildStudioComposerCanvasProps({
  activeComposerMenu,
  activeViewIsStudio,
  derivedState,
  fileInputRef,
  referenceUpload,
  setActiveComposerMenu,
  setComposerFocused,
  setStudioForm,
  state,
  studioForm,
  studioTemplates,
  studioView,
  submitting,
  submissionProgress,
  taskActions,
}: StudioDesignerViewProps): StudioComposerCanvasProps {
  const {
    activeProject,
    availableProviders,
    providerGroups,
    selectedProvider,
    selectedResolution,
    selectedStyle,
    selectedWorkflow,
    workspaceName,
  } = derivedState;

  const handleImageCountSelect = (count: number) => {
    setStudioForm((current) => ({ ...current, imageCount: count }));
    setActiveComposerMenu(null);
  };

  const handleProviderSelect = (providerName: string) => {
    setStudioForm((current) => ({ ...current, requestedProvider: providerName }));
    setActiveComposerMenu(null);
  };

  return {
    activeComposerMenu,
    activeTemplateId: studioTemplates.activeTemplate?.id ?? null,
    aspectRatioOptions,
    availableProviderCount: availableProviders.length,
    composerCollapsed: studioView.composerCollapsed,
    composerToolbarRef: studioView.composerToolbarRef,
    customTemplates: studioTemplates.customTemplates,
    editingTemplateId: studioTemplates.editingTemplateId,
    fileInputRef,
    hasActiveProject: Boolean(activeProject),
    providerGroups,
    referenceUploads: referenceUpload.referenceUploads,
    resolutionOptions,
    selectedProviderModelName: selectedProvider?.display_name ?? selectedProvider?.model_name ?? null,
    selectedResolutionLabel: selectedResolution?.label ?? null,
    selectedStyleLabel: selectedStyle?.label ?? studioForm.style,
    serviceHealthy: state.health === "healthy",
    sharedTemplates: studioTemplates.sharedTemplates,
    showComposer: activeViewIsStudio,
    studioForm,
    submitting,
    submissionProgress,
    templateDraftLabel: studioTemplates.templateDraftLabel,
    templateDraftTitle: studioTemplates.templateDraftTitle,
    templateFeedback: studioTemplates.templateFeedback,
    uploadingReference: referenceUpload.uploadingReference,
    workflowName: selectedWorkflow?.name ?? "閸ユ儳鍎氶悽鐔稿灇",
    workspaceName,
    onApplyTemplate: studioTemplates.applyTemplate,
    onAspectRatioSelect: (ratio) => setStudioForm((current) => ({ ...current, aspectRatio: ratio })),
    onCancelTemplateEdit: studioTemplates.cancelTemplateEdit,
    onComposerExpand: () => studioView.setComposerCollapsed(false),
    onComposerFocusChange: setComposerFocused,
    onDeleteCustomTemplate: (templateId) => void studioTemplates.deleteCustomTemplate(templateId),
    onEditCustomTemplate: studioTemplates.editCustomTemplate,
    onImageCountSelect: handleImageCountSelect,
    onModeChange: (mode) => {
      setStudioForm((current) => ({ ...current, creationMode: mode }));
    },
    onOpenReferencePicker: referenceUpload.openReferencePicker,
    onPromptChange: (value) => setStudioForm((current) => ({ ...current, prompt: value })),
    onProviderSelect: handleProviderSelect,
    onReferenceDrop: referenceUpload.handleReferenceDrop,
    onReferenceInputChange: referenceUpload.handleReferenceInputChange,
    onRemoveReferenceUpload: referenceUpload.removeReferenceUpload,
    onResolutionSelect: (resolutionId) =>
      setStudioForm((current) => ({ ...current, resolution: resolutionId })),
    onSaveCustomTemplate: () => void studioTemplates.saveCustomTemplate(),
    onSubmit: taskActions.handleSubmit,
    onTemplateDraftLabelChange: studioTemplates.setTemplateDraftLabel,
    onTemplateDraftTitleChange: studioTemplates.setTemplateDraftTitle,
    onToggleComposerMenu: (menu) => {
      setActiveComposerMenu((current) => (current === menu ? null : menu));
      if (menu === "template") {
        studioTemplates.syncTemplateDraftWithCurrentForm();
      }
    },
  };
}
