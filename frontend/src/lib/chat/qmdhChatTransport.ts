import { HttpChatTransport, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai";

import { buildApiUrl, getAuthHeaders } from "../../api";
import type { ChatSendAttachment } from "./chatAttachmentUtils";
import { parseQmdhSseLine, type QmdhSsePayload } from "./qmdhSseParser";
import { type ChatStreamError, formatStreamError } from "./types";

type SendMessagesOptions = Parameters<ChatTransport<UIMessage>["sendMessages"]>[0];

const TEXT_PART_ID = "assistant-text";
/** Coalesce tiny/fast deltas so React can paint between updates (AI SDK clones on every chunk). */
const DELTA_FLUSH_MS = 40;

export type ChatStreamMeta = {
  status?: string;
  label?: string;
  context?: QmdhSsePayload["context"];
};

function yieldToRenderer(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Transform raw QMDH SSE bytes into AI SDK UIMessageChunk stream.
 * Uses a push pump (start) so status-only frames never stall the stream,
 * and coalesces text deltas so the UI can paint incrementally.
 */
function parseQmdhSseStream(
  stream: ReadableStream<Uint8Array>,
  onMeta?: (meta: ChatStreamMeta) => void,
): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let buffer = "";
      let started = false;
      let finished = false;
      let pendingDelta = "";
      let lastFlushAt = 0;

      const ensureStarted = async () => {
        if (started) {
          return;
        }
        started = true;
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "start-step" });
        controller.enqueue({ type: "text-start", id: TEXT_PART_ID });
        await yieldToRenderer();
      };

      const flushDelta = async (force = false) => {
        if (!pendingDelta) {
          return;
        }
        const now = Date.now();
        if (!force && now - lastFlushAt < DELTA_FLUSH_MS) {
          return;
        }
        const delta = pendingDelta;
        pendingDelta = "";
        lastFlushAt = now;
        await ensureStarted();
        controller.enqueue({ type: "text-delta", id: TEXT_PART_ID, delta });
        await yieldToRenderer();
      };

      const emitFinish = async () => {
        if (finished) {
          return;
        }
        finished = true;
        await flushDelta(true);
        if (started) {
          controller.enqueue({ type: "text-end", id: TEXT_PART_ID });
          controller.enqueue({ type: "finish-step" });
          controller.enqueue({ type: "finish" });
        }
        controller.close();
      };

      const ingestLine = async (line: string) => {
        const parsed = parseQmdhSseLine(line);
        if (parsed === "skip") {
          return;
        }
        if (parsed === "done") {
          await emitFinish();
          return;
        }

        if (parsed.status || parsed.context || parsed.label) {
          onMeta?.({
            status: parsed.status,
            label: parsed.label,
            context: parsed.context,
          });
          // Open the assistant bubble as soon as generation begins (before first token).
          if (parsed.status === "generating" || parsed.status === "preparing") {
            await ensureStarted();
          }
        }

        if (parsed.delta) {
          pendingDelta += parsed.delta;
          const now = Date.now();
          if (now - lastFlushAt >= DELTA_FLUSH_MS || pendingDelta.length >= 24) {
            await flushDelta(true);
          }
        }

        if (parsed.error) {
          await flushDelta(true);
          controller.enqueue({
            type: "error",
            errorText: formatStreamError(parsed.error as ChatStreamError | string),
          });
        }
      };

      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) {
            buffer += decoder.decode();
            if (buffer.trim()) {
              for (const line of `${buffer}\n`.split("\n")) {
                if (finished) {
                  break;
                }
                await ingestLine(line);
              }
            }
            await emitFinish();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (finished) {
              break;
            }
            await ingestLine(line);
          }

          // If tokens are arriving slower than the coalesce window, still flush periodically.
          if (pendingDelta) {
            await sleep(DELTA_FLUSH_MS);
            await flushDelta(true);
          }
        }
      } catch (error) {
        try {
          controller.error(error);
        } catch {
          // Stream may already be closed.
        }
      } finally {
        reader.releaseLock();
      }
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}

function extractUserMessageContent(messages: UIMessage[]): string {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return (
    lastUserMessage?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("") ?? ""
  );
}

export class QmdhChatTransport extends HttpChatTransport<UIMessage> {
  private onMeta?: (meta: ChatStreamMeta) => void;

  constructor(
    private readonly getConversationId: () => number | null,
    onMeta?: (meta: ChatStreamMeta) => void,
  ) {
    super({
      api: buildApiUrl("/chat/conversations/0/messages"),
    });
    this.onMeta = onMeta;
  }

  setMetaHandler(onMeta?: (meta: ChatStreamMeta) => void) {
    this.onMeta = onMeta;
  }

  async sendMessages(options: SendMessagesOptions): Promise<ReadableStream<UIMessageChunk>> {
    const conversationId = this.getConversationId();
    if (conversationId == null) {
      throw new Error("请先选择或创建会话");
    }

    const content = extractUserMessageContent(options.messages);
    const requestBody = options.body as { attachments?: ChatSendAttachment[] } | undefined;
    const attachments = requestBody?.attachments ?? [];
    if (!content.trim() && attachments.length === 0) {
      throw new Error("消息内容不能为空");
    }

    const response = await fetch(buildApiUrl(`/chat/conversations/${conversationId}/messages`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...getAuthHeaders(),
        ...(options.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify({ content, attachments }),
      credentials: "same-origin",
      signal: options.abortSignal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error((await response.text()) || "Failed to fetch the chat response.");
    }
    if (!response.body) {
      throw new Error("The response body is empty.");
    }

    return this.processResponseStream(response.body);
  }

  protected processResponseStream(stream: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
    return parseQmdhSseStream(stream, this.onMeta);
  }
}
