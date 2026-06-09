import type { ChangeEvent, DragEvent, FormEvent, RefObject } from "react";

import type { PromptTemplateRecord, Provider } from "../../api";
import type {
  ComposerMenuKey,
  ReferenceUploadItem,
  StudioFormState,
  SubmissionTracker,
  TemplateFeedback,
} from "./studioTypes";

type ProviderGroup = {
  label: string;
  providers: Provider[];
};

type ResolutionOption = {
  id: string;
  label: string;
};

export type StudioComposerCanvasProps = {
  activeComposerMenu: ComposerMenuKey;
  activeTemplateId: number | null;
  aspectRatioOptions: readonly string[];
  availableProviderCount: number;
  composerCollapsed: boolean;
  composerToolbarRef: RefObject<HTMLDivElement | null>;
  customTemplates: PromptTemplateRecord[];
  editingTemplateId: number | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  hasActiveProject: boolean;
  providerGroups: ProviderGroup[];
  referenceUploads: ReferenceUploadItem[];
  resolutionOptions: ResolutionOption[];
  selectedProviderModelName: string | null;
  selectedResolutionLabel: string | null;
  selectedStyleLabel: string;
  serviceHealthy: boolean;
  sharedTemplates: PromptTemplateRecord[];
  showComposer: boolean;
  studioForm: StudioFormState;
  submitting: boolean;
  submissionProgress: SubmissionTracker | null;
  templateDraftLabel: string;
  templateDraftTitle: string;
  templateFeedback: TemplateFeedback | null;
  uploadingReference: boolean;
  workflowName: string;
  workspaceName: string;
  onApplyTemplate: (template: PromptTemplateRecord) => void;
  onAspectRatioSelect: (ratio: string) => void;
  onCancelTemplateEdit: () => void;
  onComposerExpand: () => void;
  onComposerFocusChange: (focused: boolean) => void;
  onDeleteCustomTemplate: (templateId: number) => void;
  onEditCustomTemplate: (template: PromptTemplateRecord) => void;
  onImageCountSelect: (count: number) => void;
  onModeChange: (mode: "generate" | "edit") => void;
  onOpenReferencePicker: () => void;
  onPromptChange: (value: string) => void;
  onProviderSelect: (providerName: string) => void;
  onReferenceDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onReferenceInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveReferenceUpload: (index: number) => void;
  onResolutionSelect: (resolutionId: string) => void;
  onSaveCustomTemplate: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTemplateDraftLabelChange: (value: string) => void;
  onTemplateDraftTitleChange: (value: string) => void;
  onToggleComposerMenu: (menu: Exclude<ComposerMenuKey, null>) => void;
};
