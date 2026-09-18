import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import {
  appendPromptPolishHistory,
  createPromptPolishHistoryEntry,
  resolveActivePromptPolishHistoryId,
  type PromptPolishHistoryEntry,
} from "./promptPolishHistory";

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
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<PromptPolishHistoryEntry[]>([]);

  useEffect(() => {
    setHistory([]);
    setNotice("");
    setError("");
  }, [creationMode]);

  const activeHistoryId = useMemo(
    () => resolveActivePromptPolishHistoryId(history, prompt),
    [history, prompt]
  );

  const applyHistoryEntry = useCallback(
    (entryId: string) => {
      const entry = history.find((item) => item.id === entryId);
      if (!entry) {
        return;
      }
      onPromptChange(entry.polishedPrompt);
      onPolished?.();
      setError("");
      setNotice("");
    },
    [history, onPolished, onPromptChange]
  );

  const polishPrompt = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("请先输入提示词。");
      return;
    }

    setPolishing(true);
    setError("");
    setNotice("");
    try {
      const result = await api.polishPrompt({
        prompt: trimmed,
        creation_mode: creationMode,
        reference_images: referenceImages.filter(Boolean),
        source_surface: sourceSurface,
      });
      const polished = result.polished_prompt.trim();
      const entry = createPromptPolishHistoryEntry(trimmed, polished);
      setHistory((current) => appendPromptPolishHistory(current, entry));
      onPromptChange(polished);
      onPolished?.();
      if (result.reference_image_warning) {
        setNotice(result.reference_image_warning);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "提示词润色失败");
    } finally {
      setPolishing(false);
    }
  }, [creationMode, onPolished, onPromptChange, prompt, referenceImages, sourceSurface]);

  return {
    polishing,
    polishPrompt,
    error,
    notice,
    history,
    activeHistoryId,
    applyHistoryEntry,
    clearError: () => setError(""),
    clearNotice: () => setNotice(""),
  };
}
