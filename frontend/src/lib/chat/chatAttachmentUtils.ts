import { api } from "../../api";
import { validateChatDocumentSize, validateReferenceImageSize } from "../../utils/uploads";

export const MAX_CHAT_ATTACHMENTS = 4;

export const CHAT_FILE_ACCEPT =
  "image/*,.pdf,.txt,.md,.json,.csv,.docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ChatAttachmentKind = "image" | "file";

export type ChatPendingAttachment = {
  localId: string;
  fileName: string;
  previewUrl: string;
  storagePath: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  status: "uploading" | "ready";
};

export type ChatSendAttachment = {
  storage_path: string;
  file_name: string;
  mime_type: string;
  kind: ChatAttachmentKind;
};

const DOCUMENT_EXTENSIONS = new Set(["pdf", "txt", "md", "json", "csv", "docx", "xlsx"]);

export function detectChatAttachmentKind(file: File): ChatAttachmentKind | null {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  const extension = file.name.toLowerCase().split(".").pop() || "";
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return "file";
  }
  return null;
}

export function createChatAttachmentLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Yield so React can paint "uploading" UI before heavy FileReader / JSON work. */
export function yieldToBrowserPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  return new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`读取文件失败：${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function uploadChatAttachmentFile(file: File): Promise<ChatSendAttachment> {
  const kind = detectChatAttachmentKind(file);
  if (!kind) {
    throw new Error(`${file.name}: 不支持的文件类型。`);
  }

  const sizeError = kind === "image" ? validateReferenceImageSize(file) : validateChatDocumentSize(file);
  if (sizeError) {
    throw new Error(`${file.name}: ${sizeError}`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  const uploaded = await api.uploadChatAttachment({
    file_name: file.name,
    data_url: dataUrl,
  });

  return {
    storage_path: uploaded.storage_path,
    file_name: uploaded.file_name,
    mime_type: uploaded.mime_type,
    kind: uploaded.kind,
  };
}

export function releaseChatAttachmentPreviews(items: ChatPendingAttachment[]) {
  for (const item of items) {
    if (item.kind === "image" && item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}
