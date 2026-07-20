import type { ChatStreamError } from "./types";

export type QmdhSsePayload = {
  delta?: string;
  error?: ChatStreamError | string;
  usage?: Record<string, number>;
  status?: string;
  label?: string;
  context?: {
    tokens?: number;
    window_tokens?: number;
    budget_tokens?: number;
    usage_percent?: number;
    compressed?: boolean;
    just_compressed?: boolean;
  };
};

export function parseQmdhSseLine(line: string): "skip" | "done" | QmdhSsePayload {
  if (!line.startsWith("data: ")) {
    return "skip";
  }
  const data = line.slice(6);
  if (data === "[DONE]") {
    return "done";
  }
  try {
    return JSON.parse(data) as QmdhSsePayload;
  } catch {
    return "skip";
  }
}
