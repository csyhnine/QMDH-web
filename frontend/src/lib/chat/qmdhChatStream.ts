import { parseQmdhSseLine } from "./qmdhSseParser";
import type { ChatStreamError } from "./types";

export type QmdhChatStreamHandlers = {
  onDelta: (delta: string) => void;
  onError: (error: ChatStreamError | string) => void;
  onUsage?: (usage: Record<string, number>) => void;
};

export async function consumeQmdhChatStream(response: Response, handlers: QmdhChatStreamHandlers): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("聊天响应流不可用");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const parsed = parseQmdhSseLine(line);
      if (parsed === "skip") {
        continue;
      }
      if (parsed === "done") {
        return;
      }
      if (parsed.delta) {
        handlers.onDelta(parsed.delta);
      }
      if (parsed.error) {
        handlers.onError(parsed.error);
      }
      if (parsed.usage && handlers.onUsage) {
        handlers.onUsage(parsed.usage);
      }
    }
  }
}
