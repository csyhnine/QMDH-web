import { useCallback, useState } from "react";

import { api } from "../../api";
import type { ReferenceUploadItem, StudioFormState } from "./studioTypes";

type UseStudioPromptPolishOptions = {
  studioForm: StudioFormState;
  referenceUploads: ReferenceUploadItem[];
  onPromptChange: (value: string) => void;
};

export function useStudioPromptPolish({
  studioForm,
  referenceUploads,
  onPromptChange,
}: UseStudioPromptPolishOptions) {
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState("");

  const polishPrompt = useCallback(async () => {
    const prompt = studioForm.prompt.trim();
    if (!prompt) {
      setError("请先输入提示词。");
      return;
    }

    setPolishing(true);
    setError("");
    try {
      const referenceImages = referenceUploads
        .map((item) => item.storagePath?.trim())
        .filter((path): path is string => Boolean(path));
      const result = await api.polishPrompt({
        prompt,
        creation_mode: studioForm.creationMode,
        reference_images: referenceImages,
      });
      onPromptChange(result.polished_prompt.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "提示词润色失败");
    } finally {
      setPolishing(false);
    }
  }, [onPromptChange, referenceUploads, studioForm.creationMode, studioForm.prompt]);

  return { polishing, polishPrompt, error, clearError: () => setError("") };
}
