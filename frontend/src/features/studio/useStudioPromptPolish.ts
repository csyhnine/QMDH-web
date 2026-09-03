import { usePromptPolish } from "../../lib/usePromptPolish";
import { referenceUploadStoragePaths } from "./studioReferenceUtils";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";

type UseStudioPromptPolishOptions = {
  studioForm: StudioFormState;
  referenceUploads: ReferenceUploadItem[];
  onPromptChange: (value: string) => void;
  onPolished?: () => void;
  sourceSurface?: "studio" | "canvas";
};

export function useStudioPromptPolish({
  studioForm,
  referenceUploads,
  onPromptChange,
  onPolished,
  sourceSurface = "studio",
}: UseStudioPromptPolishOptions) {
  const referenceImages = referenceUploadStoragePaths(referenceUploads);

  return usePromptPolish({
    prompt: studioForm.prompt,
    creationMode: studioForm.creationMode,
    referenceImages,
    sourceSurface,
    onPromptChange,
    onPolished,
  });
}
