import { useRef, useState } from "react";

import { defaultStudioForm, initialState } from "./studioConstants";
import type { FeedFilterState } from "./studioHistoryPaneTypes";
import type {
  ComposerMenuKey,
  GalleryPreviewState,
  LoadState,
  StudioFormState,
  SubmissionTracker,
} from "./studioTypes";

export function useStudioControllerState() {
  const [state, setState] = useState<LoadState>(initialState);
  const [studioForm, setStudioForm] = useState<StudioFormState>(defaultStudioForm);
  const [filters, setFilters] = useState<FeedFilterState>({
    sort: "oldest",
    status: "all",
    provider: "all",
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeComposerMenu, setActiveComposerMenu] = useState<ComposerMenuKey>(null);
  const [submissionTracker, setSubmissionTracker] = useState<SubmissionTracker | null>(null);
  const [galleryPreview, setGalleryPreview] = useState<GalleryPreviewState | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const submissionInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const clearLoadError = () => {
    setState((current) => ({ ...current, error: "" }));
  };

  const pushLoadError = (message: string) => {
    setState((current) => ({ ...current, error: message }));
  };

  const resetLoadState = () => setState(initialState);

  return {
    activeComposerMenu,
    clearLoadError,
    composerFocused,
    fileInputRef,
    filters,
    galleryPreview,
    pushLoadError,
    resetLoadState,
    setActiveComposerMenu,
    setComposerFocused,
    setFilters,
    setGalleryPreview,
    setState,
    setStudioForm,
    setSubmissionTracker,
    setSubmitting,
    state,
    studioForm,
    submissionInFlightRef,
    submissionTracker,
    submitting,
  };
}
