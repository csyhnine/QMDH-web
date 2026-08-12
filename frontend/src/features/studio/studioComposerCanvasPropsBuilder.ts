import {
  clampResolutionToOptions,
  resolutionOptions,
  isSourceAspectRatio,
  resolveProviderResolutionOptions,
  studioResolutionLabel,
} from "./studioConstants";
import {
  aspectRatioOptionsFor,
  defaultAspectRatioFor,
  resolveAspectRatioForSurface,
} from "./studioCanvasLinkage";
import {
  filterGrokVideoProviders,
  getSelectedGrokSkuConfig,
  grokVideoSkuForProviderSelection,
  isGrokHaodeyaProvider,
} from "./grokVideoUtils";
import {
  filterHappyHorseVideoProviders,
  getSelectedHappyHorseSkuConfig,
  happyHorseVideoSkuForProviderSelection,
  isHappyHorseProvider,
} from "./happyHorseVideoUtils";
import { isRuntimeStudioProvider } from "./modelAdminUtils";
import { pickPreferredStudioProvider } from "./studioProviderDefaults";
import type { StudioVideoSku } from "./studioComposerGrokSkuMenuTypes";
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
    setStudioForm((current) => {
      const nextOptions = resolveProviderResolutionOptions(provider, {
        creationMode: current.creationMode,
      });
      return {
        ...current,
        requestedProvider: providerName,
        resolution: clampResolutionToOptions(current.resolution, nextOptions),
        grokVideoSku: isHappyHorseProvider(provider)
          ? happyHorseVideoSkuForProviderSelection(provider, current.grokVideoSku)
          : grokVideoSkuForProviderSelection(provider, current.grokVideoSku),
      };
    });
    setActiveComposerMenu(null);
  };

  const handleGrokVideoSkuSelect = (sku: StudioVideoSku) => {
    setStudioForm((current) => ({ ...current, grokVideoSku: sku }));
    setActiveComposerMenu(null);
  };

  const isGrokVideo = studioForm.creationMode === "video" && isGrokHaodeyaProvider(selectedProvider);
  const isHappyHorseVideo =
    studioForm.creationMode === "video" && isHappyHorseProvider(selectedProvider);
  const grokSkuConfig = isGrokVideo ? getSelectedGrokSkuConfig(studioForm, selectedProvider) : null;
  const happyHorseSkuConfig = isHappyHorseVideo
    ? getSelectedHappyHorseSkuConfig(studioForm, selectedProvider)
    : null;
  const composerAspectRatioOptions = aspectRatioOptionsFor(studioForm.creationMode, {
    grokVideo: isGrokVideo || isHappyHorseVideo,
  });
  const composerResolutionOptions = resolveProviderResolutionOptions(selectedProvider, {
    creationMode: studioForm.creationMode,
  });

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
    resolutionOptions: composerResolutionOptions.length > 0 ? composerResolutionOptions : resolutionOptions,
    selectedProvider,
    selectedGrokSkuLabel: grokSkuConfig?.label ?? happyHorseSkuConfig?.label ?? null,
    selectedProviderModelName: selectedProvider?.display_name ?? selectedProvider?.model_name ?? null,
    selectedResolutionLabel:
      isGrokVideo || isHappyHorseVideo
        ? "720p（固定）"
        : studioResolutionLabel(studioForm.resolution) || selectedResolution?.label || null,
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
        const providersForMode = filterHappyHorseVideoProviders(
          filterGrokVideoProviders(
            state.providers.filter(
              (provider) =>
                isRuntimeStudioProvider(provider, mode) &&
                provider.capabilities.some((capability) => {
                  if (mode === "video") return capability === "video.generate";
                  if (mode === "edit") return capability === "image.edit";
                  return capability === "image.generate";
                })
            )
          )
        );
        const preferred = pickPreferredStudioProvider(providersForMode, mode);
        const resolvedProviderName =
          mode === "video"
            ? preferred?.provider_name || current.requestedProvider
            : providersForMode.some((item) => item.provider_name === current.requestedProvider)
              ? current.requestedProvider
              : preferred?.provider_name || current.requestedProvider;
        const provider =
          providersForMode.find((item) => item.provider_name === resolvedProviderName) || preferred;
        const nextGrokSku =
          mode === "video"
            ? isHappyHorseProvider(provider)
              ? happyHorseVideoSkuForProviderSelection(provider, current.grokVideoSku)
              : grokVideoSkuForProviderSelection(provider, current.grokVideoSku)
            : "";
        const nextIsFixed720p =
          mode === "video" &&
          (isGrokHaodeyaProvider(provider) || isHappyHorseProvider(provider));
        let nextAspectRatio = current.aspectRatio;
        if (mode === "edit") {
          nextAspectRatio = defaultAspectRatioFor("edit");
        } else if (current.creationMode === "edit" && isSourceAspectRatio(current.aspectRatio)) {
          nextAspectRatio = defaultAspectRatioFor(mode);
        } else {
          nextAspectRatio = resolveAspectRatioForSurface(mode, current.aspectRatio);
          const allowed = aspectRatioOptionsFor(mode, { grokVideo: Boolean(nextIsFixed720p) });
          if (!allowed.includes(nextAspectRatio)) {
            nextAspectRatio = defaultAspectRatioFor(mode);
          }
        }
        const nextResolutionOptions = resolveProviderResolutionOptions(provider, {
          creationMode: mode,
        });
        return {
          ...current,
          creationMode: mode,
          requestedProvider: resolvedProviderName,
          aspectRatio: nextAspectRatio,
          resolution: clampResolutionToOptions(current.resolution, nextResolutionOptions),
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
