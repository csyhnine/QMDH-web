import { type Dispatch, type SetStateAction, useEffect } from "react";

import type { GalleryPreviewState } from "./studioTypes";

type UseStudioGalleryPreviewEffectsOptions = {
  galleryPreview: GalleryPreviewState | null;
  setGalleryPreview: Dispatch<SetStateAction<GalleryPreviewState | null>>;
};

export function useStudioGalleryPreviewEffects({
  galleryPreview,
  setGalleryPreview,
}: UseStudioGalleryPreviewEffectsOptions) {
  useEffect(() => {
    if (!galleryPreview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setGalleryPreview(null);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [galleryPreview, setGalleryPreview]);
}
