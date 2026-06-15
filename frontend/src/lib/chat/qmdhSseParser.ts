import type { ChatStreamError } from "./types";

export type QmdhSsePayload = {
  delta?: string;
  error?: ChatStreamError | string;
  usage?: Record<string, number>;
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
