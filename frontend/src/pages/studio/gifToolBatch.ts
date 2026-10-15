import type { GifToolRequest, GifToolResult } from "../../api";
import { MAX_REFERENCE_UPLOAD_BYTES } from "../../utils/uploads";

export type GifJob = { status: "waiting" | "processing" | "done" | "error"; result?: GifToolResult; error?: string };
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;

export function gifParametersFromRecord(record: GifToolResult): Omit<GifToolRequest, "file_name" | "data_url"> {
  const saved = record.parameters ?? {};
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = saved[key];
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  return { target_kb: Math.round(number("target_kb", (record.compression.target_bytes ?? 500000) / 1000, 10, 20000)),
    max_edge: Math.round(number("max_edge", 344, 0, 8192)), max_fps: number("max_fps", 12.5, 0, 50),
    max_colors: Math.round(number("max_colors", 96, 4, 256)),
    allow_resize: typeof saved.allow_resize === "boolean" ? saved.allow_resize : true,
    allow_frame_reduction: typeof saved.allow_frame_reduction === "boolean" ? saved.allow_frame_reduction : true };
}

export async function restoreGifOriginal(record: GifToolResult, fetcher: typeof fetch = fetch): Promise<File> {
  const response = await fetcher(record.original_storage_path, { credentials: "include" });
  if (!response.ok) throw new Error("无法读取原始 GIF，请稍后重试。");
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_REFERENCE_UPLOAD_BYTES) throw new Error("原始 GIF 不能为空，且不能超过 20 MB。");
  const signature = await blob.slice(0, 6).text();
  if (signature !== "GIF87a" && signature !== "GIF89a") throw new Error("原始 GIF 无法读取，请重新上传原文件。");
  return new File([blob], record.file_name, { type: "image/gif" });
}

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
