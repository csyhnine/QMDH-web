import type {
  StudioComposerBodyProps,
  StudioComposerExpandedContentProps,
  StudioComposerLeadingProps,
  StudioComposerReferenceFileInputProps,
} from "./studioComposerExpandedContentTypes";
import type { StudioComposerToolbarProps } from "./studioComposerToolbarTypes";
import {
  getStudioComposerBodyProps,
  getStudioComposerLeadingProps,
  getStudioComposerReferenceInputProps,
  getStudioComposerToolbarProps,
} from "./studioComposerExpandedContentPropBuilders";

type StudioComposerExpandedContentParts = {
  bodyProps: StudioComposerBodyProps;
  leadingProps: StudioComposerLeadingProps;
  referenceInputProps: StudioComposerReferenceFileInputProps;
  toolbarProps: StudioComposerToolbarProps;
};

export function getStudioComposerExpandedContentProps(
  props: StudioComposerExpandedContentProps
): StudioComposerExpandedContentParts {
  return {
    leadingProps: getStudioComposerLeadingProps(props),
    bodyProps: getStudioComposerBodyProps(props),
    referenceInputProps: getStudioComposerReferenceInputProps(props),
    toolbarProps: getStudioComposerToolbarProps(props),
  };
}
