import { HttpChatTransport, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai";

import { buildApiUrl, getAuthHeaders } from "../../api";
import type { ChatSendAttachment } from "./chatAttachmentUtils";
import { parseQmdhSseLine } from "./qmdhSseParser";
import { type ChatStreamError, formatStreamError } from "./types";

type SendMessagesOptions = Parameters<ChatTransport<UIMessage>["sendMessages"]>[0];

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
  constructor(private readonly getConversationId: () => number | null) {
    super({
      api: buildApiUrl("/chat/conversations/0/messages"),
    });
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
        ...getAuthHeaders(),
        ...(options.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify({ content, attachments }),
      credentials: "same-origin",
      signal: options.abortSignal,
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
    return parseQmdhSseStream(stream);
  }
}
