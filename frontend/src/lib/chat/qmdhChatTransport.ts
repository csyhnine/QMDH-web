import { HttpChatTransport, type UIMessage, type UIMessageChunk } from "ai";

import { buildApiUrl, getAuthHeaders } from "../../api";
import type { ChatSendAttachment } from "./chatAttachmentUtils";
import { parseQmdhSseLine } from "./qmdhSseParser";
import { type ChatStreamError, formatStreamError } from "./types";

const TEXT_PART_ID = "assistant-text";

function parseQmdhSseStream(stream: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;
  let finished = false;

  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      const emitFinish = () => {
        if (started && !finished) {
          finished = true;
          controller.enqueue({ type: "text-end", id: TEXT_PART_ID });
          controller.enqueue({ type: "finish-step" });
          controller.enqueue({ type: "finish" });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          emitFinish();
          controller.close();
          return;
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
            emitFinish();
            controller.close();
            return;
          }
          if (parsed.delta) {
            if (!started) {
              controller.enqueue({ type: "start" });
              controller.enqueue({ type: "start-step" });
              controller.enqueue({ type: "text-start", id: TEXT_PART_ID });
              started = true;
            }
            controller.enqueue({ type: "text-delta", id: TEXT_PART_ID, delta: parsed.delta });
          }
          if (parsed.error) {
            controller.enqueue({
              type: "error",
              errorText: formatStreamError(parsed.error as ChatStreamError | string),
            });
          }
        }
      }
    },
  });
}

export class QmdhChatTransport extends HttpChatTransport<UIMessage> {
  constructor(
    getConversationId: () => number | null,
    private readonly consumePendingAttachments: () => ChatSendAttachment[],
  ) {
    super({
      api: buildApiUrl("/chat/conversations/0/messages"),
      prepareSendMessagesRequest: ({ messages }) => {
        const conversationId = getConversationId();
        if (conversationId == null) {
          throw new Error("请先选择或创建会话");
        }

        const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
        const content =
          lastUserMessage?.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("") ?? "";
        const attachments = consumePendingAttachments();
        if (!content.trim() && attachments.length === 0) {
          throw new Error("消息内容不能为空");
        }

        return {
          api: buildApiUrl(`/chat/conversations/${conversationId}/messages`),
          headers: {
            ...getAuthHeaders(),
            "Content-Type": "application/json",
          },
          body: { content, attachments },
        };
      },
    });
  }

  protected processResponseStream(stream: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
    return parseQmdhSseStream(stream);
  }
}
