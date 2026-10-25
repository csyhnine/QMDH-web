import { type ChangeEvent, type DragEvent, useEffect, useRef, useState } from "react";

import {
  CHAT_FILE_ACCEPT,
  MAX_CHAT_ATTACHMENTS,
  type ChatPendingAttachment,
  type ChatSendAttachment,
  createChatAttachmentLocalId,
  detectChatAttachmentKind,
  releaseChatAttachmentPreviews,
  uploadChatAttachmentFile,
  yieldToBrowserPaint,
} from "./chatAttachmentUtils";
import { reportChatTelemetry } from "./chatTelemetry";

type UseChatAttachmentsOptions = {
  disabled?: boolean;
  conversationId?: number | null;
};

export function useChatAttachments(options: UseChatAttachmentsOptions = {}) {
  const disabled = options.disabled ?? false;
  const conversationId = options.conversationId ?? null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [attachments, setAttachmentState] = useState<ChatPendingAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const mounted = useRef(true);
  function setAttachments(update: ChatPendingAttachment[] | ((current: ChatPendingAttachment[]) => ChatPendingAttachment[])) {
    if (!mounted.current) return;
    const next = typeof update === "function" ? update(attachmentsRef.current) : update;
    attachmentsRef.current = next;
    setAttachmentState(next);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseChatAttachmentPreviews(attachmentsRef.current);
      attachmentsRef.current = [];
    };
  }, []);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  const readyCount = attachments.filter((item) => item.status === "ready").length;
  const uploadingCount = attachments.filter((item) => item.status === "uploading").length;

  function canAcceptFiles() {
    return !disabled && !uploading && attachments.length < MAX_CHAT_ATTACHMENTS;
  }

  async function addFiles(files: File[]) {
    if (!mounted.current || files.length === 0) {
      return;
    }

    const supportedFiles = files.filter((file) => detectChatAttachmentKind(file) !== null);
    if (supportedFiles.length !== files.length) {
      setError("仅支持图片，或 PDF / TXT / MD / JSON / CSV 文档。");
    }
    if (supportedFiles.length === 0) {
      return;
    }

    const remainingSlots = MAX_CHAT_ATTACHMENTS - attachments.length;
    if (remainingSlots <= 0) {
      setError(`最多只能添加 ${MAX_CHAT_ATTACHMENTS} 个附件。`);
      return;
    }

    const selectedFiles = supportedFiles.slice(0, remainingSlots);
    const pendingItems: ChatPendingAttachment[] = selectedFiles.map((file) => {
      const kind = detectChatAttachmentKind(file) ?? "file";
      return {
        localId: createChatAttachmentLocalId(),
        fileName: file.name,
        previewUrl: kind === "image" ? URL.createObjectURL(file) : "",
        storagePath: "",
        mimeType: file.type || "",
        kind,
        status: "uploading",
      };
    });

    setUploading(true);
    setError("");
    setAttachments((current) => [...current, ...pendingItems]);
    await yieldToBrowserPaint();
    if (!mounted.current) return;

    const failures: string[] = [];
    try {
      const results = await Promise.all(
        selectedFiles.map(async (file, index) => {
          const localId = pendingItems[index].localId;
          reportChatTelemetry({
            event: "chat.attachment.upload.start",
            detail: `${file.name} (${file.size}B)`,
            conversation_id: conversationId,
          });
          try {
            const uploaded = await uploadChatAttachmentFile(file);
            reportChatTelemetry({
              event: "chat.attachment.upload.success",
              detail: `${uploaded.file_name} (${file.size}B)`,
              conversation_id: conversationId,
            });
            setAttachments((current) =>
              current.map((item) =>
                item.localId === localId
                  ? {
                      ...item,
                      fileName: uploaded.file_name,
                      storagePath: uploaded.storage_path,
                      mimeType: uploaded.mime_type,
                      kind: uploaded.kind,
                      status: "ready",
                    }
                  : item,
              ),
            );
            return { localId, ok: true as const };
          } catch (err) {
            const message = err instanceof Error ? err.message : "上传附件失败";
            reportChatTelemetry({
              event: "chat.attachment.upload.error",
              detail: `${file.name}: ${message}`.slice(0, 500),
              conversation_id: conversationId,
            });
            failures.push(message);
            setAttachments((current) => {
              const target = current.find((item) => item.localId === localId);
              if (target) {
                releaseChatAttachmentPreviews([target]);
              }
              return current.filter((item) => item.localId !== localId);
            });
            return { localId, ok: false as const };
          }
        }),
      );

      if (mounted.current && failures.length > 0) {
        const anyReady = results.some((item) => item.ok);
        setError(anyReady ? `部分附件上传失败：${failures[0]}` : failures[0]);
      }
    } finally {
      if (mounted.current) setUploading(false);
      if (mounted.current && fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(event.target.files || []));
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canAcceptFiles()) {
      return;
    }
    dragDepthRef.current += 1;
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (canAcceptFiles()) {
      event.dataTransfer.dropEffect = "copy";
    } else {
      event.dataTransfer.dropEffect = "none";
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);
    if (!canAcceptFiles()) {
      if (disabled) {
        setError("当前无法上传附件。");
      }
      return;
    }
    void addFiles(Array.from(event.dataTransfer.files || []));
  }

  function removeAttachment(index: number) {
    setAttachments((current) => {
      const target = current[index];
      if (target) {
        releaseChatAttachmentPreviews([target]);
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function getAttachments(): ChatPendingAttachment[] {
    return attachmentsRef.current.map(item => ({ ...item }));
  }
  function takeAttachments(localIds: string[]): ChatPendingAttachment[] {
    const selected = new Set(localIds);
    const taken = attachmentsRef.current.filter(item => selected.has(item.localId));
    setAttachments(current => current.filter(item => !selected.has(item.localId)));
    return taken.map(item => ({ ...item }));
  }
  function restoreAttachments(items: ChatPendingAttachment[]): boolean {
    const existing = new Set(attachmentsRef.current.map(item => item.localId));
    const added = items.filter(item => !existing.has(item.localId));
    if (attachmentsRef.current.length + added.length > MAX_CHAT_ATTACHMENTS) return false;
    setAttachments(current => [...current, ...added.map(item => ({ ...item }))]);
    return true;
  }
  function clearAttachments(localIds?: string[]) {
    const selected = localIds ? new Set(localIds) : null;
    setAttachments(current => {
      releaseChatAttachmentPreviews(current.filter(item => !selected || selected.has(item.localId)));
      return selected ? current.filter(item => !selected.has(item.localId)) : [];
    });
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toSendPayload(): ChatSendAttachment[] {
    return attachmentsRef.current
      .filter((item) => item.status === "ready" && item.storagePath)
      .map((item) => ({
        storage_path: item.storagePath,
        file_name: item.fileName,
        mime_type: item.mimeType,
        kind: item.kind,
      }));
  }

  return {
    attachments,
    uploading,
    uploadingCount,
    readyCount,
    isDragging,
    error,
    fileInputRef,
    accept: CHAT_FILE_ACCEPT,
    setError,
    handleFileInputChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    removeAttachment,
    clearAttachments,
    getAttachments,
    takeAttachments,
    restoreAttachments,
    toSendPayload,
    canAddMore: attachments.length < MAX_CHAT_ATTACHMENTS,
  };
}
