import { useCallback, useState } from "react";

import { api } from "../api";

type CreationMode = "generate" | "edit" | "video";

type UsePromptPolishOptions = {
  prompt: string;
  creationMode: CreationMode;
  referenceImages?: string[];
  sourceSurface?: "studio" | "canvas";
  onPromptChange: (value: string) => void;
  onPolished?: () => void;
};

export function usePromptPolish({
  prompt,
  creationMode,
  referenceImages = [],
  sourceSurface = "studio",
  onPromptChange,
  onPolished,
}: UsePromptPolishOptions) {
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState("");

  const polishPrompt = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("请先输入提示词。");
      return;
    }

    setPolishing(true);
    setError("");
    try {
      const result = await api.polishPrompt({
        prompt: trimmed,
        creation_mode: creationMode,
        reference_images: referenceImages.filter(Boolean),
        source_surface: sourceSurface,
      });
      onPromptChange(result.polished_prompt.trim());
      onPolished?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提示词润色失败");
    } finally {
      setPolishing(false);
    }
  }, [creationMode, onPolished, onPromptChange, prompt, referenceImages, sourceSurface]);

  return { polishing, polishPrompt, error, clearError: () => setError("") };
}
