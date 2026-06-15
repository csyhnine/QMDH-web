import type { Dispatch, RefObject, SetStateAction } from "react";

import type { ComposerMenuKey, GalleryPreviewState, LoadState, StudioFormState, SubmissionTracker } from "./studioTypes";
import type { FeedFilterState } from "./studioHistoryPaneTypes";
import type { StudioDerivedState } from "./studioDerivedState";
import type { StudioGalleryActions } from "./useStudioGalleryActions";
import type { StudioHistoryFeedback } from "./useStudioHistoryFeedback";
import type { StudioProjectsState } from "./useStudioProjects";
import type { StudioReferenceUploadState } from "./useStudioReferenceUploads";
import type { StudioTaskActionsState } from "./useStudioTaskActions";
import type { StudioTemplatesState } from "./useStudioTemplates";
import type { StudioViewEffectsState } from "./useStudioViewEffects";

export type StudioDesignerViewProps = {
  activeComposerMenu: ComposerMenuKey;
  activeViewIsStudio: boolean;
  canUseOpsViews: boolean;
  canManageUsers: boolean;
  derivedState: StudioDerivedState;
  fileInputRef: RefObject<HTMLInputElement | null>;
  filters: FeedFilterState;
  galleryActions: StudioGalleryActions;
  historyFeedback: StudioHistoryFeedback;
  isStudioDockLayout: boolean;
  referenceUpload: StudioReferenceUploadState;
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setComposerFocused: Dispatch<SetStateAction<boolean>>;
  setFilters: Dispatch<SetStateAction<FeedFilterState>>;
  setGalleryPreview: Dispatch<SetStateAction<GalleryPreviewState | null>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  state: LoadState;
  studioForm: StudioFormState;
  studioProjects: StudioProjectsState;
  studioTemplates: StudioTemplatesState;
  studioView: StudioViewEffectsState;
  submitting: boolean;
  submissionProgress: SubmissionTracker | null;
  taskActions: StudioTaskActionsState;
};
