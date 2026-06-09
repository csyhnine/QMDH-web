import type { Task } from "../../api";
import { truncateText } from "./studioFormatUtils";

export function taskHasReferenceImage(task: Task): boolean {
  return taskReferenceImageCount(task) > 0 || Boolean(task.result["reference_image_supplied"]);
}

export function taskReferenceImages(task: Task): string[] {
  const storagePaths = task.result["reference_image_storage_paths"];
  if (Array.isArray(storagePaths)) {
    return storagePaths
      .map((value) => String(value || "").trim())
      .filter((value) => Boolean(value))
      .slice(0, 4);
  }

  const storagePath = String(task.result["reference_image_storage_path"] ?? "").trim();
  return storagePath ? [storagePath] : [];
}

export function taskReferenceImageCount(task: Task): number {
  const referenceImages = taskReferenceImages(task);
  if (referenceImages.length > 0) {
    return referenceImages.length;
  }

  const rawCount = Number(task.result["reference_image_count"] ?? 0);
  if (Number.isFinite(rawCount) && rawCount > 0) {
    return rawCount;
  }
  return 0;
}

export function summarizeReferenceImageLabel(path: string): string {
  if (!path) return "已使用参考图";
  const normalized = path.split("?")[0]?.replace(/\\/g, "/") ?? path;
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments.length > 0 ? segments[segments.length - 1] : normalized;
  return truncateText(fileName || "已使用参考图", 24);
}
