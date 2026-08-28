import { usePromptPolish } from "../../lib/usePromptPolish";
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
  const referenceImages = referenceUploads
    .map((item) => item.storagePath?.trim())
    .filter((path): path is string => Boolean(path));

  return usePromptPolish({
    prompt: studioForm.prompt,
    creationMode: studioForm.creationMode,
    referenceImages,
    sourceSurface,
    onPromptChange,
    onPolished,
  });
}
