import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react";

import {
  buildReferenceUploadsFromPaths,
  referenceUploadStoragePaths,
  releaseReferencePreview,
  releaseReferencePreviews,
  removeReferenceUploadAt,
} from "./studioReferenceUtils";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";

type UseStudioReferenceUploadStateOptions = {
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
};

export function useStudioReferenceUploadState({
  setStudioForm,
}: UseStudioReferenceUploadStateOptions) {
  const [referenceUploads, setReferenceUploads] = useState<ReferenceUploadItem[]>([]);
  const referenceUploadsRef = useRef<ReferenceUploadItem[]>([]);

  function setReferenceUploadItems(nextUploads: ReferenceUploadItem[]) {
    referenceUploadsRef.current = nextUploads;
    setReferenceUploads(nextUploads);
  }

  function syncReferenceUploads(nextUploads: ReferenceUploadItem[]) {
    setReferenceUploadItems(nextUploads);
    setStudioForm((current) => ({
      ...current,
      referenceImages: referenceUploadStoragePaths(nextUploads),
    }));
  }

  function clearReferenceUploads() {
    releaseReferencePreviews(referenceUploadsRef.current);
    syncReferenceUploads([]);
  }

  function removeReferenceUpload(index: number) {
    const { nextUploads, removedUpload } = removeReferenceUploadAt(referenceUploadsRef.current, index);
    if (!removedUpload) return;
    releaseReferencePreview(removedUpload.previewUrl);
    syncReferenceUploads(nextUploads);
  }

  function replaceReferenceUploads(nextUploads: ReferenceUploadItem[]) {
    releaseReferencePreviews(referenceUploadsRef.current);
    setReferenceUploadItems(nextUploads);
  }

  function buildUploadsFromPaths(paths: string[]): ReferenceUploadItem[] {
    return buildReferenceUploadsFromPaths(paths);
  }

  useEffect(() => {
    return () => {
      releaseReferencePreviews(referenceUploadsRef.current);
      referenceUploadsRef.current = [];
    };
  }, []);

  return {
    buildUploadsFromPaths,
    clearReferenceUploads,
    referenceUploads,
    removeReferenceUpload,
    replaceReferenceUploads,
    syncReferenceUploads,
  };
}
