import { trackGenerationOutcome } from "./trackGenerationOutcome";

export type DownloadMediaKind = "video" | "image";

export type DownloadMediaOptions = {
  taskId?: number;
  assetId?: number;
  mediaKind?: DownloadMediaKind;
};

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "mkv"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"]);

/** Trigger a browser download for a media URL (generated image/video). */
export async function downloadMediaUrl(
  url: string,
  fileNameHint?: string,
  options?: DownloadMediaOptions
): Promise<void> {
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`download failed with HTTP ${response.status}`);
    }
    const contentType = response.headers.get("Content-Type") ?? undefined;
    const blob = await response.blob();
    const fileName = resolveDownloadFileName(
      fileNameHint,
      url,
      options?.mediaKind,
      contentType || blob.type
    );
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, fileName);
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Cross-origin / CORS fallback: open the media so the user can save it.
    const fileName = resolveDownloadFileName(fileNameHint, url, options?.mediaKind);
    triggerAnchorDownload(url, fileName, true);
  }
  if (options?.taskId) {
    trackGenerationOutcome(options.taskId, "downloaded", { assetId: options.assetId });
  }
}

function resolveDownloadFileName(
  fileNameHint: string | undefined,
  url: string,
  mediaKind?: DownloadMediaKind,
  contentType?: string
): string {
  const defaultExtension =
    extensionFromContentType(contentType) ||
    extensionFromUrl(url) ||
    defaultExtensionForKind(mediaKind);
  const rawBase = (fileNameHint || basenameFromUrl(url) || "generated-media").trim();
  const sanitized = sanitizeDownloadBaseName(rawBase);
  const existingExtension = extractExtension(sanitized);

  if (existingExtension) {
    if (mediaKind === "video" && IMAGE_EXTENSIONS.has(existingExtension)) {
      return `${stripExtension(sanitized)}.${defaultExtension}`;
    }
    if (mediaKind === "image" && VIDEO_EXTENSIONS.has(existingExtension)) {
      return `${stripExtension(sanitized)}.${defaultExtension}`;
    }
    return sanitized;
  }

  return `${sanitized}.${defaultExtension}`;
}

function sanitizeDownloadBaseName(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ");
}

function extractExtension(fileName: string): string | null {
  const match = fileName.match(/\.([a-z0-9]{2,5})$/i);
  return match ? match[1].toLowerCase() : null;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{2,5}$/i, "");
}

function defaultExtensionForKind(mediaKind?: DownloadMediaKind): string {
  return mediaKind === "video" ? "mp4" : "png";
}

function extensionFromUrl(url: string): string | null {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const extension = extractExtension(decodeURIComponent(path.split("/").filter(Boolean).pop() || ""));
    return extension && (VIDEO_EXTENSIONS.has(extension) || IMAGE_EXTENSIONS.has(extension)) ? extension : null;
  } catch {
    return null;
  }
}

function extensionFromContentType(contentType?: string): string | null {
  const normalized = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("video/")) {
    if (normalized.includes("webm")) return "webm";
    if (normalized.includes("quicktime")) return "mov";
    return "mp4";
  }
  if (normalized.startsWith("image/")) {
    const subtype = normalized.split("/", 2)[1];
    if (subtype === "jpeg") return "jpg";
    if (subtype && IMAGE_EXTENSIONS.has(subtype)) return subtype;
    return "png";
  }
  return null;
}

function basenameFromUrl(url: string): string {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const base = path.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(base);
  } catch {
    return "";
  }
}

function triggerAnchorDownload(href: string, fileName: string, openTab = false): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  if (openTab) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
