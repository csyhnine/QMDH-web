import { useMemo } from "react";
import { useAuth } from "../../context/AuthContext";
import { promptDraftFamily, type PromptPolishApplyOptions } from "../../lib/promptPolishOwnership";
import { usePromptPolish } from "../../lib/usePromptPolish";
import { referenceUploadStoragePaths } from "./studioReferenceUtils";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";

type UseStudioPromptPolishOptions = {
  studioForm: StudioFormState;
  referenceUploads: ReferenceUploadItem[];
  onPromptChange: (value: string, application?: PromptPolishApplyOptions<StudioFormState>) => void;
  onPolished?: () => void;
  sourceSurface?: "studio" | "canvas";
};

export function useStudioPromptPolish({
  studioForm,
  referenceUploads,
  onPromptChange,
  sourceSurface = "studio",
}: UseStudioPromptPolishOptions) {
  const referenceImages = referenceUploadStoragePaths(referenceUploads);
  const { currentUser } = useAuth();
  const family = promptDraftFamily(studioForm);
  const sourceKey = useMemo(() => ({ owner: currentUser, family }), [currentUser, family]);

  return usePromptPolish({
    prompt: studioForm.prompt,
    creationMode: studioForm.creationMode,
    referenceImages,
    sourceSurface,
    onPromptChange,
    sourceKey,
    draftIdentity: studioForm,
    onApply: (value, polished, isCurrent) => onPromptChange(value, { expected: studioForm, polished, isCurrent }),
  });
}
