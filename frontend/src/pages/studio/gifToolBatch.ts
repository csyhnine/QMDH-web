import type { GifToolResult } from "../../api";
import { MAX_REFERENCE_UPLOAD_BYTES } from "../../utils/uploads";

export type GifJob = { status: "waiting" | "processing" | "done" | "error"; result?: GifToolResult; error?: string };
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;

export function validateGifBatch(files: readonly File[]): string {
  if (files.length > 20) return "一次最多选择 20 个 GIF。";
  if (files.some(file => !file.name.toLowerCase().endsWith(".gif") && file.type !== "image/gif")) return "请选择 GIF 文件。";
  if (files.some(file => !file.size || file.size > MAX_REFERENCE_UPLOAD_BYTES)) return "每个 GIF 不能为空，且不能超过 20 MB。";
  if (files.reduce((size, file) => size + file.size, 0) > MAX_BATCH_BYTES) return "一批文件总大小不能超过 100 MB。";
  return "";
}

/** Process one file at a time; a failed file must not discard other results. */
export async function runGifBatch<T>(files: readonly T[], process: (file: T) => Promise<GifToolResult>,
  update: (index: number, job: GifJob) => void, isActive: () => boolean) {
  for (let index = 0; index < files.length && isActive(); index++) {
    update(index, { status: "processing" });
    try {
      const result = await process(files[index]);
      if (isActive()) update(index, { status: "done", result });
    } catch (error) {
      if (isActive()) update(index, { status: "error", error: error instanceof Error ? error.message : "压缩失败，请重试。" });
    }
  }
}

export async function createGifZip(results: readonly GifToolResult[], fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = Object.create(null);
  let total = 0;
  for (const [index, result] of results.entries()) {
    const response = await fetcher(result.storage_path, { credentials: "include" });
    if (!response.ok) throw new Error(`下载 ${result.file_name} 失败，请稍后重试。`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    total += bytes.length;
    if (total > MAX_BATCH_BYTES) throw new Error("下载文件总大小超过 100 MB，请逐个下载。");
    const name = result.file_name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\.gif$/i, "");
    entries[`${index + 1}-${name}-compressed.gif`] = bytes;
  }
  return zipSync(entries, { level: 0 });
}
