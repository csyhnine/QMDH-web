import type { ChangeEvent, DragEvent, FormEvent, RefObject } from "react";

import type { PromptTemplateRecord, Provider } from "../../api";
import type {
  ComposerMenuKey,
  ReferenceUploadItem,
  StudioFormState,
  SubmissionTracker,
  TemplateFeedback,
} from "./studioTypes";

export type ResolutionOption = {
  id: string;
  label: string;
  disabled?: boolean;
  hint?: string;
};

export type ProviderGroup = {
  label: string;
  providers: Provider[];
};

export type StudioComposerDockProps = {
  activeComposerMenu: ComposerMenuKey;
  activeTemplateId: number | null;
  aspectRatioOptions: readonly string[];
  availableProviderCount: number;
  composerCollapsed: boolean;
  hasActiveProject: boolean;
  composerToolbarRef: RefObject<HTMLDivElement | null>;
  customTemplates: PromptTemplateRecord[];
  editingTemplateId: number | null;
  sharedTemplates: PromptTemplateRecord[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  onApplyTemplate: (template: PromptTemplateRecord) => void;
  onAspectRatioSelect: (ratio: string) => void;
  onCancelTemplateEdit: () => void;
  onComposerExpand: () => void;
  onComposerFocusChange: (focused: boolean) => void;
  onDeleteCustomTemplate: (templateId: number) => void;
  onEditCustomTemplate: (template: PromptTemplateRecord) => void;
  onImageCountSelect: (count: number) => void;
  onModeChange: (mode: StudioFormState["creationMode"]) => void;
  onOpenReferencePicker: () => void;
  onPromptChange: (value: string) => void;
  onProviderSelect: (providerName: string) => void;
  onGrokVideoSkuSelect: (sku: import("./grokVideoUtils").GrokVideoSku) => void;
  onRemoveReferenceUpload: (index: number) => void;
  onReferenceDrop: (event: DragEvent<HTMLElement>) => void;
  onReferenceInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onResolutionSelect: (resolutionId: string) => void;
  onSaveCustomTemplate: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTemplateDraftLabelChange: (value: string) => void;
  onTemplateDraftTitleChange: (value: string) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
  providerGroups: ProviderGroup[];
  referenceUploads: ReferenceUploadItem[];
  resolutionOptions: ResolutionOption[];
  selectedProvider?: Provider;
  selectedGrokSkuLabel: string | null;
  selectedProviderModelName: string | null;
  selectedResolutionLabel: string | null;
  studioForm: StudioFormState;
  submitting: boolean;
  submissionProgress: SubmissionTracker | null;
  templateFeedback: TemplateFeedback | null;
  templateDraftLabel: string;
  templateDraftTitle: string;
  uploadingReference: boolean;
  workspaceName: string;
};
