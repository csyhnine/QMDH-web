import type { Dispatch, SetStateAction } from "react";

import type { Provider } from "../../api";
import type { ComposerMenuKey, LoadState, StudioFormState, SubmissionTracker } from "./studioTypes";
import type { useStudioHistoryFeedback } from "./useStudioHistoryFeedback";
import type { useStudioReferenceUploads } from "./useStudioReferenceUploads";
import type { useStudioTemplates } from "./useStudioTemplates";

type HistoryFeedbackApi = ReturnType<typeof useStudioHistoryFeedback>;
type ReferenceUploadApi = ReturnType<typeof useStudioReferenceUploads>;
type StudioTemplatesApi = ReturnType<typeof useStudioTemplates>;

type MutableRef<T> = {
  current: T;
};

export type UseStudioTaskActionsOptions = {
  composerToolbarRef: MutableRef<HTMLDivElement | null>;
  hasAutoPositionedRef: MutableRef<boolean>;
  historyFeedback: HistoryFeedbackApi;
  loadData: (options?: { force?: boolean; dashboardDays?: number }) => Promise<void>;
  providers: Provider[];
  referenceUpload: ReferenceUploadApi;
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setComposerCollapsed: Dispatch<SetStateAction<boolean>>;
  setState: Dispatch<SetStateAction<LoadState>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  setSubmissionTracker: Dispatch<SetStateAction<SubmissionTracker | null>>;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  studioForm: StudioFormState;
  studioTemplates: StudioTemplatesApi;
  submissionInFlightRef: MutableRef<boolean>;
};
