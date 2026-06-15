import type { UIMessage } from "ai";

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
  created_at?: string;
};

export function toUiMessages(records: QmdhChatRecord[]): UIMessage[] {
  return records.map((record, index) => ({
    id: String(record.id ?? `${record.role}-${record.created_at ?? index}`),
    role: record.role as UIMessage["role"],
    parts: [{ type: "text" as const, text: record.content }],
    metadata: {
      attachments: record.attachments ?? [],
    },
  }));
}

export function getUiMessageAttachments(message: UIMessage): QmdhChatAttachment[] {
  const metadata = message.metadata;
  if (!metadata || !Array.isArray(metadata.attachments)) {
    return [];
  }
  return metadata.attachments as QmdhChatAttachment[];
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
