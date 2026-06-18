import type {
  Asset,
  Project,
  PromptTemplateRecord,
  Provider,
  Task,
  Workflow,
} from "../../api";

export type LoadState = {
  health: string;
  projects: Project[];
  providers: Provider[];
  workflows: Workflow[];
  tasks: Task[];
  assets: Asset[];
  error: string;
  ready: boolean;
};

export type CreationMode = "generate" | "edit" | "video";

export type StudioFormState = {
  creationMode: CreationMode;
  title: string;
  prompt: string;
  projectCode: string;
  requestedProvider: string;
  classification: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  imageCount: number;
  deliverable: string;
  referenceImages: string[];
  notes: string;
  grokVideoSku: string;
};

export type ReferenceUploadItem = {
  fileName: string;
  previewUrl: string;
  storagePath: string;
};

export type PromptTemplateFormValue = {
  label: string;
  title: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  resolution: string;
  deliverable: string;
  notes: string;
};

export type CustomPromptTemplate = PromptTemplateRecord;
export type SharedPromptTemplate = PromptTemplateRecord;

export type ComposerMenuKey = "template" | "provider" | "grokSku" | "display" | "count" | null;
export type SubmissionStage = "uploading_reference" | "submitting" | "pending" | "running" | "completed" | "failed";

export type SubmissionTracker = {
  taskId: number | null;
  taskTitle: string;
  providerName: string;
  imageCount: number;
  hasReferenceImage: boolean;
  stage: SubmissionStage;
};

export type TemplateFeedback = {
  type: "success" | "error";
  message: string;
};

export type HistoryActionKey = "reuse" | "bookmark" | "share" | "delete" | "upscale";

export type HistoryActionFeedback = {
  action: HistoryActionKey;
  tone: "success" | "error" | "info";
  message: string;
  stamp: number;
};

export type ShareConfirmState = {
  taskId: number;
  assetId: number;
  title: string;
  mediaType: "image" | "video";
  sourceImagePath: string;
  finalMediaPath: string;
};

export type GalleryPreviewState = {
  task: Task;
  asset: Asset;
};
