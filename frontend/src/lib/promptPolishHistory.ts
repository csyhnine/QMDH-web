export const MAX_PROMPT_POLISH_HISTORY = 5;

export type PromptPolishHistoryEntry = {
  id: string;
  polishedPrompt: string;
  sourcePrompt: string;
  createdAt: number;
};

export function createPromptPolishHistoryEntry(
  sourcePrompt: string,
  polishedPrompt: string
): PromptPolishHistoryEntry {
  return {
    id: crypto.randomUUID(),
    polishedPrompt: polishedPrompt.trim(),
    sourcePrompt: sourcePrompt.trim(),
    createdAt: Date.now(),
  };
}

export function appendPromptPolishHistory(
  history: PromptPolishHistoryEntry[],
  entry: PromptPolishHistoryEntry
): PromptPolishHistoryEntry[] {
  return [entry, ...history].slice(0, MAX_PROMPT_POLISH_HISTORY);
}

export function resolveActivePromptPolishHistoryId(
  history: PromptPolishHistoryEntry[],
  prompt: string
): string | null {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return null;
  }
  return history.find((entry) => entry.polishedPrompt === trimmed)?.id ?? null;
}

export function previewPromptText(text: string, maxLength = 28): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}…`;
}

export function previewPromptPolishHistoryEntry(entry: PromptPolishHistoryEntry): string {
  return previewPromptText(entry.polishedPrompt);
}
