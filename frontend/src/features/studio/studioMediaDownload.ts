/** Trigger a browser download for a media URL (generated image/video). */
export async function downloadMediaUrl(url: string, fileNameHint?: string): Promise<void> {
  const fileName = sanitizeDownloadFileName(fileNameHint || guessFileNameFromUrl(url));
  try {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`download failed with HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchorDownload(objectUrl, fileName);
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Cross-origin / CORS fallback: open the media so the user can save it.
    triggerAnchorDownload(url, fileName, true);
  }
}

function sanitizeDownloadFileName(raw: string): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ");
  if (!cleaned) return "generated-media.png";
  if (/\.[a-z0-9]{2,5}$/i.test(cleaned)) return cleaned;
  return `${cleaned}.png`;
}

function guessFileNameFromUrl(url: string): string {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const base = path.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(base) || "generated-media.png";
  } catch {
    return "generated-media.png";
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
