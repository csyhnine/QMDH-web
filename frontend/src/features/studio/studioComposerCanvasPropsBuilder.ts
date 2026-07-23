import { aspectRatioOptions, resolutionOptions } from "./studioConstants";
import {
  GROK_VIDEO_ASPECT_RATIOS,
  getSelectedGrokSkuConfig,
  grokVideoSkuForProviderSelection,
  isGrokHaodeyaProvider,
  type GrokVideoSku,
} from "./grokVideoUtils";
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
    workspaceName,
  } = derivedState;

  const handleImageCountSelect = (count: number) => {
    setStudioForm((current) => ({ ...current, imageCount: count }));
    setActiveComposerMenu(null);
  };

  const handleProviderSelect = (providerName: string) => {
    const provider = availableProviders.find((item) => item.provider_name === providerName);
    setStudioForm((current) => ({
      ...current,
      requestedProvider: providerName,
      grokVideoSku: grokVideoSkuForProviderSelection(provider, current.grokVideoSku),
    }));
    setActiveComposerMenu(null);
  };

  const handleGrokVideoSkuSelect = (sku: GrokVideoSku) => {
    setStudioForm((current) => ({ ...current, grokVideoSku: sku }));
    setActiveComposerMenu(null);
  };

  const isGrokVideo = studioForm.creationMode === "video" && isGrokHaodeyaProvider(selectedProvider);
  const grokSkuConfig = isGrokVideo ? getSelectedGrokSkuConfig(studioForm, selectedProvider) : null;
  const composerAspectRatioOptions = isGrokVideo ? [...GROK_VIDEO_ASPECT_RATIOS] : aspectRatioOptions;

  return {
    activeComposerMenu,
    activeTemplateId: studioTemplates.activeTemplate?.id ?? null,
    aspectRatioOptions: composerAspectRatioOptions,
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
    selectedProvider,
    selectedGrokSkuLabel: grokSkuConfig?.label ?? null,
    selectedProviderModelName: selectedProvider?.display_name ?? selectedProvider?.model_name ?? null,
    selectedResolutionLabel: isGrokVideo ? "720p（固定）" : selectedResolution?.label ?? null,
    sharedTemplates: studioTemplates.sharedTemplates,
    showComposer: activeViewIsStudio,
    studioForm,
    submitting,
    submissionProgress,
    templateDraftLabel: studioTemplates.templateDraftLabel,
    templateDraftTitle: studioTemplates.templateDraftTitle,
    templateFeedback: studioTemplates.templateFeedback,
    uploadingReference: referenceUpload.uploadingReference,
    workspaceName,
    onApplyTemplate: studioTemplates.applyTemplate,
    onAspectRatioSelect: (ratio) => setStudioForm((current) => ({ ...current, aspectRatio: ratio })),
    onCancelTemplateEdit: studioTemplates.cancelTemplateEdit,
    onComposerExpand: () => studioView.setComposerCollapsed(false),
    onComposerFocusChange: setComposerFocused,
    onDeleteCustomTemplate: (templateId) => void studioTemplates.deleteCustomTemplate(templateId),
    onEditCustomTemplate: studioTemplates.editCustomTemplate,
    onGrokVideoSkuSelect: handleGrokVideoSkuSelect,
    onImageCountSelect: handleImageCountSelect,
    onModeChange: (mode) => {
      setStudioForm((current) => {
        const provider = availableProviders.find((item) => item.provider_name === current.requestedProvider);
        const nextGrokSku =
          mode === "video"
            ? grokVideoSkuForProviderSelection(provider, current.grokVideoSku)
            : "";
        return {
          ...current,
          creationMode: mode,
          grokVideoSku: nextGrokSku,
        };
      });
    },
    onOpenReferencePicker: referenceUpload.openReferencePicker,
    onPromptChange: (value) => setStudioForm((current) => ({ ...current, prompt: value })),
    onProviderSelect: handleProviderSelect,
    onReferenceDrop: referenceUpload.handleReferenceDrop,
    onReferenceInputChange: referenceUpload.handleReferenceInputChange,
    onRemoveReferenceUpload: referenceUpload.removeReferenceUpload,
    onReplaceReferenceUpload: referenceUpload.replaceReferenceUploadAt,
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
