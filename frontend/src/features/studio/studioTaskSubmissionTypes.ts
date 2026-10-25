import type { Dispatch, SetStateAction } from "react";

import type { Provider } from "../../api";
import type { ComposerMenuKey, LoadState, ReferenceUploadItem, StudioFormState, SubmissionTracker } from "./studioTypes";
import type { useStudioTemplates } from "./useStudioTemplates";

type MutableRef<T> = {
  current: T;
};

type StudioTemplatesApi = ReturnType<typeof useStudioTemplates>;

export type StudioTaskSubmissionInput = {
  form: StudioFormState;
  referenceUploads: ReferenceUploadItem[];
  uploadingReference: boolean;
  updateComposer: boolean;
};

export type UseStudioTaskSubmissionOptions = {
  hasAutoPositionedRef: MutableRef<boolean>;
  loadData: (options?: { force?: boolean; dashboardDays?: number }) => Promise<void>;
  providers: Provider[];
  setActiveComposerMenu: Dispatch<SetStateAction<ComposerMenuKey>>;
  setState: Dispatch<SetStateAction<LoadState>>;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  setSubmissionTracker: Dispatch<SetStateAction<SubmissionTracker | null>>;
  setSubmitting: Dispatch<SetStateAction<boolean>>;
  studioTemplates: StudioTemplatesApi;
  submissionInFlightRef: MutableRef<boolean>;
};
