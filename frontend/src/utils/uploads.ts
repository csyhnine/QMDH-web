export const MAX_REFERENCE_UPLOAD_BYTES = 10 * 1024 * 1024;

export function formatUploadSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const value = bytes / (1024 * 1024);
    return `${Number.isInteger(value) ? value : value.toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    const value = bytes / 1024;
    return `${Number.isInteger(value) ? value : value.toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function validateReferenceImageSize(file: File): string | null {
  if (file.size <= MAX_REFERENCE_UPLOAD_BYTES) {
    return null;
  }
  return `单张图片不能超过 ${formatUploadSize(MAX_REFERENCE_UPLOAD_BYTES)}。`;
}

export const MAX_CHAT_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function validateChatDocumentSize(file: File): string | null {
  if (file.size <= MAX_CHAT_DOCUMENT_BYTES) {
    return null;
  }
  return `单个文档不能超过 ${formatUploadSize(MAX_CHAT_DOCUMENT_BYTES)}。`;
}
