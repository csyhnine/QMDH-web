import type { DragEvent, RefObject } from "react";

import type { StudioComposerDockProps } from "./studioComposerDockTypes";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";

export type StudioComposerExpandedContentProps = StudioComposerDockProps & {
  modeLabel: string;
  promptTextareaRef: RefObject<HTMLTextAreaElement | null>;
  referenceHint: string;
  onPromptSubmitShortcut: () => void;
};

export type StudioComposerCollapsedBarProps = Pick<
  StudioComposerExpandedContentProps,
  | "modeLabel"
  | "referenceUploads"
  | "selectedProviderModelName"
  | "selectedResolutionLabel"
  | "studioForm"
  | "workspaceName"
> & {
  compactPromptPreview: string;
  onExpand: () => void;
};

export type StudioComposerLeadingProps = Pick<
  StudioComposerExpandedContentProps,
  | "modeLabel"
  | "selectedProviderModelName"
  | "selectedResolutionLabel"
  | "studioForm"
  | "workspaceName"
>;

export type StudioComposerBodyProps = Pick<
  StudioComposerExpandedContentProps,
  | "promptTextareaRef"
  | "referenceHint"
  | "referenceUploads"
  | "studioForm"
  | "onModeChange"
  | "onOpenReferencePicker"
  | "onPromptChange"
  | "onPromptSubmitShortcut"
  | "onReferenceDrop"
  | "onRemoveReferenceUpload"
>;

export type StudioComposerModeSwitchProps = {
  creationMode: StudioFormState["creationMode"];
  onModeChange: (mode: StudioFormState["creationMode"]) => void;
};

export type StudioReferenceDropzoneProps = {
  referenceUploads: ReferenceUploadItem[];
  onOpenReferencePicker: () => void;
  onReferenceDrop: (event: DragEvent<HTMLElement>) => void;
  onRemoveReferenceUpload: (index: number) => void;
};

export type StudioPromptTextareaProps = Pick<
  StudioComposerBodyProps,
  "promptTextareaRef" | "referenceHint" | "studioForm" | "onPromptChange" | "onPromptSubmitShortcut"
>;

export type StudioComposerReferenceFileInputProps = Pick<
  StudioComposerExpandedContentProps,
  "fileInputRef" | "onReferenceInputChange"
>;
