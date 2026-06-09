import type { Dispatch, SetStateAction } from "react";

import type { GalleryPreviewState, LoadState } from "./studioTypes";
import type { useStudioHistoryFeedback } from "./useStudioHistoryFeedback";

type HistoryFeedbackApi = ReturnType<typeof useStudioHistoryFeedback>;

export type UseStudioGalleryActionsOptions = {
  historyFeedback: HistoryFeedbackApi;
  setGalleryPreview: Dispatch<SetStateAction<GalleryPreviewState | null>>;
  setState: Dispatch<SetStateAction<LoadState>>;
};
