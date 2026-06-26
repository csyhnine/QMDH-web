import {
  type ChangeEvent,
  type Dispatch,
  type DragEvent,
  type RefObject,
  type SetStateAction,
  useState,
} from "react";

import { api } from "../../api";
import {
  buildReferenceUploadTracker,
  prepareReferenceUploadFiles,
  shouldClearTransientReferenceTracker,
  uploadReferenceFiles,
} from "./studioReferenceUtils";
import type { StudioFormState, SubmissionTracker } from "./studioTypes";
import { useStudioReferenceUploadState } from "./useStudioReferenceUploadState";

type UseStudioReferenceUploadsOptions = {
  defaultTitle: string;
  fileInputRef: RefObject<HTMLInputElement | null>;
  maxReferenceCount?: number;
  onClearError: () => void;
  onError: (message: string) => void;
  selectedProviderName: string;
  setStudioForm: Dispatch<SetStateAction<StudioFormState>>;
  setSubmissionTracker: Dispatch<SetStateAction<SubmissionTracker | null>>;
  studioForm: StudioFormState;
};

export type StudioReferenceUploadState = ReturnType<typeof useStudioReferenceUploads>;

export function useStudioReferenceUploads({
  defaultTitle,
  fileInputRef,
  maxReferenceCount = 4,
  onClearError,
  onError,
  selectedProviderName,
  setStudioForm,
  setSubmissionTracker,
  studioForm,
}: UseStudioReferenceUploadsOptions) {
  const [uploadingReference, setUploadingReference] = useState(false);
  const referenceUploadState = useStudioReferenceUploadState({ setStudioForm });
  const { referenceUploads, syncReferenceUploads } = referenceUploadState;

  function resetReferenceFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearReferenceUpload() {
    setUploadingReference(false);
    referenceUploadState.clearReferenceUploads();
    resetReferenceFileInput();
  }

  async function handleReferenceFiles(files: File[]) {
    if (files.length === 0) {
      resetReferenceFileInput();
      return;
    }

    const { acceptedFiles, errors } = prepareReferenceUploadFiles(
      files,
      referenceUploads.length,
      maxReferenceCount
    );
    for (const message of errors) {
      onError(message);
    }
    if (acceptedFiles.length === 0) {
      resetReferenceFileInput();
      return;
    }

    setUploadingReference(true);
    setSubmissionTracker(buildReferenceUploadTracker({ defaultTitle, selectedProviderName, studioForm }));

    try {
      const uploadedItems = await uploadReferenceFiles(acceptedFiles, api.uploadReferenceImage);
      const nextUploads = [...referenceUploads, ...uploadedItems];
      syncReferenceUploads(nextUploads);
      onClearError();
    } catch (error) {
      onError(error instanceof Error ? error.message : "参考图上传失败");
    } finally {
      setUploadingReference(false);
      setSubmissionTracker((current) => (shouldClearTransientReferenceTracker(current) ? null : current));
      resetReferenceFileInput();
    }
  }

  function handleReferenceInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    void handleReferenceFiles(files);
  }

  function handleReferenceDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const files = event.dataTransfer.files ? Array.from(event.dataTransfer.files) : [];
    void handleReferenceFiles(files);
  }

  function openReferencePicker() {
    fileInputRef.current?.click();
  }

  return {
    buildUploadsFromPaths: referenceUploadState.buildUploadsFromPaths,
    clearReferenceUpload,
    handleReferenceDrop,
    handleReferenceInputChange,
    openReferencePicker,
    referenceUploads,
    removeReferenceUpload: referenceUploadState.removeReferenceUpload,
    replaceReferenceUploads: referenceUploadState.replaceReferenceUploads,
    uploadingReference,
  };
}
