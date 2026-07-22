import { type ChangeEvent, type DragEvent, useRef, useState } from "react";

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

type UseChatAttachmentsOptions = {
  disabled?: boolean;
};

export function useChatAttachments(options: UseChatAttachmentsOptions = {}) {
  const disabled = options.disabled ?? false;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [attachments, setAttachments] = useState<ChatPendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  const readyCount = attachments.filter((item) => item.status === "ready").length;
  const uploadingCount = attachments.filter((item) => item.status === "uploading").length;

  function canAcceptFiles() {
    return !disabled && !uploading && attachments.length < MAX_CHAT_ATTACHMENTS;
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) {
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

    const failures: string[] = [];
    try {
      const results = await Promise.all(
        selectedFiles.map(async (file, index) => {
          const localId = pendingItems[index].localId;
          try {
            const uploaded = await uploadChatAttachmentFile(file);
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

      if (failures.length > 0) {
        const anyReady = results.some((item) => item.ok);
        setError(anyReady ? `部分附件上传失败：${failures[0]}` : failures[0]);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
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

  function clearAttachments() {
    releaseChatAttachmentPreviews(attachments);
    setAttachments([]);
    setError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function toSendPayload(): ChatSendAttachment[] {
    return attachments
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
    toSendPayload,
    canAddMore: attachments.length < MAX_CHAT_ATTACHMENTS,
  };
}
