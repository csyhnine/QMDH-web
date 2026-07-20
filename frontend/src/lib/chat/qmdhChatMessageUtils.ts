import type { UIMessage } from "ai";

import type { ChatThinkingStep, ChatToolCall } from "./qmdhSseParser";

export type QmdhChatAttachment = {
  file_name: string;
  mime_type: string;
  url: string;
  storage_path: string;
  kind: "image" | "file";
};

export type QmdhChatRecord = {
  id?: number;
  role: string;
  content: string;
  attachments?: QmdhChatAttachment[];
  agent_tool_calls?: ChatToolCall[];
  agent_thinking_steps?: ChatThinkingStep[];
  policy_version?: string | null;
  created_at?: string;
};

export type QmdhChatMessageMeta = {
  attachments: QmdhChatAttachment[];
  agentToolCalls: ChatToolCall[];
  agentThinkingSteps: ChatThinkingStep[];
  policyVersion: string | null;
};

export function toUiMessages(records: QmdhChatRecord[]): UIMessage[] {
  return records.map((record, index) => ({
    id: String(record.id ?? `${record.role}-${record.created_at ?? index}`),
    role: record.role as UIMessage["role"],
    parts: [{ type: "text" as const, text: record.content }],
    metadata: {
      attachments: record.attachments ?? [],
      agentToolCalls: record.agent_tool_calls ?? [],
      agentThinkingSteps: record.agent_thinking_steps ?? [],
      policyVersion: record.policy_version ?? null,
    } satisfies QmdhChatMessageMeta,
  }));
}

export function getUiMessageMetadata(message: UIMessage): QmdhChatMessageMeta {
  const metadata = message.metadata as Partial<QmdhChatMessageMeta> | undefined;
  if (!metadata || typeof metadata !== "object") {
    return { attachments: [], agentToolCalls: [], agentThinkingSteps: [], policyVersion: null };
  }
  return {
    attachments: Array.isArray(metadata.attachments) ? metadata.attachments : [],
    agentToolCalls: Array.isArray(metadata.agentToolCalls) ? metadata.agentToolCalls : [],
    agentThinkingSteps: Array.isArray(metadata.agentThinkingSteps) ? metadata.agentThinkingSteps : [],
    policyVersion: typeof metadata.policyVersion === "string" ? metadata.policyVersion : null,
  };
}

export function getUiMessageAttachments(message: UIMessage): QmdhChatAttachment[] {
  return getUiMessageMetadata(message).attachments;
}

export function getUiMessageAgentToolCalls(message: UIMessage): ChatToolCall[] {
  return getUiMessageMetadata(message).agentToolCalls;
}

export function getUiMessageAgentThinkingSteps(message: UIMessage): ChatThinkingStep[] {
  return getUiMessageMetadata(message).agentThinkingSteps;
}

export function getUiMessagePolicyVersion(message: UIMessage): string | null {
  return getUiMessageMetadata(message).policyVersion;
}

export function getUiMessageText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function getPersistedMessageId(message: UIMessage): number | null {
  const parsed = Number(message.id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}
