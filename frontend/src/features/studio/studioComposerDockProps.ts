import type { RefObject } from "react";

import type {
  StudioComposerCollapsedBarProps,
  StudioComposerExpandedContentProps,
} from "./studioComposerExpandedContentTypes";
import type { StudioComposerDockProps } from "./studioComposerDockTypes";
import {
  composerModeLabel,
  composerPromptPreview,
  composerReferenceHint,
} from "./studioComposerDockUtils";

type StudioComposerDockParts = {
  collapsedBarProps: StudioComposerCollapsedBarProps;
  expandedContentProps: StudioComposerExpandedContentProps;
};

export function getStudioComposerDockProps(
  props: StudioComposerDockProps,
  promptTextareaRef: RefObject<HTMLTextAreaElement | null>,
  onExpand: () => void
): StudioComposerDockParts {
  const modeLabel = composerModeLabel(props.studioForm.creationMode);
  const compactPromptPreview = composerPromptPreview(props.studioForm.prompt);
  const referenceHint = composerReferenceHint(
    props.studioForm.creationMode,
    props.referenceUploads.length,
    props.selectedProvider,
    props.studioForm
  );

  return {
    collapsedBarProps: {
      compactPromptPreview,
      modeLabel,
      referenceUploads: props.referenceUploads,
      selectedProviderModelName: props.selectedProviderModelName,
      selectedResolutionLabel: props.selectedResolutionLabel,
      studioForm: props.studioForm,
      workspaceName: props.workspaceName,
      onExpand,
    },
    expandedContentProps: {
      ...props,
      modeLabel,
      promptTextareaRef,
      referenceHint,
    },
  };
}
