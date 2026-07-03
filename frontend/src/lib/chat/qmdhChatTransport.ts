import { HttpChatTransport, type ChatTransport, type UIMessage, type UIMessageChunk } from "ai";

import { buildApiUrl, getAuthHeaders } from "../../api";
import type { ChatSendAttachment } from "./chatAttachmentUtils";
import { parseQmdhSseLine, type ChatTaskProposal, type ChatThinkingStep, type ChatToolCall } from "./qmdhSseParser";
import { type ChatStreamError, formatStreamError } from "./types";

type SendMessagesOptions = Parameters<ChatTransport<UIMessage>["sendMessages"]>[0];

const TEXT_PART_ID = "assistant-text";

export type QmdhChatTransportOptions = {
  getConversationId: () => number | null;
  getAgentMode?: () => boolean;
  onToolCalls?: (toolCalls: ChatToolCall[]) => void;
  onTaskProposals?: (proposals: ChatTaskProposal[]) => void;
  onThinkingStep?: (step: ChatThinkingStep) => void;
  onAgentThinking?: () => void;
  onAgentProgress?: () => void;
  onPolicyVersion?: (policyVersion: string) => void;
};

function parseQmdhSseStream(
  stream: ReadableStream<Uint8Array>,
  callbacks?: {
    onToolCalls?: (toolCalls: ChatToolCall[]) => void;
    onTaskProposals?: (proposals: ChatTaskProposal[]) => void;
    onThinkingStep?: (step: ChatThinkingStep) => void;
    onAgentThinking?: () => void;
    onAgentProgress?: () => void;
    onPolicyVersion?: (policyVersion: string) => void;
  },
): ReadableStream<UIMessageChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let started = false;
  let finished = false;

  return new ReadableStream<UIMessageChunk>({
    async pull(controller) {
      const ensureStarted = () => {
        if (started) {
          return;
        }
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "start-step" });
        controller.enqueue({ type: "text-start", id: TEXT_PART_ID });
        started = true;
      };

      const emitFinish = () => {
        if (finished) {
          return;
        }
        finished = true;
        if (started) {
          controller.enqueue({ type: "text-end", id: TEXT_PART_ID });
          controller.enqueue({ type: "finish-step" });
        }
        controller.enqueue({ type: "finish" });
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
          if (parsed.tool_calls?.length) {
            ensureStarted();
            callbacks?.onToolCalls?.(parsed.tool_calls);
          }
          if (parsed.task_proposals?.length) {
            ensureStarted();
            callbacks?.onTaskProposals?.(parsed.task_proposals);
          }
          if (parsed.thinking_step) {
            ensureStarted();
            callbacks?.onAgentThinking?.();
            callbacks?.onThinkingStep?.(parsed.thinking_step);
          }
          if (parsed.policy_version) {
            callbacks?.onPolicyVersion?.(parsed.policy_version);
          }
          if (parsed.status === "thinking") {
            ensureStarted();
            callbacks?.onAgentThinking?.();
          }
          if (parsed.delta) {
            callbacks?.onAgentProgress?.();
            ensureStarted();
            controller.enqueue({ type: "text-delta", id: TEXT_PART_ID, delta: parsed.delta });
          }
          if (parsed.error) {
            ensureStarted();
            const errorText = formatStreamError(parsed.error as ChatStreamError | string);
            controller.enqueue({ type: "text-delta", id: TEXT_PART_ID, delta: errorText });
            controller.enqueue({
              type: "error",
              errorText,
            });
            emitFinish();
            controller.close();
            return;
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
  private readonly getConversationId: () => number | null;
  private readonly getAgentMode?: () => boolean;
  private readonly onToolCalls?: (toolCalls: ChatToolCall[]) => void;
  private readonly onTaskProposals?: (proposals: ChatTaskProposal[]) => void;
  private readonly onThinkingStep?: (step: ChatThinkingStep) => void;
  private readonly onAgentThinking?: () => void;
  private readonly onAgentProgress?: () => void;
  private readonly onPolicyVersion?: (policyVersion: string) => void;

  constructor(options: QmdhChatTransportOptions) {
    super({
      api: buildApiUrl("/chat/conversations/0/messages"),
    });
    this.getConversationId = options.getConversationId;
    this.getAgentMode = options.getAgentMode;
    this.onToolCalls = options.onToolCalls;
    this.onTaskProposals = options.onTaskProposals;
    this.onThinkingStep = options.onThinkingStep;
    this.onAgentThinking = options.onAgentThinking;
    this.onAgentProgress = options.onAgentProgress;
    this.onPolicyVersion = options.onPolicyVersion;
  }

  async sendMessages(options: SendMessagesOptions): Promise<ReadableStream<UIMessageChunk>> {
    const conversationId = this.getConversationId();
    if (conversationId == null) {
      throw new Error("请先选择或创建会话");
    }

    const content = extractUserMessageContent(options.messages);
    const requestBody = options.body as { attachments?: ChatSendAttachment[]; agent_mode?: boolean } | undefined;
    const attachments = requestBody?.attachments ?? [];
    const agentMode = requestBody?.agent_mode ?? this.getAgentMode?.() ?? false;
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
      body: JSON.stringify({ content, attachments, agent_mode: agentMode }),
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
    return parseQmdhSseStream(stream, {
      onToolCalls: this.onToolCalls,
      onTaskProposals: this.onTaskProposals,
      onThinkingStep: this.onThinkingStep,
      onAgentThinking: this.onAgentThinking,
      onAgentProgress: this.onAgentProgress,
      onPolicyVersion: this.onPolicyVersion,
    });
  }
}
