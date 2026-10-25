import { HttpChatTransport, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai";

import { buildApiUrl, getAuthHeaders } from "../../api";
import type { ChatSendAttachment } from "./chatAttachmentUtils";
import type { ChatSendReceipt } from "./chatSendLifecycle";
import {
  parseQmdhSseLine,
  type ChatTaskProposal,
  type ChatThinkingStep,
  type ChatToolCall,
  type QmdhSsePayload,
} from "./qmdhSseParser";
import { rememberChatCorrelationId } from "./chatTelemetry";
import { type ChatStreamError, formatStreamError } from "./types";

type SendMessagesOptions = Parameters<ChatTransport<UIMessage>["sendMessages"]>[0];

const TEXT_PART_ID = "assistant-text";
/** Coalesce tiny/fast deltas so React can paint between updates (AI SDK clones on every chunk). */
const DELTA_FLUSH_MS = 40;

export type ChatStreamMeta = {
  status?: string;
  label?: string;
  context?: QmdhSsePayload["context"];
  policy_version?: string;
  release_display_name?: string;
};

export type QmdhChatTransportOptions = {
  getConversationId: () => number | null;
  getAgentMode?: () => boolean;
  isMounted?: () => boolean;
  isCurrentSubmission?: (clientMessageId: string) => boolean;
  onSubmissionState?: (receipt: ChatSendReceipt) => void;
  onMeta?: (meta: ChatStreamMeta) => void;
  onToolCalls?: (toolCalls: ChatToolCall[]) => void;
  onTaskProposals?: (proposals: ChatTaskProposal[]) => void;
  onThinkingStep?: (step: ChatThinkingStep) => void;
  onPolicyVersion?: (policyVersion: string) => void;
  onAgentThinking?: () => void;
  onAgentProgress?: () => void;
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
  callbacks?: QmdhChatTransportOptions,
  onComplete?: (complete: boolean) => void,
  isCurrentSubmission?: () => boolean,
): ReadableStream<UIMessageChunk> {
  const getCallbacks = () => callbacks?.isMounted?.() === false || isCurrentSubmission?.() === false ? undefined : callbacks;
  const reader = stream.getReader();
  let readerReleased = false;
  const decoder = new TextDecoder();
  let completionReported = false;
  function reportCompletion(complete: boolean) {
    if (completionReported) return;
    completionReported = true;
    onComplete?.(complete);
  }

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      let buffer = "";
      let started = false;
      let finished = false;
      let protocolComplete = false;
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
        reportCompletion(protocolComplete);
        controller.close();
      };

      const ingestLine = async (line: string) => {
        const parsed = parseQmdhSseLine(line);
        if (parsed === "skip") {
          return;
        }
        if (parsed === "done") {
          protocolComplete = true;
          await emitFinish();
          return;
        }

        if (parsed.correlation_id) {
          rememberChatCorrelationId(parsed.correlation_id);
        }

        if (parsed.status || parsed.context || parsed.label || parsed.policy_version || parsed.release_display_name) {
          getCallbacks()?.onMeta?.({
            status: parsed.status,
            label: parsed.label,
            context: parsed.context,
            policy_version: parsed.policy_version,
            release_display_name: parsed.release_display_name,
          });
          if (
            parsed.status === "generating" ||
            parsed.status === "preparing" ||
            parsed.status === "compressing" ||
            parsed.status === "thinking" ||
            parsed.label
          ) {
            await ensureStarted();
          }
        }

        if (parsed.tool_calls?.length) {
          await ensureStarted();
          getCallbacks()?.onToolCalls?.(parsed.tool_calls);
        }
        if (parsed.task_proposals?.length) {
          await ensureStarted();
          getCallbacks()?.onTaskProposals?.(parsed.task_proposals);
        }
        if (parsed.thinking_step) {
          await ensureStarted();
          getCallbacks()?.onAgentThinking?.();
          getCallbacks()?.onThinkingStep?.(parsed.thinking_step);
        }
        if (parsed.policy_version) {
          getCallbacks()?.onPolicyVersion?.(parsed.policy_version);
        }
        if (parsed.status === "thinking") {
          await ensureStarted();
          getCallbacks()?.onAgentThinking?.();
        }

        if (parsed.delta) {
          getCallbacks()?.onAgentProgress?.();
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

          if (pendingDelta) {
            await sleep(DELTA_FLUSH_MS);
            await flushDelta(true);
          }
        }
      } catch (error) {
        reportCompletion(false);
        try {
          controller.error(error);
        } catch {
          // Stream may already be closed.
        }
      } finally {
        readerReleased = true;
        reader.releaseLock();
      }
    },
    cancel(reason) {
      reportCompletion(false);
      if (!readerReleased) return reader.cancel(reason);
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
  private readonly options: QmdhChatTransportOptions;

  constructor(options: QmdhChatTransportOptions) {
    super({
      api: buildApiUrl("/chat/conversations/0/messages"),
    });
    this.options = options;
  }

  setMetaHandler(onMeta?: (meta: ChatStreamMeta) => void) {
    this.options.onMeta = onMeta;
  }

  async sendMessages(options: SendMessagesOptions): Promise<ReadableStream<UIMessageChunk>> {
    const requestBody = options.body as { attachments?: ChatSendAttachment[]; agent_mode?: boolean;
      conversation_id?: number; client_message_id?: string; sdk_chat_id?: string } | undefined;
    const conversationId = requestBody?.conversation_id ?? this.options.getConversationId();
    const userMessage = [...options.messages].reverse().find(message => message.role === "user");
    const clientMessageId = userMessage?.id ?? "";
    const receipt = (kind: ChatSendReceipt["kind"], extra: Partial<ChatSendReceipt> = {}) => {
      if (conversationId != null && clientMessageId) this.options.onSubmissionState?.({ clientMessageId, conversationId, kind, ...extra });
    };
    const expectedChatId = requestBody?.sdk_chat_id ?? String(conversationId);
    const sdkParts = options.chatId.split(":");
    const sdkConversationId = Number(sdkParts.length >= 3 ? sdkParts[sdkParts.length - 2] : options.chatId);
    if (sdkConversationId !== conversationId || conversationId == null || !Number.isSafeInteger(conversationId) || conversationId <= 0 || options.chatId !== expectedChatId || (requestBody?.client_message_id && requestBody.client_message_id !== clientMessageId)) {
      receipt("not-sent");
      throw new Error("会话或发送身份已变化，本次尚未发送，请核对当前会话。");
    }
    const content = extractUserMessageContent(options.messages);
    const attachments = requestBody?.attachments ?? [];
    const agentMode = requestBody?.agent_mode ?? this.options.getAgentMode?.() ?? false;
    if (!content.trim() && attachments.length === 0) {
      receipt("not-sent");
      throw new Error("消息内容不能为空");
    }

    if (options.abortSignal?.aborted || (typeof navigator !== "undefined" && navigator.onLine === false)) {
      receipt("not-sent");
      throw new Error("当前离线或发送已取消，本次尚未发送。");
    }
    receipt("dispatch");
    const response = await fetch(buildApiUrl(`/chat/conversations/${conversationId}/messages`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...getAuthHeaders(),
        ...(options.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify({ content, attachments, agent_mode: agentMode }),
      credentials: "same-origin",
      signal: options.abortSignal,
      cache: "no-store",
    });

    if (!response.ok) {
      receipt("http-error", { status: response.status });
      throw new Error((await response.text()) || "Failed to fetch the chat response.");
    }
    function positiveId(value: string | null): number | null {
      const id = Number(value);
      return Number.isSafeInteger(id) && id > 0 ? id : null;
    }
    receipt("accepted", { userMessageId: positiveId(response.headers.get("X-QMDH-Chat-User-Message-ID")), turnId: positiveId(response.headers.get("X-QMDH-Chat-Turn-ID")) });
    rememberChatCorrelationId(response.headers.get("X-Request-ID"));
    if (!response.body) {
      throw new Error("The response body is empty.");
    }

    return parseQmdhSseStream(response.body, this.options, complete => receipt(complete ? "complete" : "incomplete"), () => this.options.isCurrentSubmission?.(clientMessageId) !== false);
  }

  protected processResponseStream(stream: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
    return parseQmdhSseStream(stream, this.options);
  }
}
