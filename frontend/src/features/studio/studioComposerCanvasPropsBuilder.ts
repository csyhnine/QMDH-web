import {
  clampResolutionToOptions,
  resolutionOptions,
  isSourceAspectRatio,
  resolveProviderResolutionOptions,
  studioResolutionLabel,
  ratioForResolutionChange,
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
import {
  filterSeedance2VideoProviders,
  getSelectedSeedance2SkuConfig,
  isSeedance2Provider,
  seedance2VideoSkuForProviderSelection,
} from "./seedanceVideoUtils";
import { isRuntimeStudioProvider } from "./modelAdminUtils";
import { pickPreferredStudioProvider } from "./studioProviderDefaults";
import { applyTemplateBindingGuard } from "./studioTemplateBindingUtils";
import type { StudioVideoSku } from "./studioComposerGrokSkuMenuTypes";
import type { StudioComposerCanvasProps } from "./studioComposerCanvasTypes";
import type { StudioDesignerViewProps } from "./studioDesignerViewTypes";
import type { StudioFormState } from "./studioTypes";

function videoSkuForProviderSelection(
  provider: Parameters<typeof isHappyHorseProvider>[0],
  currentSku: string
): string {
  if (isHappyHorseProvider(provider)) {
    return happyHorseVideoSkuForProviderSelection(provider, currentSku);
  }
  if (isSeedance2Provider(provider)) {
    return seedance2VideoSkuForProviderSelection(provider, currentSku);
  }
  return grokVideoSkuForProviderSelection(provider, currentSku);
}

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

  const promptTemplates = [...studioTemplates.sharedTemplates, ...studioTemplates.customTemplates];
  const patchStudioForm = (patch: Partial<StudioFormState>) => {
    setStudioForm((current) => applyTemplateBindingGuard(current, patch, promptTemplates));
  };

  const handleImageCountSelect = (count: number) => {
    patchStudioForm({ imageCount: count });
    setActiveComposerMenu(null);
  };

  const handleProviderSelect = (providerName: string) => {
    const provider = availableProviders.find((item) => item.provider_name === providerName);
    setStudioForm((current) => {
      const nextOptions = resolveProviderResolutionOptions(provider, {
        creationMode: current.creationMode,
      });
      return applyTemplateBindingGuard(
        current,
        {
          requestedProvider: providerName,
          aspectRatio: provider?.adapter_kind !== "comfyui" && /^\d+x\d+$/.test(current.aspectRatio) ? "16:9" : current.aspectRatio,
          resolution: clampResolutionToOptions(current.resolution, nextOptions),
          grokVideoSku: videoSkuForProviderSelection(provider, current.grokVideoSku),
        },
        promptTemplates
      );
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
  const isSeedance2Video =
    studioForm.creationMode === "video" && isSeedance2Provider(selectedProvider);
  const grokSkuConfig = isGrokVideo ? getSelectedGrokSkuConfig(studioForm, selectedProvider) : null;
  const happyHorseSkuConfig = isHappyHorseVideo
    ? getSelectedHappyHorseSkuConfig(studioForm, selectedProvider)
    : null;
  const seedance2SkuConfig = isSeedance2Video
    ? getSelectedSeedance2SkuConfig(studioForm, selectedProvider)
    : null;
  const isSkuMenuVideo = isGrokVideo || isHappyHorseVideo || isSeedance2Video;
  const composerAspectRatioOptions = aspectRatioOptionsFor(studioForm.creationMode, {
    grokVideo: isSkuMenuVideo,
  });
  const composerResolutionOptions = resolveProviderResolutionOptions(selectedProvider, {
    creationMode: studioForm.creationMode,
  });

  return {
    activeComposerMenu,
    activeTemplateId: studioForm.activeTemplateId,
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
    maxReferenceCount: referenceUpload.maxReferenceCount,
    enableSeedanceAvatar: referenceUpload.enableSeedancePrivateAvatar,
    resolutionOptions: composerResolutionOptions.length > 0 ? composerResolutionOptions : resolutionOptions,
    selectedProvider,
    selectedGrokSkuLabel:
      grokSkuConfig?.label ?? happyHorseSkuConfig?.label ?? seedance2SkuConfig?.label ?? null,
    selectedProviderModelName: selectedProvider?.display_name ?? selectedProvider?.model_name ?? null,
    selectedResolutionLabel: isSeedance2Video
      ? `${seedance2SkuConfig?.resolution ?? "720p"}（由档位决定）`
      : isGrokVideo || isHappyHorseVideo
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
    onAspectRatioSelect: (ratio) => patchStudioForm({ aspectRatio: ratio }),
    onCancelTemplateEdit: studioTemplates.cancelTemplateEdit,
    onComposerExpand: () => studioView.setComposerCollapsed(false),
    onComposerFocusChange: setComposerFocused,
    onDeleteCustomTemplate: (templateId) => void studioTemplates.deleteCustomTemplate(templateId),
    onEditCustomTemplate: studioTemplates.editCustomTemplate,
    onGrokVideoSkuSelect: handleGrokVideoSkuSelect,
    onImageCountSelect: handleImageCountSelect,
    onModeChange: (mode) => {
      setStudioForm((current) => {
        const providersForMode = filterSeedance2VideoProviders(
          filterHappyHorseVideoProviders(
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
          mode === "video" ? videoSkuForProviderSelection(provider, current.grokVideoSku) : "";
        const nextIsSkuMenuVideo =
          mode === "video" &&
          (isGrokHaodeyaProvider(provider) ||
            isHappyHorseProvider(provider) ||
            isSeedance2Provider(provider));
        let nextAspectRatio = current.aspectRatio;
        if (mode === "edit") {
          nextAspectRatio = defaultAspectRatioFor("edit");
        } else if (current.creationMode === "edit" && isSourceAspectRatio(current.aspectRatio)) {
          nextAspectRatio = defaultAspectRatioFor(mode);
        } else {
          nextAspectRatio = resolveAspectRatioForSurface(mode, current.aspectRatio);
          const allowed = aspectRatioOptionsFor(mode, { grokVideo: Boolean(nextIsSkuMenuVideo) });
          if (!allowed.includes(nextAspectRatio)) {
            nextAspectRatio = defaultAspectRatioFor(mode);
          }
        }
        const nextResolutionOptions = resolveProviderResolutionOptions(provider, {
          creationMode: mode,
        });
        return applyTemplateBindingGuard(
          current,
          {
            creationMode: mode,
            requestedProvider: resolvedProviderName,
            aspectRatio: nextAspectRatio,
            resolution: clampResolutionToOptions(current.resolution, nextResolutionOptions),
            grokVideoSku: nextGrokSku,
          },
          promptTemplates
        );
      });
    },
    onOpenReferencePicker: referenceUpload.openReferencePicker,
    onPromptChange: (value) => patchStudioForm({ prompt: value, promptPolished: false }),
    onPromptPolished: () => setStudioForm((current) => ({ ...current, promptPolished: true })),
    onProviderSelect: handleProviderSelect,
    onReferenceDrop: referenceUpload.handleReferenceDrop,
    onReferenceInputChange: referenceUpload.handleReferenceInputChange,
    onRemoveReferenceUpload: referenceUpload.removeReferenceUpload,
    onReplaceReferenceUpload: referenceUpload.replaceReferenceUploadAt,
    onRegisterSeedancePrivateAvatar: referenceUpload.registerSeedancePrivateAvatar,
    onStartSeedanceRealAvatar: referenceUpload.startSeedanceRealAvatar,
    onCompleteSeedanceRealAvatar: referenceUpload.completeSeedanceRealAvatar,
    onResolutionSelect: (resolutionId) => patchStudioForm({ resolution: resolutionId,
      aspectRatio: ratioForResolutionChange(selectedProvider, studioForm.aspectRatio) }),
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
